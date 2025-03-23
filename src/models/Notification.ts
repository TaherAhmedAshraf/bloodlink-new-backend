import mongoose, { Schema, Document } from 'mongoose';

export interface INotification extends Document {
  type: 'request_accepted' | 'blood_needed' | 'donation_reminder';
  user: mongoose.Types.ObjectId;
  relatedUser?: mongoose.Types.ObjectId;
  bloodType?: string;
  message: string;
  isRead: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const NotificationSchema: Schema = new Schema({
  type: { 
    type: String, 
    required: true,
    enum: ['request_accepted', 'blood_needed', 'donation_reminder']
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
  }
}, {
  timestamps: true
});

export default mongoose.model<INotification>('Notification', NotificationSchema); 