import mongoose, { Document, Schema } from 'mongoose';

export interface IPolygon extends Document {
  userId: mongoose.Types.ObjectId;
  name?: string;
  description?: string;
  geometry: {
    type: 'Polygon';
    coordinates: number[][][]; // GeoJSON Polygon format: [[[lng, lat], ...]]
  };
  areaInAcres: number;
  createdAt: Date;
  updatedAt: Date;
}

const PolygonSchema = new Schema<IPolygon>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User ID is required'],
      index: true,
    },
    name: {
      type: String,
      trim: true,
      maxlength: [100, 'Name cannot exceed 100 characters'],
    },
    description: {
      type: String,
      trim: true,
      maxlength: [500, 'Description cannot exceed 500 characters'],
    },
    geometry: {
      type: {
        type: String,
        enum: ['Polygon'],
        required: true,
      },
      coordinates: {
        type: [[[Number]]],
        required: true,
        validate: {
          validator: function(coords: number[][][]) {
            // Validate GeoJSON Polygon format
            // Must have at least 4 points (closed polygon)
            return coords.length > 0 && 
                   coords[0].length >= 4 && 
                   coords[0][0].length === 2;
          },
          message: 'Invalid Polygon coordinates. Must be [[[lng, lat], ...]] format with at least 4 points.',
        },
      },
    },
    areaInAcres: {
      type: Number,
      required: [true, 'Area is required'],
      min: [0, 'Area cannot be negative'],
    },
  },
  {
    timestamps: true,
  }
);

// Create 2dsphere index for geospatial queries
PolygonSchema.index({ geometry: '2dsphere' });

// Index on userId for faster user polygon queries
PolygonSchema.index({ userId: 1 });

// Compound index for user + creation date
PolygonSchema.index({ userId: 1, createdAt: -1 });

export default mongoose.model<IPolygon>('Polygon', PolygonSchema);

