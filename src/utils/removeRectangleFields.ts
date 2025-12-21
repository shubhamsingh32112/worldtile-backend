/**
 * MongoDB Migration Script: Remove Rectangle Fields
 * 
 * This script removes all rectangle-specific fields from the polygons collection.
 * Run this script ONCE to clean up existing data.
 * 
 * Usage:
 *   npx ts-node src/utils/removeRectangleFields.ts
 * 
 * Or with tsx:
 *   npx tsx src/utils/removeRectangleFields.ts
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Polygon from '../models/Polygon.model';

// Load environment variables
dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/worldtile';

async function removeRectangleFields() {
  try {
    // Connect to MongoDB
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    // Count documents before cleanup
    const totalCount = await Polygon.countDocuments();
    console.log(`📊 Total polygons in database: ${totalCount}`);

    // Remove rectangle-specific fields from all documents
    // Note: Since Polygon model doesn't have these fields in schema,
    // we use updateMany with $unset to remove any that might exist in raw documents
    const result = await Polygon.updateMany(
      {},
      {
        $unset: {
          center: '',
          widthMeters: '',
          heightMeters: '',
          rotationDegrees: '',
          areaInMetersSquared: '',
          areaIncreaseHistory: '',
          rectangleId: '',
          rectangle: '',
          geometryType: '',
        },
      }
    );

    console.log(`✅ Updated ${result.modifiedCount} documents`);
    console.log(`📝 Matched ${result.matchedCount} documents`);

    // Verify cleanup
    const sampleDoc = await Polygon.findOne();
    if (sampleDoc) {
      const doc = sampleDoc.toObject();
      const rectangleFields = [
        'center',
        'widthMeters',
        'heightMeters',
        'rotationDegrees',
        'areaInMetersSquared',
        'areaIncreaseHistory',
        'rectangleId',
        'rectangle',
      ];
      
      const foundFields = rectangleFields.filter(field => doc[field] !== undefined);
      if (foundFields.length > 0) {
        console.log(`⚠️  Warning: Found remaining rectangle fields: ${foundFields.join(', ')}`);
      } else {
        console.log('✅ Verified: No rectangle fields found in sample document');
      }
    }

    console.log('✅ Migration completed successfully');
  } catch (error) {
    console.error('❌ Error during migration:', error);
    throw error;
  } finally {
    // Close connection
    await mongoose.connection.close();
    console.log('🔌 MongoDB connection closed');
  }
}

// Run migration
if (require.main === module) {
  removeRectangleFields()
    .then(() => {
      console.log('🎉 Migration completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('💥 Migration failed:', error);
      process.exit(1);
    });
}

export default removeRectangleFields;

