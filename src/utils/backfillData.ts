/**
 * Data Backfill Script
 * 
 * This script fixes data inconsistencies identified in the /api/me/overview analysis:
 * 1. Adds role: "AGENT" to users with agentProfile but missing role
 * 2. Backfills userId in PaymentTransactions from orderId
 * 3. Creates deeds for existing paid orders that are missing deeds
 * 4. Optionally migrates UserLands to new schema (state/place instead of stateKey/areaKey)
 * 
 * Run this script once to fix existing data.
 * It's safe to run multiple times (idempotent).
 */

// Load environment variables FIRST (before any mongoose imports)
import 'dotenv/config';

import mongoose from 'mongoose';
import User from '../models/User.model';
import Order from '../models/Order.model';
import PaymentTransaction from '../models/PaymentTransaction.model';
import Deed from '../models/Deed.model';
import UserLand from '../models/UserLand.model';
import LandSlot from '../models/LandSlot.model';
import { connectMongoDB } from '../config/mongodb';

/**
 * Fix 1: Add role: "AGENT" to users with agentProfile but missing role
 */
const fixUserRoles = async (): Promise<void> => {
  console.log('📝 Fixing user roles...');
  
  // Find users with agentProfile but missing or incorrect role
  const usersToFix = await User.find({
    $or: [
      { agentProfile: { $exists: true, $ne: null }, role: { $ne: 'AGENT' } },
      { agentProfile: { $exists: true, $ne: null }, role: { $exists: false } },
    ],
  });
  
  let fixed = 0;
  
  for (const user of usersToFix) {
    // Only update if user has agentProfile but is not AGENT or ADMIN
    if (user.agentProfile && user.role !== 'AGENT' && user.role !== 'ADMIN') {
      await User.updateOne(
        { _id: user._id },
        { $set: { role: 'AGENT' } }
      );
      fixed++;
      console.log(`  ✅ Set role to AGENT for user: ${user.email || user._id}`);
    }
  }
  
  console.log(`✅ Fixed ${fixed} user roles`);
};

/**
 * Fix 2: Backfill userId in PaymentTransactions from orderId
 */
const backfillPaymentTransactionUserIds = async (): Promise<void> => {
  console.log('📝 Backfilling PaymentTransaction userId fields...');
  
  // Find all PaymentTransactions missing userId
  const paymentsWithoutUserId = await PaymentTransaction.find({
    userId: { $exists: false },
  });
  
  let fixed = 0;
  let skipped = 0;
  
  for (const payment of paymentsWithoutUserId) {
    // Get order to extract userId
    const order = await Order.findById(payment.orderId);
    
    if (!order) {
      console.warn(`  ⚠️  Order not found for payment: ${payment._id}`);
      skipped++;
      continue;
    }
    
    if (!order.userId) {
      console.warn(`  ⚠️  Order missing userId for payment: ${payment._id}`);
      skipped++;
      continue;
    }
    
    // Update payment with userId
    await PaymentTransaction.updateOne(
      { _id: payment._id },
      { $set: { userId: order.userId } }
    );
    
    fixed++;
  }
  
  console.log(`✅ Backfilled ${fixed} PaymentTransaction userId fields (skipped ${skipped})`);
};

/**
 * Fix 3: Create deeds for existing paid orders that are missing deeds
 */
