import mongoose, { Schema, Document } from 'mongoose';

export interface INotificationSettings extends Document {
  user: mongoose.Types.ObjectId;
  pushNotificationsEnabled: boolean;
  bloodRequestsEnabled: boolean;
  requestUpdatesEnabled: boolean;
  donationRemindersEnabled: boolean;
  systemAnnouncementsEnabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const NotificationSettingsSchema: Schema = new Schema({
  user: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User',
    required: true,
    unique: true
  },
  pushNotificationsEnabled: { 
    type: Boolean, 
    default: true
  },
  bloodRequestsEnabled: { 
    type: Boolean, 
    default: true
  },
  requestUpdatesEnabled: { 
    type: Boolean, 
    default: true
  },
  donationRemindersEnabled: { 
    type: Boolean, 
    default: true
  },
  systemAnnouncementsEnabled: { 
    type: Boolean, 
    default: true
  }
}, {
  timestamps: true
});

export default mongoose.model<INotificationSettings>('NotificationSettings', NotificationSettingsSchema); 