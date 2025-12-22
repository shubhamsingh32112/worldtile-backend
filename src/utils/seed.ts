/**
 * Database seeding utility
 * Run this to populate initial land tiles
 */

import { connectMongoDB } from '../config/mongodb';
// TODO: PostGIS and LandTile model not implemented yet
// import { connectPostGIS } from '../config/postgis';
// import { initializeLandTileModel } from '../models/LandTile.model';
// import LandTile from '../models/LandTile.model';
import dotenv from 'dotenv';

dotenv.config();

const seedLandTiles = async () => {
  try {
    // Connect to databases
    await connectMongoDB();
    // TODO: PostGIS and LandTile model not implemented yet
    // await connectPostGIS();

    // Initialize models after connection
    // initializeLandTileModel();

    // TODO: LandTile seeding not implemented yet
    // Sample land tiles data
    /*
    const sampleTiles = [
      {
        tileId: 'TILE-001',
        coordinates: { x: 100, y: 200 },
        location: { type: 'Point', coordinates: [100, 200] },
        price: 50.00,
        region: 'Alpha Sector',
        status: 'available' as const,
        metadata: { tier: 1, features: ['basic'] },
      },
      // ... more tiles
    ];

    // Clear existing tiles (optional)
    await LandTile.destroy({ where: {}, truncate: true });

    // Insert sample tiles
    for (const tile of sampleTiles) {
      await LandTile.create({
        tileId: tile.tileId,
        coordinates: tile.coordinates,
        location: {
          type: 'Point',
          coordinates: [tile.location.coordinates[0], tile.location.coordinates[1]],
        },
        price: tile.price,
        region: tile.region,
        status: tile.status,
        metadata: tile.metadata,
      });
    }
    */

    console.log(`✅ MongoDB connected (LandTile seeding not implemented yet)`);
    process.exit(0);
  } catch (error) {
    console.error('❌ Seeding failed:', error);
    process.exit(1);
  }
};

seedLandTiles();

