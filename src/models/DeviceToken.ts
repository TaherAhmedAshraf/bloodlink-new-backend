import mongoose, { Schema, Document } from 'mongoose';

export interface IDeviceToken extends Document {
  user: mongoose.Types.ObjectId;
  token: string;
  deviceType: 'ios' | 'android' | 'web';
  deviceId?: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const DeviceTokenSchema: Schema = new Schema({
  user: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User',
    required: true
  },
  token: { 
    type: String, 
    required: true,
    trim: true
  },
  deviceType: { 
    type: String, 
    enum: ['ios', 'android', 'web'],
    required: true
  },
  deviceId: { 
    type: String,
    trim: true
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

// Create a compound index to ensure uniqueness of token per user
DeviceTokenSchema.index({ user: 1, token: 1 }, { unique: true });

export default mongoose.model<IDeviceToken>('DeviceToken', DeviceTokenSchema); 