import mongoose from 'mongoose';
import dotenv from 'dotenv';
import LandSlot from '../models/LandSlot.model';
import Deed from '../models/Deed.model';
import UserLand from '../models/UserLand.model';

// Load environment variables
dotenv.config();

/**
 * Migrate Plot IDs Script
 * 
 * Changes plot IDs from old format (karnataka_whitefield_006) 
 * to new format (WT-IND-KA-WHF-006)
 * 
 * Format: WT-{COUNTRY}-{STATE}-{CITY}-{PLOT_NUMBER}
 * 
 * Usage:
 *   npm run migrate:plot-ids                    # Dry run (shows what would change)
 *   npm run migrate:plot-ids --execute          # Actually perform the migration
 * 
 * Example:
 *   npm run migrate:plot-ids --execute
 */

// State name to abbreviation mapping
const STATE_ABBREVIATIONS: { [key: string]: string } = {
  'karnataka': 'KA',
  'maharashtra': 'MH',
  'delhi': 'DL',
  'tamil nadu': 'TN',
  'tamilnadu': 'TN',
  'gujarat': 'GJ',
  'rajasthan': 'RJ',
  'west bengal': 'WB',
  'westbengal': 'WB',
  'andhra pradesh': 'AP',
  'andhrapradesh': 'AP',
  'telangana': 'TS',
  'kerala': 'KL',
  'punjab': 'PB',
  'haryana': 'HR',
  'uttar pradesh': 'UP',
  'uttarpradesh': 'UP',
  'bihar': 'BR',
  'odisha': 'OD',
  'assam': 'AS',
  'jharkhand': 'JH',
  'chhattisgarh': 'CG',
  'himachal pradesh': 'HP',
  'himachalpradesh': 'HP',
  'uttarakhand': 'UK',
  'goa': 'GA',
  'tripura': 'TR',
  'manipur': 'MN',
  'meghalaya': 'ML',
  'nagaland': 'NG',
  'mizoram': 'MZ',
  'arunachal pradesh': 'AR',
  'arunachalpradesh': 'AR',
  'sikkim': 'SK',
};

// Common city name to abbreviation mapping
const CITY_ABBREVIATIONS: { [key: string]: string } = {
  'whitefield': 'WHF',
  'jp_nagar': 'JPN',
  'jpnagar': 'JPN',
  'jp nagar': 'JPN',
  'electronic city': 'ELC',
  'electroniccity': 'ELC',
  'electronic_city': 'ELC',
  'indiranagar': 'IND',
  'indira nagar': 'IND',
  'indira_nagar': 'IND',
  'koramangala': 'KRM',
  'mg road': 'MGR',
  'mg_road': 'MGR',
  'mgroad': 'MGR',
  'btm layout': 'BTM',
  'btm_layout': 'BTM',
  'btmlayout': 'BTM',
  'marathahalli': 'MHL',
  'silk board': 'SKB',
  'silkboard': 'SKB',
  'silk_board': 'SKB',
  'hsr layout': 'HSR',
  'hsr_layout': 'HSR',
  'hsrlayout': 'HSR',
  'bellandur': 'BLD',
  'kormangala': 'KRM',
  'ub city': 'UBC',
  'ubcity': 'UBC',
  'ub_city': 'UBC',
  'richmond town': 'RCH',
  'richmondtown': 'RCH',
  'richmond_town': 'RCH',
  'basavanagudi': 'BSN',
  'malleshwaram': 'MLW',
  'rajajinagar': 'RJN',
  'yeshwantpur': 'YSP',
  'vidyaranyapura': 'VDP',
  'hebbal': 'HBL',
  'airport road': 'APR',
  'airportroad': 'APR',
  'airport_road': 'APR',
};

/**
 * Convert city name to abbreviation
 */
