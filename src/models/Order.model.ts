import mongoose, { Document, Schema } from 'mongoose';

export interface INFT {
  chain?: string;
  contractAddress?: string;
  tokenId?: string;
  txHash?: string;
}

export interface IPayment {
  expectedAmountUSDT: string; // String to avoid precision issues
  paidAmountUSDT?: string; // Actual amount paid
  overpaidAmountUSDT?: string; // Overpaid amount if payment exceeds expected
  txHash?: string; // Transaction hash (nullable)
  confirmations: number; // Default 0
  paidAt?: Date; // Timestamp when payment was confirmed
}

export interface IExpiry {
  expiresAt: Date; // Order expiry timestamp
  expiredAt?: Date; // Timestamp when order actually expired
}

export interface IReferral {
  referrerId?: mongoose.Types.ObjectId; // User who referred the buyer
  commissionRate?: number; // Commission rate (e.g., 0.25 for 25%)
  commissionAmountUSDT?: string; // Calculated commission amount
}

export interface IOrder extends Document {
  userId: mongoose.Types.ObjectId;
  state: string; // stateKey
  place: string; // areaKey
  landSlotIds: string[]; // Array of land slot IDs for multiple tiles
  quantity: number; // Number of tiles in this order
  usdtAddress: string; // Fixed Ledger address
  network: string; // "TRC20"
  status: 'PENDING' | 'PAID' | 'FAILED' | 'EXPIRED' | 'LATE_PAYMENT';
  
  // New nested structures
  payment: IPayment;
  expiry: IExpiry;
  referral?: IReferral;
  
  // Legacy fields (kept for backward compatibility)
  expectedAmountUSDT?: string; // @deprecated - use payment.expectedAmountUSDT
  txHash?: string; // @deprecated - use payment.txHash
  confirmations?: number; // @deprecated - use payment.confirmations
  overpaidAmountUSDT?: string; // @deprecated - use payment.overpaidAmountUSDT
  expiresAt?: Date; // @deprecated - use expiry.expiresAt
  paidAt?: Date; // @deprecated - use payment.paidAt
  
  nft: INFT; // Keep empty for now
  createdAt: Date;
  updatedAt: Date;
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
      enum: ['PENDING', 'PAID', 'FAILED', 'EXPIRED', 'LATE_PAYMENT'],
      default: 'PENDING',
      required: true,
      index: true,
    },
    // New nested payment structure
    payment: {
      expectedAmountUSDT: {
        type: String,
        required: [true, 'Expected amount in USDT is required'],
      },
      paidAmountUSDT: {
        type: String,
        default: null,
      },
      overpaidAmountUSDT: {
        type: String,
        default: null,
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
      paidAt: {
        type: Date,
        default: null,
      },
    },
    // New nested expiry structure
    expiry: {
      expiresAt: {
        type: Date,
        required: [true, 'Order expiry time is required'],
      },
      expiredAt: {
        type: Date,
        default: null,
      },
    },
    // New nested referral structure (IMMUTABLE SNAPSHOT - set once at order creation)
    referral: {
      referrerId: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        default: null,
        immutable: true, // Once set, cannot be changed
      },
      commissionRate: {
        type: Number,
        default: null,
        min: [0, 'Commission rate cannot be negative'],
        max: [1, 'Commission rate cannot exceed 1'],
        immutable: true, // Immutable snapshot of commission rate at purchase
      },
      commissionRateAtPurchase: {
        type: Number,
        default: null,
        min: [0, 'Commission rate cannot be negative'],
        max: [1, 'Commission rate cannot exceed 1'],
        immutable: true, // Explicit snapshot field (alias for commissionRate)
      },
      commissionAmountUSDT: {
        type: String,
        default: null,
        immutable: true, // Immutable snapshot of commission amount
      },
    },
    // Legacy fields (kept for backward compatibility - will be populated from nested structures)
    expectedAmountUSDT: {
      type: String,
      default: null, // Will be synced from payment.expectedAmountUSDT
    },
    txHash: {
      type: String,
      trim: true,
      default: null,
      sparse: true,
    },
    confirmations: {
      type: Number,
      default: 0,
      min: [0, 'Confirmations cannot be negative'],
    },
    overpaidAmountUSDT: {
      type: String,
      default: null,
    },
    expiresAt: {
      type: Date,
      default: null, // Will be synced from expiry.expiresAt
    },
    paidAt: {
      type: Date,
      default: null, // Will be synced from payment.paidAt
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
  },
  {
    timestamps: true,
  }
);

