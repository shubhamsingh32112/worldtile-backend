import dotenv from 'dotenv';
import { connectMongoDB } from '../config/mongodb';
import State from '../models/State.model';
import Area from '../models/Area.model';
import LandSlot, { ILandSlot } from '../models/LandSlot.model';

// Load environment variables
dotenv.config();

interface AreaData {
  areaKey: string;
  areaName: string;
}

interface StateData {
  stateKey: string;
  stateName: string;
  areas: AreaData[];
}

const seedData: StateData[] = [
  {
    stateKey: 'karnataka',
    stateName: 'Karnataka',
    areas: [
      { areaKey: 'whitefield', areaName: 'Whitefield' },
      { areaKey: 'koramangala', areaName: 'Koramangala' },
      { areaKey: 'indiranagar', areaName: 'Indiranagar' },
      { areaKey: 'hebbal', areaName: 'Hebbal' },
      { areaKey: 'electronic_city', areaName: 'Electronic City' },
      { areaKey: 'btm_layout', areaName: 'BTM Layout' },
      { areaKey: 'marathahalli', areaName: 'Marathahalli' },
      { areaKey: 'hsr_layout', areaName: 'HSR Layout' },
      { areaKey: 'jp_nagar', areaName: 'JP Nagar' },
      { areaKey: 'mg_road', areaName: 'MG Road' },
    ],
  },
  {
    stateKey: 'maharashtra',
    stateName: 'Maharashtra',
    areas: [
      { areaKey: 'bandra_west', areaName: 'Bandra West' },
      { areaKey: 'bkc', areaName: 'BKC' },
      { areaKey: 'powai', areaName: 'Powai' },
      { areaKey: 'andheri_east', areaName: 'Andheri East' },
      { areaKey: 'lower_parel', areaName: 'Lower Parel' },
      { areaKey: 'colaba', areaName: 'Colaba' },
      { areaKey: 'juhu', areaName: 'Juhu' },
      { areaKey: 'malad', areaName: 'Malad' },
      { areaKey: 'goregaon', areaName: 'Goregaon' },
      { areaKey: 'navi_mumbai', areaName: 'Navi Mumbai' },
      { areaKey: 'hinjewadi', areaName: 'Hinjewadi' },
      { areaKey: 'baner', areaName: 'Baner' },
      { areaKey: 'kharadi', areaName: 'Kharadi' },
      { areaKey: 'viman_nagar', areaName: 'Viman Nagar' },
      { areaKey: 'koregaon_park', areaName: 'Koregaon Park' },
      { areaKey: 'wakad', areaName: 'Wakad' },
      { areaKey: 'hadapsar', areaName: 'Hadapsar' },
      { areaKey: 'magarpatta_city', areaName: 'Magarpatta City' },
      { areaKey: 'shivaji_nagar', areaName: 'Shivaji Nagar' },
      { areaKey: 'camp', areaName: 'Camp' },
    ],
  },
  {
    stateKey: 'NCTofDelhi',
    stateName: 'Delhi NCR',
    areas: [
      { areaKey: 'connaught_place', areaName: 'Connaught Place' },
      { areaKey: 'gurgaon_cybercity', areaName: 'Gurgaon Cybercity' },
      { areaKey: 'noida_sector_62', areaName: 'Noida Sector 62' },
      { areaKey: 'dwarka', areaName: 'Dwarka' },
      { areaKey: 'saket', areaName: 'Saket' },
      { areaKey: 'hauz_khas', areaName: 'Hauz Khas' },
      { areaKey: 'chanakyapuri', areaName: 'Chanakyapuri' },
      { areaKey: 'karol_bagh', areaName: 'Karol Bagh' },
      { areaKey: 'lajpat_nagar', areaName: 'Lajpat Nagar' },
      { areaKey: 'greater_noida', areaName: 'Greater Noida' },
    ],
  },
  {
    stateKey: 'telangana',
    stateName: 'Telangana',
    areas: [
      { areaKey: 'gachibowli', areaName: 'Gachibowli' },
      { areaKey: 'hitec_city', areaName: 'Hitec City' },
      { areaKey: 'financial_district', areaName: 'Financial District' },
      { areaKey: 'kukatpally', areaName: 'Kukatpally' },
      { areaKey: 'jubilee_hills', areaName: 'Jubilee Hills' },
      { areaKey: 'banjara_hills', areaName: 'Banjara Hills' },
      { areaKey: 'begumpet', areaName: 'Begumpet' },
      { areaKey: 'madhapur', areaName: 'Madhapur' },
      { areaKey: 'secunderabad', areaName: 'Secunderabad' },
      { areaKey: 'attapur', areaName: 'Attapur' },
    ],
  },
  {
    stateKey: 'WestBengal',
    stateName: 'West Bengal',
    areas: [
      { areaKey: 'salt_lake_sector_v', areaName: 'Salt Lake Sector V' },
      { areaKey: 'new_town', areaName: 'New Town' },
      { areaKey: 'park_street', areaName: 'Park Street' },
      { areaKey: 'alipore', areaName: 'Alipore' },
      { areaKey: 'ballygunge', areaName: 'Ballygunge' },
      { areaKey: 'howrah', areaName: 'Howrah' },
      { areaKey: 'tollygunge', areaName: 'Tollygunge' },
      { areaKey: 'dum_dum', areaName: 'Dum Dum' },
      { areaKey: 'rajarhat', areaName: 'Rajarhat' },
      { areaKey: 'behala', areaName: 'Behala' },
    ],
  },
  {
    stateKey: 'rajasthan',
    stateName: 'Rajasthan',
    areas: [
      { areaKey: 'vaishali_nagar', areaName: 'Vaishali Nagar' },
      { areaKey: 'malviya_nagar', areaName: 'Malviya Nagar' },
      { areaKey: 'mansarovar', areaName: 'Mansarovar' },
      { areaKey: 'tonk_road', areaName: 'Tonk Road' },
      { areaKey: 'jagatpura', areaName: 'Jagatpura' },
      { areaKey: 'c_scheme', areaName: 'C-Scheme' },
      { areaKey: 'bapu_nagar', areaName: 'Bapu Nagar' },
      { areaKey: 'shyam_nagar', areaName: 'Shyam Nagar' },
      { areaKey: 'sitapura', areaName: 'Sitapura' },
      { areaKey: 'raja_park', areaName: 'Raja Park' },
    ],
  },
  {
    stateKey: 'kerala',
    stateName: 'Kerala',
    areas: [
      { areaKey: 'infopark', areaName: 'Infopark' },
      { areaKey: 'kakkanad', areaName: 'Kakkanad' },
      { areaKey: 'marine_drive', areaName: 'Marine Drive' },
      { areaKey: 'edappally', areaName: 'Edappally' },
      { areaKey: 'vyttila', areaName: 'Vyttila' },
      { areaKey: 'fort_kochi', areaName: 'Fort Kochi' },
      { areaKey: 'aluva', areaName: 'Aluva' },
      { areaKey: 'kaloor', areaName: 'Kaloor' },
      { areaKey: 'palarivattom', areaName: 'Palarivattom' },
      { areaKey: 'thrippunithura', areaName: 'Thrippunithura' },
    ],
  },
  {
    stateKey: 'tamil_nadu',
    stateName: 'Tamil Nadu',
    areas: [
      { areaKey: 't_nagar', areaName: 'T Nagar' },
      { areaKey: 'velachery', areaName: 'Velachery' },
      { areaKey: 'omr_it_corridor', areaName: 'OMR IT Corridor' },
      { areaKey: 'anna_nagar', areaName: 'Anna Nagar' },
      { areaKey: 'guindy', areaName: 'Guindy' },
      { areaKey: 'adyar', areaName: 'Adyar' },
      { areaKey: 'kodambakkam', areaName: 'Kodambakkam' },
      { areaKey: 'ambattur', areaName: 'Ambattur' },
      { areaKey: 'perungudi', areaName: 'Perungudi' },
      { areaKey: 'tambaram', areaName: 'Tambaram' },
    ],
  },
];

