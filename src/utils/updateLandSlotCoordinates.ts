import mongoose from 'mongoose';
import dotenv from 'dotenv';
import LandSlot from '../models/LandSlot.model';
import * as fs from 'fs';
import * as path from 'path';

// Load environment variables
dotenv.config();

/**
 * Update LandSlot Coordinates Script
 * 
 * Updates latitude and longitude for all land slots based on location_data.json
 * All slots in the same area will get the same coordinates
 * 
 * Usage:
 *   npm run update:coordinates                    # Dry run (shows what would change)
 *   npm run update:coordinates -- --execute       # Actually perform the update
 * 
 * Example:
 *   npm run update:coordinates -- --execute
 */

interface LocationData {
  state: string;
  city: string;
  area: string;
  latitude: number;
  longitude: number;
}

/**
 * Load location data from JSON file
 */
function loadLocationData(): LocationData[] {
  // Handle both ts-node execution (__dirname is src/utils) and compiled execution (__dirname is dist/utils)
  let filePath = path.join(__dirname, '../location_data/location_data.json');
  
  // If file doesn't exist, try alternative paths
  if (!fs.existsSync(filePath)) {
    // Try from project root
    filePath = path.join(process.cwd(), 'src/location_data/location_data.json');
  }
  
  if (!fs.existsSync(filePath)) {
    // Try absolute path from src
    filePath = path.resolve(__dirname, '../../src/location_data/location_data.json');
  }
  
  if (!fs.existsSync(filePath)) {
    throw new Error(`Location data file not found. Tried:\n- ${path.join(__dirname, '../location_data/location_data.json')}\n- ${path.join(process.cwd(), 'src/location_data/location_data.json')}\n- ${path.resolve(__dirname, '../../src/location_data/location_data.json')}`);
  }

  console.log(`📂 Loading from: ${filePath}`);
  const fileContent = fs.readFileSync(filePath, 'utf-8');
  
  if (!fileContent || fileContent.trim().length === 0) {
    throw new Error('Location data file is empty');
  }
  
  const data = JSON.parse(fileContent) as LocationData[];
  
  return data;
}

/**
 * Normalize string for matching (lowercase, trim, handle variations)
 */
function normalizeString(str: string): string {
  return str.toLowerCase().trim().replace(/\s+/g, ' ');
}

/**
 * Create a lookup map from location data
 */
function createLocationLookup(locationData: LocationData[]): Map<string, { lat: number; lng: number }> {
  const lookup = new Map<string, { lat: number; lng: number }>();

  for (const loc of locationData) {
    // Create keys with normalized values for matching
    const normalizedState = normalizeString(loc.state);
    const normalizedCity = normalizeString(loc.city);
    const normalizedArea = normalizeString(loc.area);

    // Try multiple key formats for better matching
    const keys = [
      `${normalizedState}|${normalizedCity}|${normalizedArea}`,
      `${normalizedState.toLowerCase()}|${normalizedCity.toLowerCase()}|${normalizedArea.toLowerCase()}`,
    ];

    for (const key of keys) {
      if (!lookup.has(key)) {
        lookup.set(key, { lat: loc.latitude, lng: loc.longitude });
      }
    }
  }

  return lookup;
}

/**
 * Find matching location data for a land slot
 */
function findLocation(
  landSlot: any,
  locationLookup: Map<string, { lat: number; lng: number }>
): { lat: number; lng: number } | null {
  const normalizedState = normalizeString(landSlot.stateName || landSlot.stateKey || '');
  const normalizedCity = normalizeString(landSlot.areaName || landSlot.areaKey || '');
  const normalizedArea = normalizeString(landSlot.areaName || landSlot.areaKey || '');

  // Try to match state, city, and area
  const key = `${normalizedState}|${normalizedCity}|${normalizedArea}`;
  
  if (locationLookup.has(key)) {
    return locationLookup.get(key)!;
  }

  // Try matching with area only (fallback)
  for (const [lookupKey, coords] of locationLookup.entries()) {
    const [, city, area] = lookupKey.split('|'); // Extract city and area from lookup key
    if (normalizedArea === area || normalizedArea === city || normalizedArea.includes(area) || area.includes(normalizedArea) || normalizedArea.includes(city) || city.includes(normalizedArea)) {
      return coords;
    }
  }

  return null;
}

/**
 * Update land slot coordinates
 */
