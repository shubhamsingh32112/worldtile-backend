import mongoose, { Document, Schema } from 'mongoose';

export interface IUserLand extends Document {
  userId: mongoose.Types.ObjectId; // Reference to User
  landSlotId: string; // Reference to LandSlot
  state: string; // State key (e.g., "karnataka")
  place: string; // Area/place key (e.g., "btm_layout")
  orderId: mongoose.Types.ObjectId; // Reference to Order that created this ownership
  paymentTxHash: string; // Transaction hash from payment
  acquiredAt: Date; // Timestamp when ownership was transferred
  // Legacy fields (for backward compatibility)
  stateKey?: string; // @deprecated - use state
  areaKey?: string; // @deprecated - use place
  purchasedAt?: Date; // @deprecated - use acquiredAt
  purchasePriceUSDT?: string; // @deprecated - kept for historical records
  createdAt: Date;
  updatedAt: Date;
}

const UserLandSchema = new Schema<IUserLand>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User ID is required'],
      // Index created via compound indexes below
    },
    landSlotId: {
      type: String,
      required: [true, 'Land slot ID is required'],
      trim: true,
    },
    state: {
      type: String,
      required: [true, 'State is required'],
      lowercase: true,
      trim: true,
      // Index created via compound indexes below
    },
    place: {
      type: String,
      required: [true, 'Place is required'],
      lowercase: true,
      trim: true,
      index: true,
    },
    orderId: {
      type: Schema.Types.ObjectId,
      ref: 'Order',
      required: [true, 'Order ID is required'],
    },
    paymentTxHash: {
      type: String,
      required: [true, 'Payment transaction hash is required'],
      trim: true,
      index: true,
    },
    acquiredAt: {
      type: Date,
      required: [true, 'Acquisition timestamp is required'],
      default: Date.now,
    },
    // Legacy fields (for backward compatibility)
    stateKey: {
      type: String,
      lowercase: true,
      trim: true,
    },
    areaKey: {
      type: String,
      lowercase: true,
      trim: true,
    },
    purchasedAt: {
      type: Date,
    },
    purchasePriceUSDT: {
      type: String,
    },
  },
  {
    timestamps: true,
  }
);

// Middleware to sync legacy fields from new fields (for backward compatibility)
UserLandSchema.pre('save', function (next) {
  // Sync new fields to legacy fields if legacy fields are not set
  if (this.state && !this.stateKey) {
    this.stateKey = this.state;
  }
  if (this.place && !this.areaKey) {
    this.areaKey = this.place;
  }
  if (this.acquiredAt && !this.purchasedAt) {
    this.purchasedAt = this.acquiredAt;
  }
  
  // Sync legacy fields to new fields if new fields are not set (for migration)
  if (!this.state && this.stateKey) {
    this.state = this.stateKey;
  }
  if (!this.place && this.areaKey) {
    this.place = this.areaKey;
  }
  if (!this.acquiredAt && this.purchasedAt) {
    this.acquiredAt = this.purchasedAt;
  }
  
  next();
});

// Compound indexes for common queries
UserLandSchema.index({ userId: 1, acquiredAt: -1 }); // User's lands sorted by acquisition date
UserLandSchema.index({ userId: 1, state: 1 }); // User's lands by state
UserLandSchema.index({ userId: 1, place: 1 }); // User's lands by place
UserLandSchema.index({ landSlotId: 1 }, { unique: true }); // One ownership record per slot (CRITICAL: prevents double ownership)
UserLandSchema.index({ userId: 1, landSlotId: 1 }, { unique: true }); // CRITICAL: Prevent same user from owning same slot twice
UserLandSchema.index({ orderId: 1 }); // Lands by order
UserLandSchema.index({ paymentTxHash: 1 }); // Lookup by payment transaction
// Legacy indexes (for backward compatibility)
UserLandSchema.index({ userId: 1, purchasedAt: -1 }); // Legacy: User's lands sorted by purchase date
UserLandSchema.index({ userId: 1, stateKey: 1 }); // Legacy: User's lands by state
UserLandSchema.index({ userId: 1, areaKey: 1 }); // Legacy: User's lands by area

export default mongoose.model<IUserLand>('UserLand', UserLandSchema);

