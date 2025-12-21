import mongoose, { Document, Schema } from 'mongoose';

export interface IPaymentTransaction extends Document {
  txHash: string; // Unique transaction hash
  orderId: mongoose.Types.ObjectId; // Reference to Order
  userId: mongoose.Types.ObjectId; // Reference to User (direct access, no join needed)
  fromAddress: string; // Sender's wallet address
  toAddress: string; // Recipient's wallet address (usdtAddress)
  tokenContract: string; // USDT contract address
  amountUSDT: string; // Amount in USDT (stored as string)
  blockTimestamp: Date; // Block timestamp from blockchain
  confirmations: number; // Number of confirmations
  raw: Record<string, any>; // Full TronGrid payload for audits
  createdAt: Date;
  updatedAt: Date;
}

const PaymentTransactionSchema = new Schema<IPaymentTransaction>(
  {
    txHash: {
      type: String,
      required: [true, 'Transaction hash is required'],
      unique: true,
      trim: true,
    },
    orderId: {
      type: Schema.Types.ObjectId,
      ref: 'Order',
      required: [true, 'Order ID is required'],
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User ID is required'],
      index: true,
    },
    fromAddress: {
      type: String,
      required: [true, 'From address is required'],
      trim: true,
    },
    toAddress: {
      type: String,
      required: [true, 'To address is required'],
      trim: true,
    },
    tokenContract: {
      type: String,
      required: [true, 'Token contract address is required'],
      trim: true,
    },
    amountUSDT: {
      type: String,
      required: [true, 'Amount in USDT is required'],
    },
    blockTimestamp: {
      type: Date,
      required: [true, 'Block timestamp is required'],
    },
    confirmations: {
      type: Number,
      default: 0,
      min: [0, 'Confirmations cannot be negative'],
    },
    raw: {
      type: Schema.Types.Mixed,
      required: [true, 'Raw transaction data is required'],
    },
  },
  {
    timestamps: true,
  }
);

// Indexes for fast lookups
// Note: txHash index is automatically created by unique: true in field definition
PaymentTransactionSchema.index({ orderId: 1 });
PaymentTransactionSchema.index({ userId: 1 }); // Direct user payment queries
PaymentTransactionSchema.index({ toAddress: 1 });
PaymentTransactionSchema.index({ fromAddress: 1 });
PaymentTransactionSchema.index({ blockTimestamp: -1 }); // For chronological queries

export default mongoose.model<IPaymentTransaction>('PaymentTransaction', PaymentTransactionSchema);