const updateLandSlotCoordinates = async () => {
  try {
    // Check for execute flag
    const allArgs = process.argv.slice(2);
    const execute = allArgs.includes('--execute') || allArgs.includes('execute');
    
    if (allArgs.length > 0) {
      console.log(`📝 Detected arguments: ${allArgs.join(', ')}`);
      console.log(`🔧 Execute mode: ${execute ? 'YES' : 'NO (dry run)'}\n`);
    }

    // Load location data
    console.log('📂 Loading location data...');
    const locationData = loadLocationData();
    console.log(`✅ Loaded ${locationData.length} location entries\n`);

    // Create lookup map
    const locationLookup = createLocationLookup(locationData);

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
      console.log('Add --execute flag to perform the update\n');
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

    console.log(`📋 Found ${landSlots.length} land slot(s)\n`);
    console.log('═'.repeat(120));
    console.log(
      `${'Land Slot ID'.padEnd(35)} | ${'State'.padEnd(20)} | ${'City/Area'.padEnd(25)} | ${'Latitude'.padEnd(12)} | ${'Longitude'.padEnd(12)} | Status`
    );
    console.log('═'.repeat(120));

    const updates: Array<{
      landSlotId: string;
      landSlotDocId: string;
      oldLat: number | null;
      oldLng: number | null;
      newLat: number;
      newLng: number;
      matched: boolean;
    }> = [];

    // Group by area for batch updates
    const areaGroups = new Map<string, any[]>();

    // Process each land slot
    for (const landSlot of landSlots) {
      const areaKey = `${landSlot.stateKey || ''}|${landSlot.areaKey || ''}`;
      if (!areaGroups.has(areaKey)) {
        areaGroups.set(areaKey, []);
      }
      areaGroups.get(areaKey)!.push(landSlot);
    }

    // Process by area groups
    for (const [, slots] of areaGroups.entries()) {
      const firstSlot = slots[0];
      const location = findLocation(firstSlot, locationLookup);

      if (location) {
        // Update all slots in this area
        for (const slot of slots) {
          const oldLat = slot.latitude || null;
          const oldLng = slot.longitude || null;

          updates.push({
            landSlotId: slot.landSlotId,
            landSlotDocId: slot._id.toString(),
            oldLat,
            oldLng,
            newLat: location.lat,
            newLng: location.lng,
            matched: true,
          });

          // Show first slot in group
          if (slot === firstSlot) {
            const status = oldLat !== null && oldLng !== null 
              ? (oldLat === location.lat && oldLng === location.lng ? '✅' : '🔄')
              : '➕';
            console.log(
              `${slot.landSlotId.padEnd(35)} | ${(slot.stateName || '').padEnd(20)} | ${(slot.areaName || '').padEnd(25)} | ${location.lat.toFixed(6).padEnd(12)} | ${location.lng.toFixed(6).padEnd(12)} | ${status}`
            );
            if (slots.length > 1) {
              console.log(`  └─ ${slots.length - 1} more slot(s) in this area`);
            }
          }
        }
      } else {
        // No match found
        for (const slot of slots) {
          updates.push({
            landSlotId: slot.landSlotId,
            landSlotDocId: slot._id.toString(),
            oldLat: slot.latitude || null,
            oldLng: slot.longitude || null,
            newLat: 0,
            newLng: 0,
            matched: false,
          });

          if (slot === firstSlot) {
            console.log(
              `${slot.landSlotId.padEnd(35)} | ${(slot.stateName || '').padEnd(20)} | ${(slot.areaName || '').padEnd(25)} | ${'❌ NOT FOUND'.padEnd(12)} | ${'❌ NOT FOUND'.padEnd(12)} | ⚠️`
            );
            if (slots.length > 1) {
              console.log(`  └─ ${slots.length - 1} more slot(s) in this area`);
            }
          }
        }
      }
    }

    console.log('═'.repeat(120));
    console.log(`\n📊 Summary:`);
    const matchedCount = updates.filter(u => u.matched).length;
    const unmatchedCount = updates.filter(u => !u.matched).length;
    const alreadyHasCoords = updates.filter(u => u.oldLat !== null && u.oldLng !== null).length;
    
    console.log(`   - ${updates.length} land slot(s) processed`);
    console.log(`   - ${matchedCount} slot(s) matched with location data`);
    console.log(`   - ${unmatchedCount} slot(s) not found in location data`);
    console.log(`   - ${alreadyHasCoords} slot(s) already have coordinates`);
    console.log(`   - ${execute ? '✅ Will execute update' : '🔍 Dry run only'}`);

    if (unmatchedCount > 0) {
      console.log(`\n⚠️  Warning: ${unmatchedCount} slot(s) could not be matched with location data.`);
      console.log(`   These will be set to 0,0 or keep existing values.`);
    }

    if (!execute) {
      console.log('\n💡 To perform the update, run:');
      console.log('   npm run update:coordinates -- --execute\n');
      await mongoose.disconnect();
      process.exit(0);
    }

    // Perform update
    console.log('\n🚀 Starting update...\n');

    let success = 0;
    let fail = 0;
    let skipped = 0;

    // Group updates by area for batch processing
    const areaUpdateMap = new Map<string, { lat: number; lng: number; slotIds: string[] }>();

    for (const update of updates) {
      if (!update.matched) {
        skipped++;
        continue;
      }

      const areaKey = `${update.landSlotId.split('-').slice(0, 4).join('-')}`; // Get area identifier
      if (!areaUpdateMap.has(areaKey)) {
        areaUpdateMap.set(areaKey, {
          lat: update.newLat,
          lng: update.newLng,
          slotIds: [],
        });
      }
      areaUpdateMap.get(areaKey)!.slotIds.push(update.landSlotDocId);
    }

    // Perform batch updates by area
    for (const [areaKey, updateData] of areaUpdateMap.entries()) {
      try {
        const result = await LandSlot.updateMany(
          { _id: { $in: updateData.slotIds } },
          {
            $set: {
              latitude: updateData.lat,
              longitude: updateData.lng,
            },
          }
        );
        success += result.modifiedCount;
        console.log(`✅ Updated ${result.modifiedCount} slot(s) for area: ${areaKey} (${updateData.lat.toFixed(6)}, ${updateData.lng.toFixed(6)})`);
      } catch (error: any) {
        fail += updateData.slotIds.length;
        console.error(`❌ Failed to update area ${areaKey}:`, error.message);
      }
    }

    console.log('\n' + '═'.repeat(120));
    console.log('✅ Update completed!\n');
    console.log('📊 Results:');
    console.log(`   Updated: ${success} slot(s)`);
    console.log(`   Skipped: ${skipped} slot(s) (no match found)`);
    console.log(`   Failed: ${fail} slot(s)`);
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
  updateLandSlotCoordinates();
}

export default updateLandSlotCoordinates;

