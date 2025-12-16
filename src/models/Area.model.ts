import mongoose, { Document, Schema } from 'mongoose';

export interface IArea extends Document {
  stateKey: string;
  stateName: string;
  areaKey: string;
  areaName: string;
  totalSlots: number;
  soldSlots: number;
  pricePerTile: number;
  highlights: string[];
  enabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const AreaSchema = new Schema<IArea>(
  {
    stateKey: {
      type: String,
      required: [true, 'State key is required'],
      lowercase: true,
      trim: true,
      index: true,
    },
    stateName: {
      type: String,
      required: [true, 'State name is required'],
      trim: true,
    },
    areaKey: {
      type: String,
      required: [true, 'Area key is required'],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^[a-z0-9_]+$/, 'Area key must be lowercase alphanumeric with underscores only'],
    },
    areaName: {
      type: String,
      required: [true, 'Area name is required'],
      trim: true,
    },
    totalSlots: {
      type: Number,
      required: [true, 'Total slots is required'],
      min: [0, 'Total slots cannot be negative'],
    },
    soldSlots: {
      type: Number,
      required: [true, 'Sold slots is required'],
      default: 0,
      min: [0, 'Sold slots cannot be negative'],
      validate: {
        validator: function(this: IArea, value: number) {
          return value <= this.totalSlots;
        },
        message: 'Sold slots cannot exceed total slots',
      },
    },
    pricePerTile: {
      type: Number,
      required: [true, 'Price per tile is required'],
      min: [0, 'Price cannot be negative'],
    },
    highlights: {
      type: [String],
      default: [],
      validate: {
        validator: function(highlights: string[]) {
          return highlights.every(h => h.trim().length > 0);
        },
        message: 'All highlights must be non-empty strings',
      },
    },
    enabled: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes for fast queries
AreaSchema.index({ stateKey: 1, enabled: 1 });
AreaSchema.index({ areaKey: 1 });
AreaSchema.index({ enabled: 1 });

export default mongoose.model<IArea>('Area', AreaSchema);

