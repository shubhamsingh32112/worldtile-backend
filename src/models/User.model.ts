import mongoose, { Document, Schema } from 'mongoose';
import bcrypt from 'bcryptjs';

export interface IReferralStats {
  totalReferrals: number;
  totalEarningsUSDT: string; // Store as string to avoid precision issues
}

export interface IAgentProfile {
  title: string;
  commissionRate: number;
  joinedAt: Date;
}

export interface IUser extends Document {
  name: string;
  email: string;
  password?: string;
  firebaseUid?: string;
  photoUrl?: string;
  phoneNumber?: string;
  walletAddress?: string;
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
  comparePassword(candidatePassword: string): Promise<boolean>;
}

const UserSchema = new Schema<IUser>(
  {
    name: {
      type: String,
      required: [true, 'Name is required'],
      trim: true,
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, 'Please provide a valid email'],
    },
    password: {
      type: String,
      required: function() {
        return !this.firebaseUid; // Password required only if not using Firebase
      },
      minlength: [6, 'Password must be at least 6 characters'],
    },
    firebaseUid: {
      type: String,
      unique: true,
      sparse: true, // Allows multiple null values
      trim: true,
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
      trim: true,
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

// Hash password before saving (only if password is provided)
UserSchema.pre('save', async function (next) {
  // Skip password hashing if no password or password not modified
  if (!this.password || !this.isModified('password')) {
    return next();
  }

  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error: any) {
    next(error);
  }
});

// Compare password method
UserSchema.methods.comparePassword = async function (
  candidatePassword: string
): Promise<boolean> {
  if (!this.password) {
    return false; // Cannot compare if no password set (Firebase user)
  }
  return bcrypt.compare(candidatePassword, this.password);
};

// Remove password from JSON output
UserSchema.methods.toJSON = function () {
  const userObject = this.toObject();
  delete userObject.password;
  return userObject;
};

export default mongoose.model<IUser>('User', UserSchema);

