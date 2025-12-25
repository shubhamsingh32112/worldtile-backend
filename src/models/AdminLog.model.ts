import mongoose, { Document, Schema } from 'mongoose';

export interface IAdminLog extends Document {
  adminId: mongoose.Types.ObjectId; // Admin who performed the action
  entityType: 'withdrawal' | 'payment' | 'agent' | 'order' | 'user' | 'system';
  entityId: mongoose.Types.ObjectId | string; // ID of the entity affected
  action: string; // Action performed (e.g., 'approve_withdrawal', 'verify_payment', 'reject_withdrawal')
  timestamp: Date;
  meta?: Record<string, any>; // Additional metadata (notes, amounts, etc.)
  ipAddress?: string; // IP address of admin
  userAgent?: string; // User agent string
  createdAt: Date;
}

const AdminLogSchema = new Schema<IAdminLog>(
  {
    adminId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Admin ID is required'],
      index: true,
    },
    entityType: {
      type: String,
      enum: ['withdrawal', 'payment', 'agent', 'order', 'user', 'system'],
      required: [true, 'Entity type is required'],
      index: true,
    },
    entityId: {
      type: Schema.Types.Mixed, // Can be ObjectId or string
      required: [true, 'Entity ID is required'],
      index: true,
    },
    action: {
      type: String,
      required: [true, 'Action is required'],
      index: true,
    },
    timestamp: {
      type: Date,
      default: Date.now,
      required: true,
      index: true,
    },
    meta: {
      type: Schema.Types.Mixed,
      default: {},
    },
    ipAddress: {
      type: String,
      trim: true,
    },
    userAgent: {
      type: String,
      trim: true,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes for fast lookups
AdminLogSchema.index({ adminId: 1, timestamp: -1 }); // Admin's actions by time
AdminLogSchema.index({ entityType: 1, entityId: 1 }); // Actions on specific entity
AdminLogSchema.index({ action: 1, timestamp: -1 }); // Actions by type and time
AdminLogSchema.index({ timestamp: -1 }); // Recent actions

export default mongoose.model<IAdminLog>('AdminLog', AdminLogSchema);

