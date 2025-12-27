import mongoose, { Document, Schema } from 'mongoose';

export interface IWithdrawalRequest extends Document {
  agentId: mongoose.Types.ObjectId; // User who requested withdrawal (AGENT)
  amountUSDT: string; // Amount to withdraw (stored as string)
  walletAddress: string; // Destination wallet address
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'COMPLETED';
  adminNotes?: string; // Admin notes for rejection/approval
  approvedBy?: mongoose.Types.ObjectId; // Admin who approved/rejected
  approvedAt?: Date; // Timestamp of approval/rejection
  payoutTxHash?: string; // Transaction hash when payout is completed
  createdAt: Date;
  updatedAt: Date;
}

const WithdrawalRequestSchema = new Schema<IWithdrawalRequest>(
  {
    agentId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Agent ID is required'],
      index: true,
    },
    amountUSDT: {
      type: String,
      required: [true, 'Amount is required'],
    },
    walletAddress: {
      type: String,
      required: [true, 'Wallet address is required'],
      trim: true,
    },
    status: {
      type: String,
      enum: ['PENDING', 'APPROVED', 'REJECTED', 'COMPLETED'],
      default: 'PENDING',
      required: true,
      index: true,
    },
    adminNotes: {
      type: String,
      trim: true,
    },
    approvedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
    approvedAt: {
      type: Date,
    },
    payoutTxHash: {
      type: String,
      trim: true,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes for fast lookups
WithdrawalRequestSchema.index({ agentId: 1, status: 1 }); // Agent's withdrawals by status
WithdrawalRequestSchema.index({ agentId: 1, createdAt: -1 }); // Agent's withdrawals sorted by date
WithdrawalRequestSchema.index({ status: 1, createdAt: -1 }); // Pending withdrawals for admin

export default mongoose.model<IWithdrawalRequest>('WithdrawalRequest', WithdrawalRequestSchema);

