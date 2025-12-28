import mongoose, { Document, Schema } from 'mongoose';

export interface ISupportTicket extends Document {
  userId: mongoose.Types.ObjectId; // User who created the ticket
  withdrawalId?: mongoose.Types.ObjectId; // Optional: related withdrawal request
  message: string; // User's query/issue description
  status: 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED';
  adminResponse?: string; // Admin's response
  respondedBy?: mongoose.Types.ObjectId; // Admin who responded
  respondedAt?: Date; // When admin responded
  createdAt: Date;
  updatedAt: Date;
}

const SupportTicketSchema = new Schema<ISupportTicket>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User ID is required'],
      index: true,
    },
    withdrawalId: {
      type: Schema.Types.ObjectId,
      ref: 'WithdrawalRequest',
      index: true,
    },
    message: {
      type: String,
      required: [true, 'Message is required'],
      trim: true,
    },
    status: {
      type: String,
      enum: ['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'],
      default: 'OPEN',
      required: true,
      index: true,
    },
    adminResponse: {
      type: String,
      trim: true,
    },
    respondedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
    respondedAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes for fast lookups
SupportTicketSchema.index({ userId: 1, createdAt: -1 }); // User's tickets sorted by date
SupportTicketSchema.index({ withdrawalId: 1 }); // Tickets by withdrawal
SupportTicketSchema.index({ status: 1, createdAt: -1 }); // Open tickets for admin

export default mongoose.model<ISupportTicket>('SupportTicket', SupportTicketSchema);

