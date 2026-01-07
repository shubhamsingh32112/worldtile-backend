import mongoose, { Document, Schema } from 'mongoose';

export interface IReferralStats {
  totalReferrals: number;
  totalEarningsUSDT: string; // Store as string to avoid precision issues
}

export interface IAgentProfile {
  title: string;
  commissionRate: number;
  joinedAt: Date;
}

export interface IWallet {
  address: string;
  type: 'EOA' | 'IN_APP';
  provider: 'metamask' | 'walletconnect' | 'google' | 'email';
  isPrimary: boolean;
  createdAt: Date;
}

export interface IUser extends Document {
  name: string;
  email?: string; // Optional - may not have email for EOA-only users
  photoUrl?: string;
  phoneNumber?: string;
  walletAddress?: string; // DEPRECATED - kept for backward compatibility, use primaryWallet instead
  wallets: IWallet[]; // All linked wallets
  primaryWallet: string; // Canonical identity - address of primary wallet
  fullName?: string; // Full name for withdrawal profile
  tronWalletAddress?: string; // TRON wallet address for withdrawals
  savedWithdrawalDetails?: boolean; // Whether user has saved withdrawal details
  userPendingMessage?: string; // Pending notification message for user
  role: 'USER' | 'AGENT' | 'ADMIN'; // User role (default: USER)
  referralCode?: string; // Auto-generated unique code
  referredBy?: mongoose.Types.ObjectId; // Reference to User who referred this user
  referralStats?: IReferralStats;
  agentProfile?: IAgentProfile;
  createdAt: Date;
  updatedAt: Date;
}

const WalletSchema = new Schema<IWallet>(
  {
    address: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },
    type: {
      type: String,
      enum: ['EOA', 'IN_APP'],
      required: true,
    },
    provider: {
      type: String,
      enum: ['metamask', 'walletconnect', 'google', 'email'],
      required: true,
    },
    isPrimary: {
      type: Boolean,
      default: false,
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: false }
);

const UserSchema = new Schema<IUser>(
  {
    name: {
      type: String,
      required: [true, 'Name is required'],
      trim: true,
    },
    email: {
      type: String,
      required: false, // Optional - EOA users may not have email
      unique: true,
      sparse: true, // Allows multiple nulls but enforces uniqueness for non-null
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, 'Please provide a valid email'],
    },
    photoUrl: {
      type: String,
      trim: true,
    },
    phoneNumber: {
      type: String,
      trim: true,
    },
    walletAddress: {
      type: String,
      required: false, // DEPRECATED - kept for backward compatibility
      unique: false, // Remove unique constraint
      trim: true,
      index: true,
    },
    wallets: {
      type: [WalletSchema],
      default: [],
      required: true,
    },
    primaryWallet: {
      type: String,
      required: [true, 'Primary wallet address is required'],
      trim: true,
      lowercase: true,
      index: true,
    },
    fullName: {
      type: String,
      trim: true,
    },
    tronWalletAddress: {
      type: String,
      trim: true,
    },
    savedWithdrawalDetails: {
      type: Boolean,
      default: false,
    },
    userPendingMessage: {
      type: String,
      trim: true,
    },
    role: {
      type: String,
      enum: ['USER', 'AGENT', 'ADMIN'],
      default: 'USER',
      required: true,
      index: true,
    },
    referralCode: {
      type: String,
      unique: true,
      sparse: true, // Allows nulls but enforces uniqueness for non-null
      uppercase: true,
      trim: true,
      index: true,
    },
    referredBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true,
      immutable: true, // Once set, cannot be changed
    },
    referralStats: {
      totalReferrals: {
        type: Number,
        default: 0,
        min: 0,
      },
      totalEarningsUSDT: {
        type: String,
        default: '0',
      },
    },
    agentProfile: {
      title: {
        type: String,
        default: 'Independent Land Agent',
      },
      commissionRate: {
        type: Number,
        default: 0.25,
        min: 0,
        max: 1,
      },
      joinedAt: {
        type: Date,
        default: Date.now,
      },
    },
  },
  {
    timestamps: true,
  }
);

