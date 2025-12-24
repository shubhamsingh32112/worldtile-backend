import mongoose, { Document, Schema } from 'mongoose';

export interface ISubscription extends Document {
  email: string;
  subscribedAt: Date;
  unsubscribedAt?: Date;
  isActive: boolean;
  source?: string; // Track where the subscription came from (e.g., 'footer', 'landing-page')
  createdAt: Date;
  updatedAt: Date;
}

const SubscriptionSchema = new Schema<ISubscription>(
  {
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, 'Please provide a valid email'],
      index: true,
    },
    subscribedAt: {
      type: Date,
      default: Date.now,
    },
    unsubscribedAt: {
      type: Date,
      default: null,
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
    source: {
      type: String,
      trim: true,
      default: 'footer',
    },
  },
  {
    timestamps: true,
  }
);

// Index for faster queries
SubscriptionSchema.index({ email: 1 });
SubscriptionSchema.index({ isActive: 1 });

export default mongoose.model<ISubscription>('Subscription', SubscriptionSchema);

