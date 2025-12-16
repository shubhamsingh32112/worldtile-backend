import mongoose, { Document, Schema } from 'mongoose';

export interface ILandSlot extends Document {
  landSlotId: string; // Unique identifier for the slot (e.g., "karnataka_whitefield_001")
  stateKey: string;
  stateName: string;
  areaKey: string;
  areaName: string;
  slotNumber: number; // Slot number within the area (1, 2, 3, ...)
  status: 'AVAILABLE' | 'LOCKED' | 'SOLD';
  lockedBy?: mongoose.Types.ObjectId; // User ID who locked this slot
  lockExpiresAt?: Date; // When the lock expires (15 minutes from lock time)
  createdAt: Date;
  updatedAt: Date;
}

const LandSlotSchema = new Schema<ILandSlot>(
  {
    landSlotId: {
      type: String,
      required: [true, 'Land slot ID is required'],
      unique: true,
      trim: true,
      index: true,
    },
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
      lowercase: true,
      trim: true,
      index: true,
    },
    areaName: {
      type: String,
      required: [true, 'Area name is required'],
      trim: true,
    },
    slotNumber: {
      type: Number,
      required: [true, 'Slot number is required'],
      min: [1, 'Slot number must be at least 1'],
    },
    status: {
      type: String,
      enum: ['AVAILABLE', 'LOCKED', 'SOLD'],
      default: 'AVAILABLE',
      required: true,
      index: true,
    },
    lockedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    lockExpiresAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// Compound index for finding available slots in an area
LandSlotSchema.index({ areaKey: 1, status: 1 });
LandSlotSchema.index({ status: 1, lockExpiresAt: 1 }); // For finding expired locks

export default mongoose.model<ILandSlot>('LandSlot', LandSlotSchema);