/**
 * Generate referral code in format: WT-XXXXYN
 * Where:
 * - WT = World Tile (fixed prefix)
 * - XXXX = first 4 letters of user's name (uppercase, padded with X if needed)
 * - Y = random number (0-9)
 * - N = random letter (A-Z)
 * 
 * Example: WT-SHUB7A, WT-RAJU4K, WT-ANIL9Q
 */
function generateReferralCode(userName: string): string {
  const prefix = 'WT';
  
  // Take first 4 letters, remove non-alphabetic characters, uppercase, pad if needed
  const namePart = userName
    .replace(/[^a-zA-Z]/g, '') // Remove non-alphabetic characters
    .toUpperCase()
    .padEnd(4, 'X') // Pad with X if name is shorter than 4 characters
    .slice(0, 4); // Take only first 4 characters
  
  // Random number (0-9)
  const randomNumber = Math.floor(Math.random() * 10);
  
  // Random letter (A-Z)
  const randomLetter = String.fromCharCode(65 + Math.floor(Math.random() * 26));
  
  return `${prefix}-${namePart}${randomNumber}${randomLetter}`;
}

// Generate referral code before saving (if new user and no code exists)
UserSchema.pre('save', async function (next) {
  // Ensure wallets array exists
  if (!this.wallets || this.wallets.length === 0) {
    return next(new Error('User must have at least one wallet'));
  }

  // Ensure first wallet is marked as primary if no primaryWallet is set
  if (!this.primaryWallet && this.wallets.length > 0) {
    this.primaryWallet = this.wallets[0].address.toLowerCase();
    this.wallets[0].isPrimary = true;
  }

  // Ensure exactly one wallet is marked as primary
  const primaryCount = this.wallets.filter(w => w.isPrimary).length;
  if (primaryCount === 0 && this.wallets.length > 0) {
    this.wallets[0].isPrimary = true;
    this.primaryWallet = this.wallets[0].address.toLowerCase();
  } else if (primaryCount > 1) {
    // If multiple are marked primary, keep only the first one
    let foundFirst = false;
    this.wallets.forEach(wallet => {
      if (wallet.isPrimary && !foundFirst) {
        foundFirst = true;
      } else if (wallet.isPrimary) {
        wallet.isPrimary = false;
      }
    });
  }

  // Backward compatibility: set walletAddress from primaryWallet if not set
  if (!this.walletAddress && this.primaryWallet) {
    this.walletAddress = this.primaryWallet;
  }

  // Generate referral code if it doesn't exist
  if (this.isNew && !this.referralCode) {
    let code: string = '';
    let isUnique = false;
    const UserModel = this.constructor as typeof mongoose.Model;
    
    // Generate code in format WT-XXXXYN and ensure uniqueness
    while (!isUnique) {
      code = generateReferralCode(this.name);
      
      // Check if code already exists
      const existing = await UserModel.findOne({ referralCode: code });
      if (!existing) {
        isUnique = true;
      }
    }
    
    this.referralCode = code;
  }
  
  // Initialize referralStats if not present
  if (!this.referralStats) {
    this.referralStats = {
      totalReferrals: 0,
      totalEarningsUSDT: '0',
    };
  }

  // Note: agentProfile is only set when user is promoted to AGENT
  // Do NOT initialize it for new users (they start as USER role)
  
  next();
});

// ADMIN SAFETY LOCK: Prevent role from being set to ADMIN via API
// Admins can ONLY be assigned in database directly (DB-only operation)
UserSchema.pre('save', function (next) {
  // If this is an update (not a new document) and role is being set to ADMIN
  if (!this.isNew && this.isModified('role') && this.role === 'ADMIN') {
    return next(new Error('Cannot set role to ADMIN via API. Admin assignment is DB-only.'));
  }
  next();
});

// Also block ADMIN role in update operations
UserSchema.pre(['updateOne', 'findOneAndUpdate', 'updateMany'], function (next) {
  const update = this.getUpdate() as any;
  // Check if role is being set to ADMIN in the update
  if (update && (update.role === 'ADMIN' || update.$set?.role === 'ADMIN')) {
    return next(new Error('Cannot set role to ADMIN via API. Admin assignment is DB-only.'));
  }
  next();
});

// Remove password from JSON output (no longer needed, but keeping for safety)
UserSchema.methods.toJSON = function () {
  const userObject = this.toObject();
  return userObject;
};

export default mongoose.model<IUser>('User', UserSchema);

