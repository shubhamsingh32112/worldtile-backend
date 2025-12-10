/**
 * Database seeding utility
 * Run this to populate initial land tiles
 */

import { connectMongoDB } from '../config/mongodb';
import { connectPostGIS } from '../config/postgis';
import { initializeLandTileModel } from '../models/LandTile.model';
import LandTile from '../models/LandTile.model';
import dotenv from 'dotenv';

dotenv.config();

const seedLandTiles = async () => {
  try {
    // Connect to databases
    await connectMongoDB();
    await connectPostGIS();

    // Initialize models after connection
    initializeLandTileModel();

    // Sample land tiles data
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
      {
        tileId: 'TILE-002',
        coordinates: { x: 150, y: 250 },
        location: { type: 'Point', coordinates: [150, 250] },
        price: 75.00,
        region: 'Beta Sector',
        status: 'available' as const,
        metadata: { tier: 2, features: ['premium'] },
      },
      {
        tileId: 'TILE-003',
        coordinates: { x: 200, y: 300 },
        location: { type: 'Point', coordinates: [200, 300] },
        price: 100.00,
        region: 'Gamma Sector',
        status: 'locked' as const,
        metadata: { tier: 3, features: ['exclusive'] },
      },
      {
        tileId: 'TILE-004',
        coordinates: { x: 250, y: 350 },
        location: { type: 'Point', coordinates: [250, 350] },
        price: 125.00,
        region: 'Alpha Sector',
        status: 'available' as const,
        metadata: { tier: 1, features: ['basic'] },
      },
      {
        tileId: 'TILE-005',
        coordinates: { x: 300, y: 400 },
        location: { type: 'Point', coordinates: [300, 400] },
        price: 150.00,
        region: 'Beta Sector',
        status: 'available' as const,
        metadata: { tier: 2, features: ['premium'] },
      },
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

    console.log(`✅ Seeded ${sampleTiles.length} land tiles`);
    process.exit(0);
  } catch (error) {
    console.error('❌ Seeding failed:', error);
    process.exit(1);
  }
};

seedLandTiles();

