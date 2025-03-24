import mongoose, { Schema, Document } from 'mongoose';

export type NotificationType = 
  'request_accepted' | 
  'blood_needed' | 
  'donation_reminder' | 
  'request_cancelled' | 
  'donor_changed' | 
  'donation_completed' |
  'system_announcement';

export interface INotification extends Document {
  type: NotificationType;
  title: string;
  user: mongoose.Types.ObjectId;
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
      'request_accepted', 
      'blood_needed', 
      'donation_reminder', 
      'request_cancelled', 
      'donor_changed', 
      'donation_completed',
      'system_announcement'
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
    type: Map,
    of: Schema.Types.Mixed
  }
}, {
  timestamps: true
});

export default mongoose.model<INotification>('Notification', NotificationSchema); 