const createMissingDeeds = async (): Promise<void> => {
  console.log('📝 Creating missing deeds for paid orders...');
  
  // Find all PAID orders
  const paidOrders = await Order.find({ status: 'PAID' });
  
  let created = 0;
  let skipped = 0;
  let errors = 0;
  
  for (const order of paidOrders) {
    // Get payment transaction hash (from order or PaymentTransaction)
    const paymentTxHash = 
      order.payment?.txHash || 
      order.txHash || 
      null;
    
    if (!paymentTxHash) {
      console.warn(`  ⚠️  Order ${order._id} has no payment transaction hash, skipping deed creation`);
      skipped++;
      continue;
    }
    
    // Get user for owner name
    const user = await User.findById(order.userId);
    const ownerName = user?.name || 'Unknown';
    
    // Get paidAt timestamp
    const paidAt = order.payment?.paidAt || order.paidAt || order.createdAt;
    
    // Get ledger address (usdtAddress)
    const ledgerAddress = order.usdtAddress;
    
    // Process each land slot in the order
    for (const landSlotId of order.landSlotIds) {
      // Check if deed already exists (idempotent)
      const existingDeed = await Deed.findOne({ landSlotId });
      
      if (existingDeed) {
        skipped++;
        continue;
      }
      
      // Get land slot details
      const landSlot = await LandSlot.findOne({ landSlotId });
      
      if (!landSlot) {
        console.warn(`  ⚠️  Land slot not found: ${landSlotId}, skipping deed creation`);
        errors++;
        continue;
      }
      
      try {
        // Generate seal number (unique identifier for deed)
        // Format: WT-{LAND_SLOT_ID}-{TIMESTAMP}
        const sealNo = `WT-${landSlotId.toUpperCase().replace(/_/g, '-')}-${Date.now()}`;
        
        // Create deed with required fields
        const deed = new Deed({
          userId: order.userId,
          propertyId: landSlot._id,
          landSlotId: landSlot.landSlotId,
          orderId: order._id,
          paymentTxHash: paymentTxHash.trim(),
          ownerName: ownerName,
          plotId: landSlot.landSlotId, // Use landSlotId as plotId
          city: landSlot.areaName || landSlot.areaKey, // Use area name as city
            latitude: landSlot.latitude || 0, // Get from LandSlot
            longitude: landSlot.longitude || 0, // Get from LandSlot
          nft: {
            tokenId: `NFT-${landSlot.landSlotId}`, // Placeholder - should be generated when NFT is minted
            contractAddress: process.env.NFT_CONTRACT_ADDRESS || 'TBD', // Should be set in env
            blockchain: 'TRON', // Default blockchain
            standard: 'TRC721', // NFT standard
          },
          payment: {
            transactionId: paymentTxHash.trim(),
            receiver: ledgerAddress,
          },
          issuedAt: paidAt,
          sealNo: sealNo,
        });
        
        await deed.save();
        created++;
        console.log(`  ✅ Created deed for landSlotId: ${landSlotId}`);
      } catch (error: any) {
        // Handle duplicate seal number or other errors
        if (error.code === 11000) {
          console.warn(`  ⚠️  Duplicate deed detected for ${landSlotId}, skipping`);
          skipped++;
        } else {
          console.error(`  ❌ Error creating deed for ${landSlotId}:`, error.message);
          errors++;
        }
      }
    }
  }
  
  console.log(`✅ Created ${created} deeds (skipped ${skipped} existing, ${errors} errors)`);
};

/**
 * Fix 4: Optionally migrate UserLands to new schema
 * Migrates stateKey/areaKey/purchasedAt to state/place/acquiredAt
 */
const migrateUserLands = async (): Promise<void> => {
  console.log('📝 Migrating UserLands to new schema...');
  
  // Find UserLands with legacy fields but missing new fields
  const userLandsToMigrate = await UserLand.find({
    $or: [
      { state: { $exists: false }, stateKey: { $exists: true } },
      { place: { $exists: false }, areaKey: { $exists: true } },
      { acquiredAt: { $exists: false }, purchasedAt: { $exists: true } },
      { paymentTxHash: { $exists: false } },
    ],
  });
  
  let migrated = 0;
  let skipped = 0;
  
  for (const userLand of userLandsToMigrate) {
    const updateData: any = {};
    let needsUpdate = false;
    
    // Migrate stateKey -> state
    if (!userLand.state && userLand.stateKey) {
      updateData.state = userLand.stateKey;
      needsUpdate = true;
    }
    
    // Migrate areaKey -> place
    if (!userLand.place && userLand.areaKey) {
      updateData.place = userLand.areaKey;
      needsUpdate = true;
    }
    
    // Migrate purchasedAt -> acquiredAt
    if (!userLand.acquiredAt && userLand.purchasedAt) {
      updateData.acquiredAt = userLand.purchasedAt;
      needsUpdate = true;
    }
    
    // Backfill paymentTxHash from order if missing
    if (!userLand.paymentTxHash && userLand.orderId) {
      const order = await Order.findById(userLand.orderId);
      if (order) {
        const txHash = order.payment?.txHash || order.txHash;
        if (txHash) {
          updateData.paymentTxHash = txHash;
          needsUpdate = true;
        }
      }
    }
    
    if (needsUpdate) {
      await UserLand.updateOne(
        { _id: userLand._id },
        { $set: updateData }
      );
      migrated++;
    } else {
      skipped++;
    }
  }
  
  console.log(`✅ Migrated ${migrated} UserLand records (skipped ${skipped} already migrated)`);
};

/**
 * Main function to run all backfills
 */
const main = async (): Promise<void> => {
  try {
    console.log('🚀 Starting data backfill...\n');
    
    // Connect to MongoDB
    await connectMongoDB();
    
    // Run backfills
    await fixUserRoles();
    console.log('');
    
    await backfillPaymentTransactionUserIds();
    console.log('');
    
    await migrateUserLands();
    console.log('');
    
    await createMissingDeeds();
    console.log('');
    
    console.log('✅ Data backfill completed successfully!');
    console.log('\n📊 Summary:');
    console.log('  - User roles fixed');
    console.log('  - PaymentTransaction userId fields backfilled');
    console.log('  - UserLands migrated to new schema');
    console.log('  - Missing deeds created for paid orders');
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Backfill failed:', error);
    process.exit(1);
  } finally {
    await mongoose.connection.close();
  }
};

// Run backfill if called directly
if (require.main === module) {
  main();
}

export default main;