function getCityAbbreviation(cityName: string): string {
  const normalized = cityName.toLowerCase().trim().replace(/\s+/g, '_');
  
  // Check direct mapping
  if (CITY_ABBREVIATIONS[normalized]) {
    return CITY_ABBREVIATIONS[normalized];
  }
  
  // Try common patterns
  const parts = normalized.split(/[_\s-]+/);
  
  // If single word and short enough, use uppercase
  if (parts.length === 1 && parts[0].length <= 4) {
    return parts[0].toUpperCase();
  }
  
  // Take first 3-4 letters of each word, up to 4 characters total
  if (parts.length === 1) {
    return parts[0].substring(0, 4).toUpperCase();
  }
  
  // Multi-word: take first 2-3 letters of first 2 words
  const abbrev = parts
    .slice(0, 2)
    .map(p => p.substring(0, 2))
    .join('')
    .substring(0, 4)
    .toUpperCase();
  
  return abbrev || 'UNK';
}

/**
 * Convert state name to abbreviation
 */
function getStateAbbreviation(stateName: string): string {
  const normalized = stateName.toLowerCase().trim();
  return STATE_ABBREVIATIONS[normalized] || normalized.substring(0, 2).toUpperCase();
}

/**
 * Generate a random 4-digit plot number (1000-9999)
 */
function generateRandomPlotNumber(): string {
  const min = 1000;
  const max = 9999;
  const randomNum = Math.floor(Math.random() * (max - min + 1)) + min;
  return randomNum.toString();
}

/**
 * Generate new plot ID in format: WT-IND-{STATE}-{CITY}-{PLOT_NUMBER}
 * @param existingPlotIds - Set of existing plot IDs to avoid duplicates
 */
function generateNewPlotId(
  stateKey: string,
  stateName: string,
  areaKey: string,
  areaName: string,
  existingPlotIds: Set<string>,
  maxAttempts: number = 100
): string {
  const stateAbbrev = getStateAbbreviation(stateKey || stateName);
  const cityAbbrev = getCityAbbreviation(areaKey || areaName);
  
  let plotId: string;
  let attempts = 0;
  
  // Generate random plot number and ensure uniqueness
  do {
    const plotNumber = generateRandomPlotNumber();
    plotId = `WT-IND-${stateAbbrev}-${cityAbbrev}-${plotNumber}`;
    attempts++;
    
    if (attempts >= maxAttempts) {
      // Fallback: use timestamp-based number if too many attempts
      const fallbackNum = Date.now() % 9000 + 1000;
      plotId = `WT-IND-${stateAbbrev}-${cityAbbrev}-${Math.floor(fallbackNum).toString()}`;
      break;
    }
  } while (existingPlotIds.has(plotId));
  
  // Add to existing set to avoid duplicates in this batch
  existingPlotIds.add(plotId);
  
  return plotId;
}

/**
 * Migrate plot IDs
 */
