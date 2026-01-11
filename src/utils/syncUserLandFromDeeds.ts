import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Deed from '../models/Deed.model';
import UserLand from '../models/UserLand.model';

// Load environment variables
dotenv.config();

/**
 * Sync UserLand Plot IDs from Deed Records
 * 
 * This script updates UserLand records to match the migrated plot IDs in Deed records.
 * It matches UserLand to Deed by userId and paymentTxHash.
 * 
 * Usage:
 *   npm run sync:userland                    # Dry run (shows what would change)
 *   npm run sync:userland --execute          # Actually perform the sync
 */

const syncUserLandFromDeeds = async () => {
  try {
    // Check for execute flag
    const allArgs = process.argv.slice(2);
    const execute = allArgs.includes('--execute') || allArgs.includes('execute');
    
    if (allArgs.length > 0) {
      console.log(`📝 Detected arguments: ${allArgs.join(', ')}`);
      console.log(`🔧 Execute mode: ${execute ? 'YES' : 'NO (dry run)'}\n`);
    }
    
    // Connect to MongoDB
    const mongoUri = process.env.MONGODB_URI;
    if (!mongoUri) {
      throw new Error('MONGODB_URI is not configured in environment variables');
    }

    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(mongoUri);
    console.log('✅ Connected to MongoDB\n');

    if (!execute) {
      console.log('🔍 DRY RUN MODE - No changes will be made\n');
      console.log('Add --execute flag to perform the sync\n');
    } else {
      console.log('⚠️  EXECUTE MODE - Changes will be made to the database\n');
    }

    // Find all UserLand records with old format landSlotIds
    const userLands = await UserLand.find({}).lean();
    
    console.log(`📋 Found ${userLands.length} user land record(s)\n`);
    console.log('═'.repeat(120));
    console.log(
      `${'UserLand ID'.padEnd(30)} | ${'Old landSlotId'.padEnd(35)} | ${'New landSlotId'.padEnd(35)} | ${'Status'.padEnd(15)}`
    );
    console.log('═'.repeat(120));

    const updates: Array<{
      userLandId: string;
      oldLandSlotId: string;
      newLandSlotId: string;
      userId: string;
      paymentTxHash: string;
    }> = [];

    let alreadyUpdated = 0;
    let matchedCount = 0;
    let notFoundCount = 0;

    for (const userLand of userLands) {
      const userLandId = userLand._id.toString();
      const oldLandSlotId = userLand.landSlotId;

      // Skip if already in new format
      if (oldLandSlotId.startsWith('WT-IND-')) {
        alreadyUpdated++;
        console.log(`${userLandId.padEnd(30)} | ${oldLandSlotId.padEnd(35)} | ${'Already updated'.padEnd(35)} | ${'✅ SKIPPED'.padEnd(15)}`);
        continue;
      }

      // Try to find matching Deed by userId and paymentTxHash
      const matchingDeed = await Deed.findOne({
        userId: userLand.userId,
        'payment.transactionId': userLand.paymentTxHash,
      }).lean();

      if (matchingDeed && matchingDeed.landSlotId.startsWith('WT-IND-')) {
        // Found matching deed with new format
        updates.push({
          userLandId: userLandId,
          oldLandSlotId: oldLandSlotId,
          newLandSlotId: matchingDeed.landSlotId,
          userId: userLand.userId.toString(),
          paymentTxHash: userLand.paymentTxHash,
        });
        matchedCount++;
        console.log(
          `${userLandId.padEnd(30)} | ${oldLandSlotId.padEnd(35)} | ${matchingDeed.landSlotId.padEnd(35)} | ${'✅ MATCHED'.padEnd(15)}`
        );
      } else {
        notFoundCount++;
        console.log(
          `${userLandId.padEnd(30)} | ${oldLandSlotId.padEnd(35)} | ${'No matching deed found'.padEnd(35)} | ${'❌ NOT FOUND'.padEnd(15)}`
        );
      }
    }

    console.log('═'.repeat(120));
    console.log(`\n📊 Summary:`);
    console.log(`   - ${userLands.length} total user land record(s)`);
    console.log(`   - ${alreadyUpdated} already in new format`);
    console.log(`   - ${matchedCount} matched with deeds (will be updated)`);
    console.log(`   - ${notFoundCount} no matching deed found`);
    console.log(`   - ${execute ? '✅ Will execute sync' : '🔍 Dry run only'}`);

    if (!execute) {
      console.log('\n💡 To perform the sync, run:');
      console.log('   npm run sync:userland --execute\n');
      await mongoose.disconnect();
      process.exit(0);
    }

    // Perform sync
    console.log('\n🚀 Starting sync...\n');

    let success = 0;
    let fail = 0;

    if (!mongoose.connection.db) {
      throw new Error('MongoDB connection not established');
    }

    const userLandsCollection = mongoose.connection.db.collection('userlands');

    for (const update of updates) {
      try {
        const userLandObjectId = new mongoose.Types.ObjectId(update.userLandId);
        
        const result = await userLandsCollection.updateOne(
          { _id: userLandObjectId },
          {
            $set: {
              landSlotId: update.newLandSlotId,
              updatedAt: new Date(),
            },
          }
        );

        if (result.modifiedCount > 0) {
          success++;
          console.log(`✅ Updated UserLand ${update.userLandId}: ${update.oldLandSlotId} → ${update.newLandSlotId}`);
        } else {
          fail++;
          console.log(`⚠️  UserLand ${update.userLandId} not found or already updated`);
        }
      } catch (error: any) {
        fail++;
        console.error(`❌ Failed to update UserLand ${update.userLandId}:`, error.message);
      }
    }

    console.log('\n' + '═'.repeat(120));
    console.log('✅ Sync completed!\n');
    console.log('📊 Results:');
    console.log(`   Success: ${success} updated`);
    console.log(`   Failed: ${fail}`);
    console.log('═'.repeat(120));

    // Disconnect
    await mongoose.disconnect();
    console.log('\n✅ Script completed successfully');
    process.exit(0);
  } catch (error: any) {
    console.error('');
    console.error('❌ Script failed:', error.message);
    if (error.stack) {
      console.error('\nStack trace:');
      console.error(error.stack);
    }
    await mongoose.disconnect().catch(() => {
      // Ignore disconnect errors
    });
    process.exit(1);
  }
};

// Run script if called directly
if (require.main === module) {
  syncUserLandFromDeeds();
}

export default syncUserLandFromDeeds;
