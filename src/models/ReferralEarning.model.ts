import mongoose, { Document, Schema } from 'mongoose';

export interface IReferralEarning extends Document {
  referrerId: mongoose.Types.ObjectId; // User who referred (earns commission)
  referredUserId: mongoose.Types.ObjectId; // User who was referred (made purchase)
  orderId: mongoose.Types.ObjectId; // Order that generated this commission
  landSlotIds: string[]; // Land slots purchased in this order
  purchaseAmountUSDT: string; // Total purchase amount (stored as string)
  commissionRate: number; // Commission rate (e.g., 0.25 for 25%)
  commissionAmountUSDT: string; // Calculated commission amount (stored as string)
  txHash: string; // Transaction hash from the order payment
  status: 'PENDING' | 'EARNED' | 'PAID'; // Status of the commission
  createdAt: Date;
  updatedAt: Date;
}

const ReferralEarningSchema = new Schema<IReferralEarning>(
  {
    referrerId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Referrer ID is required'],
      index: true,
    },
    referredUserId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Referred user ID is required'],
    },
    orderId: {
      type: Schema.Types.ObjectId,
      ref: 'Order',
      required: [true, 'Order ID is required'],
    },
    landSlotIds: {
      type: [String],
      required: [true, 'Land slot IDs are required'],
      validate: {
        validator: function(ids: string[]) {
          return ids.length > 0;
        },
        message: 'At least one land slot ID is required',
      },
    },
    purchaseAmountUSDT: {
      type: String,
      required: [true, 'Purchase amount is required'],
    },
    commissionRate: {
      type: Number,
      required: [true, 'Commission rate is required'],
      min: [0, 'Commission rate cannot be negative'],
      max: [1, 'Commission rate cannot exceed 1'],
    },
    commissionAmountUSDT: {
      type: String,
      required: [true, 'Commission amount is required'],
    },
    txHash: {
      type: String,
      required: [true, 'Transaction hash is required'],
      trim: true,
    },
    status: {
      type: String,
      enum: ['PENDING', 'EARNED', 'PAID'],
      default: 'EARNED',
      required: true,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes for fast lookups
ReferralEarningSchema.index({ referrerId: 1, status: 1 }); // Referrer's earnings by status
ReferralEarningSchema.index({ referrerId: 1, createdAt: -1 }); // Referrer's earnings sorted by date
ReferralEarningSchema.index({ orderId: 1 }); // Earnings by order
ReferralEarningSchema.index({ txHash: 1 }); // Earnings by transaction hash
ReferralEarningSchema.index({ status: 1 }); // Earnings by status

export default mongoose.model<IReferralEarning>('ReferralEarning', ReferralEarningSchema);

