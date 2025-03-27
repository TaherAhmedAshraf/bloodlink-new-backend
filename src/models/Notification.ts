import mongoose, { Schema, Document } from 'mongoose';

export type NotificationType = 
  | 'request_created'
  | 'request_accepted'
  | 'request_completed'
  | 'request_cancelled'
  | 'admin_update'
  | 'system_announcement'
  | 'blood_needed'
  | 'donation_reminder'
  | 'donor_changed'
  | 'donation_completed';

export interface INotification extends Document {
  type: NotificationType;
  title: string;
  user: mongoose.Types.ObjectId;
  bloodRequest?: mongoose.Types.ObjectId;
  relatedUser?: mongoose.Types.ObjectId;
  bloodType?: string;
  message: string;
  isRead: boolean;
  metadata?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

const NotificationSchema: Schema = new Schema({
  type: {
    type: String,
    required: true,
    enum: [
      'request_created',
      'request_accepted',
      'request_completed',
      'request_cancelled',
      'admin_update',
      'system_announcement',
      'blood_needed',
      'donation_reminder',
      'donor_changed',
      'donation_completed'
    ]
  },
  title: {
    type: String,
    required: true
  },
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  bloodRequest: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'BloodRequest'
  },
  relatedUser: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  bloodType: {
    type: String,
    enum: ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-']
  },
  message: {
    type: String,
    required: true
  },
  isRead: {
    type: Boolean,
    default: false
  },
  metadata: {
    type: Schema.Types.Mixed
  }
}, {
  timestamps: true
});

// Add index for faster queries
NotificationSchema.index({ user: 1, isRead: 1 });
NotificationSchema.index({ createdAt: -1 });

export default mongoose.model<INotification>('Notification', NotificationSchema); 