// Generate highlights based on area name
const generateHighlights = (_areaName: string, stateName: string): string[] => {
  const baseHighlights = [
    `Prime location in ${stateName}`,
    `High growth potential`,
    `Excellent connectivity`,
  ];
  
  // Add state-specific highlights
  if (stateName === 'Karnataka' || stateName === 'Telangana' || stateName === 'Tamil Nadu') {
    baseHighlights.push('Strong IT corridor presence');
  } else if (stateName === 'Maharashtra') {
    baseHighlights.push('Premium commercial hub');
  } else if (stateName === 'Delhi NCR') {
    baseHighlights.push('Metropolitan center');
  }
  
  return baseHighlights;
};

/**
 * Generate land slot ID in format: {stateKey}_{areaKey}_{slotNumber}
 * Example: karnataka_whitefield_001
 */
const generateLandSlotId = (
  stateKey: string,
  areaKey: string,
  slotNumber: number
): string => {
  const normalizedStateKey = stateKey.toLowerCase().trim();
  const normalizedAreaKey = areaKey.toLowerCase().trim();
  const paddedSlotNumber = slotNumber.toString().padStart(3, '0');
  return `${normalizedStateKey}_${normalizedAreaKey}_${paddedSlotNumber}`;
};

/**
 * Create land slots for an area
 * @param area - Area document
 * @param totalSlots - Total number of slots to create
 */
