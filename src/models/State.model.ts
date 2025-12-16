import mongoose, { Document, Schema } from 'mongoose';

export interface IState extends Document {
  stateKey: string;
  stateName: string;
  enabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const StateSchema = new Schema<IState>(
  {
    stateKey: {
      type: String,
      required: [true, 'State key is required'],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^[a-z0-9_]+$/, 'State key must be lowercase alphanumeric with underscores only'],
    },
    stateName: {
      type: String,
      required: [true, 'State name is required'],
      trim: true,
    },
    enabled: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

// Index on stateKey for fast lookups
StateSchema.index({ stateKey: 1 });
StateSchema.index({ enabled: 1 });

export default mongoose.model<IState>('State', StateSchema);