const migratePlotIds = async () => {
  try {
    // Check for execute flag - npm passes args after --
    // Args can be: ['node', 'script.js', '--execute'] or ['node', 'script.js', 'execute']
    const allArgs = process.argv.slice(2);
    const execute = allArgs.includes('--execute') || allArgs.includes('execute');
    
    // Debug output to help troubleshoot
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

    // Find all land slots
    const landSlots = await LandSlot.find({}).sort({ stateKey: 1, areaKey: 1, slotNumber: 1 });
    
    if (landSlots.length === 0) {
      console.log('❌ No land slots found');
      await mongoose.disconnect();
      process.exit(0);
    }

    console.log(`📋 Found ${landSlots.length} land slot(s) to migrate\n`);
    console.log('═'.repeat(120));
    console.log(
      `${'Old Plot ID'.padEnd(35)} | ${'New Plot ID'.padEnd(35)} | ${'State'.padEnd(15)} | ${'City'.padEnd(20)} | ${'Plot #'.padEnd(7)}`
    );
    console.log('═'.repeat(120));

    const migrations: Array<{
      oldId: string;
      newId: string;
      landSlotId: string;
      deedIds: string[];
      plotNumber: string;
    }> = [];

    // Set to track existing plot IDs to ensure uniqueness
    const existingPlotIds = new Set<string>();
    
    // First, collect all existing plot IDs from landSlots and deeds
    for (const landSlot of landSlots) {
      // Check if it's already in new format (starts with WT-IND-)
      if (landSlot.landSlotId.startsWith('WT-IND-')) {
        existingPlotIds.add(landSlot.landSlotId);
      }
    }
    
    // Also check deeds for existing plot IDs
    const existingDeeds = await Deed.find({});
    for (const deed of existingDeeds) {
      if (deed.landSlotId && deed.landSlotId.startsWith('WT-IND-')) {
        existingPlotIds.add(deed.landSlotId);
      }
      if (deed.plotId && deed.plotId.startsWith('WT-IND-')) {
        existingPlotIds.add(deed.plotId);
      }
    }
    
    // Find orphaned deeds (deeds with old format plot IDs that don't match any land slot)
    // Also find deeds whose landSlotId matches an already-migrated land slot
    const orphanedDeeds: Array<{
      _id: string;
      oldPlotId: string;
      oldLandSlotId: string;
      matchedLandSlot?: { _id: string; newId: string };
      stateName?: string;
      areaName?: string;
      city?: string;
    }> = [];
    
    for (const deed of existingDeeds) {
      // Skip if both plotId and landSlotId are already in new format
      if (deed.plotId && deed.plotId.startsWith('WT-IND-') && 
          deed.landSlotId && deed.landSlotId.startsWith('WT-IND-')) {
        continue;
      }
      
      // Check if this deed's landSlotId matches any land slot (migrated or not)
      const matchingLandSlot = landSlots.find(ls => 
        ls.landSlotId === deed.landSlotId || 
        ls.landSlotId === deed.plotId
      );
      
      // If land slot is already migrated, we need to update the deed
      if (matchingLandSlot && matchingLandSlot.landSlotId.startsWith('WT-IND-')) {
        orphanedDeeds.push({
          _id: deed._id.toString(),
          oldPlotId: deed.plotId || deed.landSlotId,
          oldLandSlotId: deed.landSlotId,
          matchedLandSlot: {
            _id: matchingLandSlot._id.toString(),
            newId: matchingLandSlot.landSlotId, // Already in new format
          },
          stateName: (deed as any).stateName,
          areaName: (deed as any).areaName,
          city: deed.city,
        });
        continue;
      }
      
      // If not found in land slots and has old format, it's truly orphaned
      if (!matchingLandSlot && deed.plotId && !deed.plotId.startsWith('WT-IND-')) {
        orphanedDeeds.push({
          _id: deed._id.toString(),
          oldPlotId: deed.plotId,
          oldLandSlotId: deed.landSlotId,
          stateName: (deed as any).stateName,
          areaName: (deed as any).areaName,
          city: deed.city,
        });
      }
    }
    
    if (orphanedDeeds.length > 0) {
      const trulyOrphaned = orphanedDeeds.filter(d => !d.matchedLandSlot).length;
      const alreadyMigrated = orphanedDeeds.filter(d => d.matchedLandSlot).length;
      console.log(`\n⚠️  Found ${orphanedDeeds.length} deed(s) that need plot ID updates:`);
      if (alreadyMigrated > 0) {
        console.log(`   - ${alreadyMigrated} deed(s) linked to already-migrated land slots`);
      }
      if (trulyOrphaned > 0) {
        console.log(`   - ${trulyOrphaned} orphaned deed(s) with old format plot IDs\n`);
      }
    }

    // Process each land slot
    for (const landSlot of landSlots) {
      // Skip if already in new format
      if (landSlot.landSlotId.startsWith('WT-IND-')) {
        console.log(`⏭️  Skipping ${landSlot.landSlotId} (already in new format)`);
        continue;
      }

      const newPlotId = generateNewPlotId(
        landSlot.stateKey || '',
        landSlot.stateName || '',
        landSlot.areaKey || '',
        landSlot.areaName || '',
        existingPlotIds
      );
      
      // Extract plot number from the new ID for display
      const plotNumber = newPlotId.split('-').pop() || 'N/A';

      // Find deeds that reference this landSlotId
      const deeds = await Deed.find({ landSlotId: landSlot.landSlotId });
      const deedIds = deeds.map(d => d._id.toString());

      migrations.push({
        oldId: landSlot.landSlotId,
        newId: newPlotId,
        landSlotId: landSlot._id.toString(),
        deedIds: deedIds,
        plotNumber: plotNumber,
      });
      
      console.log(
        `${landSlot.landSlotId.padEnd(35)} | ${newPlotId.padEnd(35)} | ${(landSlot.stateName || '').padEnd(15)} | ${(landSlot.areaName || '').padEnd(20)} | ${plotNumber.padEnd(7)}`
      );
      
      if (deedIds.length > 0) {
        console.log(`  └─ ${deedIds.length} deed(s) will be updated`);
      }
    }

    // Process orphaned deeds - try to generate new plot IDs from deed data
    const orphanedMigrations: Array<{
      deedId: string;
      oldPlotId: string;
      oldLandSlotId: string; // Keep track of old landSlotId for UserLand updates
      newPlotId: string;
      plotNumber: string;
    }> = [];
    
    if (orphanedDeeds.length > 0) {
      console.log('\n📋 Processing deeds that need updates...\n');
      for (const orphanedDeed of orphanedDeeds) {
        let newPlotId: string;
        let plotNumber: string;
        
        // If deed is linked to an already-migrated land slot, use that ID
        if (orphanedDeed.matchedLandSlot) {
          newPlotId = orphanedDeed.matchedLandSlot.newId;
          plotNumber = newPlotId.split('-').pop() || 'N/A';
          console.log(
            `Linked to migrated: ${orphanedDeed.oldPlotId.padEnd(35)} → ${newPlotId.padEnd(35)}`
          );
        } else {
          // Truly orphaned - generate new plot ID from deed data
          // Try to extract state/city from old plot ID format (state_city_number)
          const parts = orphanedDeed.oldPlotId.split('_');
          let stateKey = '';
          let areaKey = '';
          
          if (parts.length >= 2) {
            stateKey = parts[0];
            areaKey = parts.slice(1, -1).join('_'); // Everything except first and last part
          }
          
          // Use city from deed if available
          const areaName = orphanedDeed.city || orphanedDeed.areaName || areaKey;
          const stateName = orphanedDeed.stateName || stateKey;
          
          newPlotId = generateNewPlotId(
            stateKey,
            stateName,
            areaKey,
            areaName,
            existingPlotIds
          );
          
          plotNumber = newPlotId.split('-').pop() || 'N/A';
          
          console.log(
            `Orphaned: ${orphanedDeed.oldPlotId.padEnd(35)} → ${newPlotId.padEnd(35)} | ${(stateName || '').padEnd(15)} | ${(areaName || '').padEnd(20)}`
          );
        }
        
        orphanedMigrations.push({
          deedId: orphanedDeed._id,
          oldPlotId: orphanedDeed.oldPlotId,
          oldLandSlotId: orphanedDeed.oldLandSlotId, // Keep for UserLand updates
          newPlotId: newPlotId,
          plotNumber: plotNumber,
        });
      }
    }

    console.log('═'.repeat(120));
    console.log(`\n📊 Summary:`);
    console.log(`   - ${landSlots.length} land slot(s) to update`);
    
    const totalDeeds = migrations.reduce((sum, m) => sum + m.deedIds.length, 0);
    const totalOrphanedDeeds = orphanedMigrations.length;
    console.log(`   - ${totalDeeds} deed(s) linked to land slots to update`);
    if (totalOrphanedDeeds > 0) {
      console.log(`   - ${totalOrphanedDeeds} orphaned deed(s) to update`);
    }
    console.log(`   - ${execute ? '✅ Will execute migration' : '🔍 Dry run only'}`);

    if (!execute) {
      console.log('\n💡 To perform the migration, run:');
      console.log('   npm run migrate:plot-ids --execute\n');
      await mongoose.disconnect();
      process.exit(0);
    }

    // Perform migration
    console.log('\n🚀 Starting migration...\n');

    let landSlotSuccess = 0;
    let landSlotFail = 0;
    let deedSuccess = 0;
    let deedFail = 0;
    let userLandSuccess = 0;
    let userLandFail = 0;

    for (const migration of migrations) {
      try {
        // Update land slot
        await LandSlot.updateOne(
          { _id: migration.landSlotId },
          { $set: { landSlotId: migration.newId } }
        );
        landSlotSuccess++;
        console.log(`✅ Updated land slot: ${migration.oldId} → ${migration.newId}`);

        // Update all deeds that reference this landSlotId
        // Use direct MongoDB collection update to bypass Mongoose immutability hooks
        if (migration.deedIds.length > 0) {
          if (!mongoose.connection.db) {
            throw new Error('MongoDB connection not established');
          }
          
          const deedsCollection = mongoose.connection.db.collection('deeds');
          
          // Convert string IDs to ObjectIds
          const deedObjectIds = migration.deedIds.map(id => new mongoose.Types.ObjectId(id));
          
          const result = await deedsCollection.updateMany(
            { _id: { $in: deedObjectIds } },
            {
              $set: {
                landSlotId: migration.newId,
                plotId: migration.newId, // Also update plotId field
                updatedAt: new Date(), // Update timestamp
              },
            }
          );
          
          deedSuccess += result.modifiedCount;
          console.log(`   └─ Updated ${result.modifiedCount} deed(s)`);
        }
        
        // Update UserLand records that reference this landSlotId
        if (!mongoose.connection.db) {
          throw new Error('MongoDB connection not established');
        }
        
        const userLandsCollection = mongoose.connection.db.collection('userlands');
        const userLandResult = await userLandsCollection.updateMany(
          { landSlotId: migration.oldId },
          {
            $set: {
              landSlotId: migration.newId,
              updatedAt: new Date(),
            },
          }
        );
        
        if (userLandResult.modifiedCount > 0) {
          console.log(`   └─ Updated ${userLandResult.modifiedCount} user land record(s)`);
        }
      } catch (error: any) {
        landSlotFail++;
        console.error(`❌ Failed to update ${migration.oldId}:`, error.message);
      }
    }
    
    // Process orphaned deeds
    if (orphanedMigrations.length > 0) {
      console.log('\n🔄 Updating orphaned deeds...\n');
      
      if (!mongoose.connection.db) {
        throw new Error('MongoDB connection not established');
      }
      
      const deedsCollection = mongoose.connection.db.collection('deeds');
      
      for (const orphanedMigration of orphanedMigrations) {
        try {
          const deedObjectId = new mongoose.Types.ObjectId(orphanedMigration.deedId);
          
          const result = await deedsCollection.updateOne(
            { _id: deedObjectId },
            {
              $set: {
                landSlotId: orphanedMigration.newPlotId,
                plotId: orphanedMigration.newPlotId,
                updatedAt: new Date(),
              },
            }
          );
          
          if (result.modifiedCount > 0) {
            deedSuccess++;
            console.log(`✅ Updated orphaned deed: ${orphanedMigration.oldPlotId} → ${orphanedMigration.newPlotId}`);
          } else {
            deedFail++;
            console.log(`⚠️  Deed ${orphanedMigration.deedId} not found or already updated`);
          }
          
          // Also update UserLand records for orphaned deeds
          // Use oldLandSlotId since UserLand uses landSlotId, not plotId
          const userLandsCollection = mongoose.connection.db.collection('userlands');
          const userLandResult = await userLandsCollection.updateMany(
            { landSlotId: orphanedMigration.oldLandSlotId },
            {
              $set: {
                landSlotId: orphanedMigration.newPlotId,
                updatedAt: new Date(),
              },
            }
          );
          
          if (userLandResult.modifiedCount > 0) {
            userLandSuccess += userLandResult.modifiedCount;
            console.log(`   └─ Updated ${userLandResult.modifiedCount} user land record(s)`);
          }
        } catch (error: any) {
          deedFail++;
          console.error(`❌ Failed to update orphaned deed ${orphanedMigration.oldPlotId}:`, error.message);
        }
      }
    }

    console.log('\n' + '═'.repeat(120));
    console.log('✅ Migration completed!\n');
    console.log('📊 Results:');
    console.log(`   Land Slots: ${landSlotSuccess} updated, ${landSlotFail} failed`);
    console.log(`   Deeds: ${deedSuccess} updated, ${deedFail} failed`);
    console.log(`   UserLands: ${userLandSuccess} updated, ${userLandFail} failed`);
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
  migratePlotIds();
}

export default migratePlotIds;

