/**
 * Database Migration Script
 * 
 * This script migrates existing data to the new schema structure:
 * 1. Generates referral codes for existing users
 * 2. Migrates Order fields to nested structures
 * 3. Backfills LandSlot ownership from PAID orders
 * 4. Creates UserLand records for existing purchases
 * 
 * Run this script once after deploying the new models.
 * It's safe to run multiple times (idempotent).
 */

// Load environment variables FIRST (before any mongoose imports)
import 'dotenv/config';

import User from '../models/User.model';
import Order from '../models/Order.model';
import LandSlot from '../models/LandSlot.model';
import UserLand from '../models/UserLand.model';
import { connectMongoDB } from '../config/mongodb';

const generateReferralCode = (): string => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Exclude ambiguous chars
  let code = '';
  for (let i = 0; i < 8; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
};

const migrateUsers = async (): Promise<void> => {
  console.log('📝 Migrating Users...');
  
  const users = await User.find({});
  let migrated = 0;
  
  for (const user of users) {
    let needsUpdate = false;
    const updateData: any = {};
    
    // Generate referral code if missing
    if (!user.referralCode) {
      let code: string;
      let isUnique = false;
      
      while (!isUnique) {
        code = generateReferralCode();
        const existing = await User.findOne({ referralCode: code });
        if (!existing) {
          isUnique = true;
          updateData.referralCode = code;
          needsUpdate = true;
        }
      }
    }
    
    // Initialize referralStats if missing
    if (!user.referralStats) {
      updateData.referralStats = {
        totalReferrals: 0,
        totalEarningsUSDT: '0',
      };
      needsUpdate = true;
    }
    
    if (needsUpdate) {
      await User.updateOne({ _id: user._id }, { $set: updateData });
      migrated++;
    }
  }
  
  console.log(`✅ Migrated ${migrated} users`);
};

const migrateOrders = async (): Promise<void> => {
  console.log('📝 Migrating Orders...');
  
  const orders = await Order.find({});
  let migrated = 0;
  
  for (const order of orders) {
    let needsUpdate = false;
    const updateData: any = {};
    
    // Migrate to nested payment structure if not already done
    if (!order.payment || !order.payment.expectedAmountUSDT) {
      updateData.payment = {
        expectedAmountUSDT: order.expectedAmountUSDT || order.payment?.expectedAmountUSDT || '0',
        paidAmountUSDT: order.payment?.paidAmountUSDT || null,
        overpaidAmountUSDT: order.overpaidAmountUSDT || order.payment?.overpaidAmountUSDT || null,
        txHash: order.txHash || order.payment?.txHash || null,
        confirmations: order.confirmations !== undefined ? order.confirmations : (order.payment?.confirmations || 0),
        paidAt: order.paidAt || order.payment?.paidAt || null,
      };
      needsUpdate = true;
    }
    
    // Migrate to nested expiry structure if not already done
    if (!order.expiry || !order.expiry.expiresAt) {
      updateData.expiry = {
        expiresAt: order.expiresAt || order.expiry?.expiresAt || new Date(),
        expiredAt: order.expiry?.expiredAt || null,
      };
      needsUpdate = true;
    }
    
    // Initialize referral structure if not present (but don't populate if no referral)
    if (!order.referral) {
      updateData.referral = {
        referrerId: null,
        commissionRate: null,
        commissionAmountUSDT: null,
      };
      needsUpdate = true;
    }
    
    if (needsUpdate) {
      await Order.updateOne({ _id: order._id }, { $set: updateData });
      migrated++;
    }
  }
  
  console.log(`✅ Migrated ${migrated} orders`);
};

const backfillLandSlotOwnership = async (): Promise<void> => {
  console.log('📝 Backfilling LandSlot ownership from PAID orders...');
  
  // Find all PAID orders
  const paidOrders = await Order.find({ status: 'PAID' });
  let backfilled = 0;
  
  for (const order of paidOrders) {
    const paidAt = order.paidAt || order.payment?.paidAt || order.createdAt;
    
    // Update each land slot in the order
    for (const landSlotId of order.landSlotIds) {
      const landSlot = await LandSlot.findOne({ landSlotId });
      
      if (landSlot && landSlot.status !== 'SOLD') {
        // Only update if not already SOLD (to avoid overwriting newer ownership)
        await LandSlot.updateOne(
          { landSlotId },
          {
            $set: {
              status: 'SOLD',
              ownerId: order.userId,
              ownedAt: paidAt,
              // Clear lock fields
              lockedBy: null,
              lockExpiresAt: null,
            },
          }
        );
        backfilled++;
      }
    }
  }
  
  console.log(`✅ Backfilled ownership for ${backfilled} land slots`);
};

const createUserLandRecords = async (): Promise<void> => {
  console.log('📝 Creating UserLand records from PAID orders...');
  
  // Find all PAID orders
  const paidOrders = await Order.find({ status: 'PAID' });
  let created = 0;
  let skipped = 0;
  
  for (const order of paidOrders) {
    const paidAt = order.paidAt || order.payment?.paidAt || order.createdAt;
    const pricePerSlot = parseFloat(order.payment?.expectedAmountUSDT || order.expectedAmountUSDT || '0') / order.quantity;
    
    for (const landSlotId of order.landSlotIds) {
      // Check if UserLand record already exists
      const existing = await UserLand.findOne({ landSlotId });
      if (existing) {
        skipped++;
        continue;
      }
      
      // Get land slot details
      const landSlot = await LandSlot.findOne({ landSlotId });
      if (!landSlot) {
        console.warn(`⚠️  Land slot not found: ${landSlotId}`);
        continue;
      }
      
      // Create UserLand record
      await UserLand.create({
        userId: order.userId,
        landSlotId: landSlotId,
        stateKey: order.state,
        areaKey: order.place,
        orderId: order._id,
        purchasedAt: paidAt,
        purchasePriceUSDT: pricePerSlot.toFixed(6), // Store with 6 decimal precision
      });
      
      created++;
    }
  }
  
  console.log(`✅ Created ${created} UserLand records (skipped ${skipped} existing)`);
};

const main = async (): Promise<void> => {
  try {
    console.log('🚀 Starting database migration...\n');
    
    // Connect to MongoDB
    await connectMongoDB();
    
    // Run migrations
    await migrateUsers();
    await migrateOrders();
    await backfillLandSlotOwnership();
    await createUserLandRecords();
    
    console.log('\n✅ Migration completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
};

// Run migration if called directly
if (require.main === module) {
  main();
}

export default main;