const createLandSlotsForArea = async (
  area: any,
  totalSlots: number
): Promise<number> => {
  const normalizedStateKey = area.stateKey.toLowerCase().trim();
  const normalizedAreaKey = area.areaKey.toLowerCase().trim();
  
  let createdCount = 0;
  const batchSize = 100; // Process in batches to avoid memory issues
  
  for (let i = 0; i < totalSlots; i += batchSize) {
    const slots: Partial<ILandSlot>[] = [];
    const endIndex = Math.min(i + batchSize, totalSlots);
    
    for (let slotNumber = i + 1; slotNumber <= endIndex; slotNumber++) {
      const landSlotId = generateLandSlotId(
        normalizedStateKey,
        normalizedAreaKey,
        slotNumber
      );
      
      slots.push({
        landSlotId: landSlotId,
        stateKey: normalizedStateKey,
        stateName: area.stateName,
        areaKey: normalizedAreaKey,
        areaName: area.areaName,
        slotNumber: slotNumber,
        status: 'AVAILABLE' as 'AVAILABLE',
        lockedBy: undefined,
        lockExpiresAt: undefined,
      });
    }
    
    // Use bulk operations for efficiency
    const operations = slots.map((slot) => ({
      updateOne: {
        filter: { landSlotId: slot.landSlotId },
        update: { $set: slot as any },
        upsert: true,
      },
    }));
    
    await LandSlot.bulkWrite(operations);
    createdCount += slots.length;
  }
  
  return createdCount;
};

const seedStatesAndAreas = async () => {
  try {
    console.log('🌱 Starting seed process...');
    
    // Connect to MongoDB
    await connectMongoDB();
    
    // Clear existing data (optional - comment out if you want to keep existing data)
    console.log('🗑️  Clearing existing states, areas, and land slots...');
    await State.deleteMany({});
    await Area.deleteMany({});
    await LandSlot.deleteMany({});
    
    // Seed states and areas
    let totalLandSlotsCreated = 0;
    
    for (const stateData of seedData) {
      // Normalize stateKey to lowercase for consistency with crypto payment flow
      const normalizedStateKey = stateData.stateKey.toLowerCase().trim();
      
      // Create or update state (store normalized key)
      const state = await State.findOneAndUpdate(
        { stateKey: normalizedStateKey },
        {
          stateKey: normalizedStateKey,
          stateName: stateData.stateName,
          enabled: true,
        },
        { upsert: true, new: true }
      );
      
      console.log(`✅ State created/updated: ${state.stateName} (${state.stateKey})`);
      
      // Create areas for this state
      for (const areaData of stateData.areas) {
        const highlights = generateHighlights(areaData.areaName, stateData.stateName);
        const normalizedAreaKey = areaData.areaKey.toLowerCase().trim();
        const totalSlots = 200; // Default slots per area
        
        const area = await Area.findOneAndUpdate(
          { areaKey: normalizedAreaKey },
          {
            stateKey: normalizedStateKey, // Use normalized state key
            stateName: stateData.stateName,
            areaKey: normalizedAreaKey,
            areaName: areaData.areaName,
            totalSlots: totalSlots,
            soldSlots: 0,
            pricePerTile: 1000,
            highlights: highlights,
            enabled: true,
          },
          { upsert: true, new: true }
        );
        
        console.log(`  ✅ Area created/updated: ${area.areaName} (${area.areaKey})`);
        
        // Create land slots for this area
        console.log(`    📦 Creating ${totalSlots} land slots for ${area.areaName}...`);
        const slotsCreated = await createLandSlotsForArea(area, totalSlots);
        totalLandSlotsCreated += slotsCreated;
        console.log(`    ✅ Created ${slotsCreated} land slots for ${area.areaName}`);
      }
    }
    
    console.log('✅ Seed process completed successfully!');
    console.log(`📊 Summary:`);
    console.log(`   - States: ${await State.countDocuments()}`);
    console.log(`   - Areas: ${await Area.countDocuments()}`);
    console.log(`   - Land Slots: ${await LandSlot.countDocuments()} (${totalLandSlotsCreated} created in this run)`);
    
    // Verify land slots are properly created
    const availableSlots = await LandSlot.countDocuments({ status: 'AVAILABLE' });
    const soldSlots = await LandSlot.countDocuments({ status: 'SOLD' });
    const lockedSlots = await LandSlot.countDocuments({ status: 'LOCKED' });
    console.log(`   - Available Slots: ${availableSlots}`);
    console.log(`   - Sold Slots: ${soldSlots}`);
    console.log(`   - Locked Slots: ${lockedSlots}`);
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Seed process failed:', error);
    process.exit(1);
  }
};

// Run seed if this file is executed directly
if (require.main === module) {
  seedStatesAndAreas();
}

export default seedStatesAndAreas;