// Prevent updates to referral field after order creation (immutable snapshot)
OrderSchema.pre(['updateOne', 'findOneAndUpdate', 'updateMany'], function (next) {
  const update = this.getUpdate() as any;
  // Block any attempt to modify referral field
  if (update && (update.referral || update.$set?.referral)) {
    return next(new Error('Referral field is immutable and cannot be updated after order creation'));
  }
  next();
});

// Middleware to sync legacy fields from nested structures (for backward compatibility)
OrderSchema.pre('save', function (next) {
  // Sync commissionRate to commissionRateAtPurchase if not set
  if (this.referral && this.referral.commissionRate && !this.referral.commissionRateAtPurchase) {
    this.referral.commissionRateAtPurchase = this.referral.commissionRate;
  }
  // Sync payment fields to legacy fields
  if (this.payment) {
    if (this.payment.expectedAmountUSDT && !this.expectedAmountUSDT) {
      this.expectedAmountUSDT = this.payment.expectedAmountUSDT;
    }
    if (this.payment.txHash && !this.txHash) {
      this.txHash = this.payment.txHash;
    }
    if (this.payment.confirmations !== undefined && this.confirmations === 0) {
      this.confirmations = this.payment.confirmations;
    }
    if (this.payment.overpaidAmountUSDT && !this.overpaidAmountUSDT) {
      this.overpaidAmountUSDT = this.payment.overpaidAmountUSDT;
    }
    if (this.payment.paidAt && !this.paidAt) {
      this.paidAt = this.payment.paidAt;
    }
  }
  
  // Sync expiry fields to legacy fields
  if (this.expiry) {
    if (this.expiry.expiresAt && !this.expiresAt) {
      this.expiresAt = this.expiry.expiresAt;
    }
  }
  
  // Sync legacy fields to nested structures (if nested is empty but legacy has data)
  if (!this.payment || !this.payment.expectedAmountUSDT) {
    if (this.expectedAmountUSDT) {
      if (!this.payment) {
        this.payment = {} as IPayment;
      }
      this.payment.expectedAmountUSDT = this.expectedAmountUSDT;
      this.payment.confirmations = this.confirmations || 0;
      if (this.txHash) this.payment.txHash = this.txHash;
      if (this.overpaidAmountUSDT) this.payment.overpaidAmountUSDT = this.overpaidAmountUSDT;
      if (this.paidAt) this.payment.paidAt = this.paidAt;
    }
  }
  
  if (!this.expiry || !this.expiry.expiresAt) {
    if (this.expiresAt) {
      if (!this.expiry) {
        this.expiry = {} as IExpiry;
      }
      this.expiry.expiresAt = this.expiresAt;
    }
  }
  
  next();
});

// Unique sparse index on payment.txHash (allows multiple nulls, enforces uniqueness for non-null)
OrderSchema.index({ 'payment.txHash': 1 }, { unique: true, sparse: true });
// Legacy txHash index (for backward compatibility)
OrderSchema.index({ txHash: 1 }, { unique: true, sparse: true });
// Index on landSlotIds for fast lookups
OrderSchema.index({ landSlotIds: 1 });
// Index on userId and status for user order queries
OrderSchema.index({ userId: 1, status: 1 });
// Index on expiry.expiresAt for finding expired orders
OrderSchema.index({ 'expiry.expiresAt': 1 });
// Legacy expiresAt index (for backward compatibility)
OrderSchema.index({ expiresAt: 1 });
// Index on referral.referrerId for referral queries
OrderSchema.index({ 'referral.referrerId': 1 });

export default mongoose.model<IOrder>('Order', OrderSchema);

