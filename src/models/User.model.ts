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
  walletAddress?: string;
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
    walletAddress: {
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

// Generate referral code before saving (if new user and no code exists)
UserSchema.pre('save', async function (next) {
  // Generate referral code if it doesn't exist
  if (this.isNew && !this.referralCode) {
    let code: string = '';
    let isUnique = false;
    const UserModel = this.constructor as typeof mongoose.Model;
    
    // Generate a short, unique code (6-8 characters, uppercase alphanumeric)
    while (!isUnique) {
      // Generate random code: 6-8 chars, uppercase alphanumeric
      const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Exclude ambiguous chars
      code = '';
      for (let i = 0; i < 8; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
      }
      
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

