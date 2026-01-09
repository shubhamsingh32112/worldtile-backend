import mongoose from 'mongoose';
import dotenv from 'dotenv';
import LandSlot from '../models/LandSlot.model';
import Deed from '../models/Deed.model';

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
      if (deed.landSlotId.startsWith('WT-IND-')) {
        existingPlotIds.add(deed.landSlotId);
      }
      if (deed.plotId && deed.plotId.startsWith('WT-IND-')) {
        existingPlotIds.add(deed.plotId);
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

    console.log('═'.repeat(120));
    console.log(`\n📊 Summary:`);
    console.log(`   - ${landSlots.length} land slot(s) to update`);
    
    const totalDeeds = migrations.reduce((sum, m) => sum + m.deedIds.length, 0);
    console.log(`   - ${totalDeeds} deed(s) to update`);
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
        if (migration.deedIds.length > 0) {
          const result = await Deed.updateMany(
            { _id: { $in: migration.deedIds } },
            {
              $set: {
                landSlotId: migration.newId,
                plotId: migration.newId, // Also update plotId field
              },
            }
          );
          
          deedSuccess += result.modifiedCount;
          console.log(`   └─ Updated ${result.modifiedCount} deed(s)`);
        }
      } catch (error: any) {
        landSlotFail++;
        console.error(`❌ Failed to update ${migration.oldId}:`, error.message);
      }
    }

    console.log('\n' + '═'.repeat(120));
    console.log('✅ Migration completed!\n');
    console.log('📊 Results:');
    console.log(`   Land Slots: ${landSlotSuccess} updated, ${landSlotFail} failed`);
    console.log(`   Deeds: ${deedSuccess} updated, ${deedFail} failed`);
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

