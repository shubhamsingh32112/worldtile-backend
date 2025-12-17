import mongoose, { Document, Schema } from 'mongoose';

export interface INFT {
  chain?: string;
  contractAddress?: string;
  tokenId?: string;
  txHash?: string;
}

export interface IOrder extends Document {
  userId: mongoose.Types.ObjectId;
  state: string; // stateKey
  place: string; // areaKey
  landSlotIds: string[]; // Array of land slot IDs for multiple tiles
  quantity: number; // Number of tiles in this order
  expectedAmountUSDT: string; // String to avoid precision issues (total for all tiles)
  usdtAddress: string; // Fixed Ledger address
  network: string; // "TRC20"
  status: 'PENDING' | 'PAID' | 'FAILED';
  txHash?: string; // Transaction hash (nullable)
  confirmations: number; // Default 0
  nft: INFT; // Keep empty for now
  createdAt: Date;
  paidAt?: Date;
}

const OrderSchema = new Schema<IOrder>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User ID is required'],
      index: true,
    },
    state: {
      type: String,
      required: [true, 'State is required'],
      lowercase: true,
      trim: true,
      index: true,
    },
    place: {
      type: String,
      required: [true, 'Place (area) is required'],
      lowercase: true,
      trim: true,
      index: true,
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
      index: true,
    },
    quantity: {
      type: Number,
      required: [true, 'Quantity is required'],
      min: [1, 'Quantity must be at least 1'],
      validate: {
        validator: function(this: IOrder, value: number) {
          return value === this.landSlotIds.length;
        },
        message: 'Quantity must match the number of land slot IDs',
      },
    },
    expectedAmountUSDT: {
      type: String,
      required: [true, 'Expected amount in USDT is required'],
    },
    usdtAddress: {
      type: String,
      required: [true, 'USDT address is required'],
      trim: true,
    },
    network: {
      type: String,
      required: [true, 'Network is required'],
      default: 'TRC20',
      enum: ['TRC20'],
    },
    status: {
      type: String,
      enum: ['PENDING', 'PAID', 'FAILED'],
      default: 'PENDING',
      required: true,
      index: true,
    },
    txHash: {
      type: String,
      trim: true,
      default: null,
      sparse: true, // Allows multiple nulls but enforces uniqueness for non-null values
    },
    confirmations: {
      type: Number,
      default: 0,
      min: [0, 'Confirmations cannot be negative'],
    },
    nft: {
      chain: {
        type: String,
        default: null,
      },
      contractAddress: {
        type: String,
        default: null,
      },
      tokenId: {
        type: String,
        default: null,
      },
      txHash: {
        type: String,
        default: null,
      },
    },
    paidAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// Unique sparse index on txHash (allows multiple nulls, enforces uniqueness for non-null)
OrderSchema.index({ txHash: 1 }, { unique: true, sparse: true });
// Index on landSlotIds for fast lookups
OrderSchema.index({ landSlotIds: 1 });
// Index on userId and status for user order queries
OrderSchema.index({ userId: 1, status: 1 });

export default mongoose.model<IOrder>('Order', OrderSchema);

