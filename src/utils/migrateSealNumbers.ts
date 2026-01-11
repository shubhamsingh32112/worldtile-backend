import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Deed from '../models/Deed.model';
import { generateSealNumber } from './sealNumberGenerator';

// Load environment variables
dotenv.config();

/**
 * Migrate Seal Numbers Script
 * 
 * Changes seal numbers from old format (DEED-WT-IND-KL-FOKO-6806-1767979748166) 
 * to new format (WT-5432)
 * 
 * Usage:
 *   npm run migrate:seal-numbers                    # Dry run (shows what would change)
 *   npm run migrate:seal-numbers --execute          # Actually perform the migration
 */

const migrateSealNumbers = async () => {
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
      console.log('Add --execute flag to perform the migration\n');
    } else {
      console.log('⚠️  EXECUTE MODE - Changes will be made to the database\n');
    }

    // Find all deeds
    const deeds = await Deed.find({}).sort({ createdAt: 1 });
    
    if (deeds.length === 0) {
      console.log('❌ No deeds found');
      await mongoose.disconnect();
      process.exit(0);
    }

    console.log(`📋 Found ${deeds.length} deed(s) to check\n`);
    console.log('═'.repeat(120));
    console.log(
      `${'Deed ID'.padEnd(30)} | ${'Old Seal Number'.padEnd(40)} | ${'New Seal Number'.padEnd(15)} | ${'Status'.padEnd(15)}`
    );
    console.log('═'.repeat(120));

    const migrations: Array<{
      deedId: string;
      oldSealNo: string;
      newSealNo: string;
    }> = [];

    // Collect all existing seal numbers to ensure uniqueness
    const existingSealNumbers = new Set<string>();
    for (const deed of deeds) {
      // Check if already in new format (WT-XXXX pattern)
      if (/^WT-\d{4}$/.test(deed.sealNo)) {
        existingSealNumbers.add(deed.sealNo);
      }
    }

    // Process each deed
    for (const deed of deeds) {
      // Skip if already in new format
      if (/^WT-\d{4}$/.test(deed.sealNo)) {
        console.log(
          `${deed._id.toString().padEnd(30)} | ${deed.sealNo.padEnd(40)} | ${'Already new format'.padEnd(15)} | ${'✅ SKIPPED'.padEnd(15)}`
        );
        continue;
      }

      // Generate new seal number (it will check for uniqueness internally)
      const newSealNo = await generateSealNumber();
      
      // Add to existing set to prevent duplicates in this batch
      existingSealNumbers.add(newSealNo);
      
      migrations.push({
        deedId: deed._id.toString(),
        oldSealNo: deed.sealNo,
        newSealNo: newSealNo,
      });
      
      console.log(
        `${deed._id.toString().padEnd(30)} | ${deed.sealNo.substring(0, 40).padEnd(40)} | ${newSealNo.padEnd(15)} | ${'✅ TO UPDATE'.padEnd(15)}`
      );
    }

    console.log('═'.repeat(120));
    console.log(`\n📊 Summary:`);
    console.log(`   - ${deeds.length} total deed(s)`);
    const toUpdate = migrations.length;
    const alreadyUpdated = deeds.length - toUpdate;
    console.log(`   - ${alreadyUpdated} already in new format`);
    console.log(`   - ${toUpdate} need to be updated`);
    console.log(`   - ${execute ? '✅ Will execute migration' : '🔍 Dry run only'}`);

    if (!execute) {
      console.log('\n💡 To perform the migration, run:');
      console.log('   npm run migrate:seal-numbers --execute\n');
      await mongoose.disconnect();
      process.exit(0);
    }

    // Perform migration
    console.log('\n🚀 Starting migration...\n');

    let success = 0;
    let fail = 0;

    if (!mongoose.connection.db) {
      throw new Error('MongoDB connection not established');
    }

    const deedsCollection = mongoose.connection.db.collection('deeds');

    for (const migration of migrations) {
      try {
        const deedObjectId = new mongoose.Types.ObjectId(migration.deedId);
        
        const result = await deedsCollection.updateOne(
          { _id: deedObjectId },
          {
            $set: {
              sealNo: migration.newSealNo,
              updatedAt: new Date(),
            },
          }
        );

        if (result.modifiedCount > 0) {
          success++;
          console.log(`✅ Updated deed ${migration.deedId}: ${migration.oldSealNo.substring(0, 30)}... → ${migration.newSealNo}`);
        } else {
          fail++;
          console.log(`⚠️  Deed ${migration.deedId} not found or already updated`);
        }
      } catch (error: any) {
        fail++;
        console.error(`❌ Failed to update deed ${migration.deedId}:`, error.message);
      }
    }

    console.log('\n' + '═'.repeat(120));
    console.log('✅ Migration completed!\n');
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
  migrateSealNumbers();
}

export default migrateSealNumbers;
