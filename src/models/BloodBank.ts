import mongoose, { Schema, Document } from 'mongoose';

export interface IBloodBank extends Document {
  name: string;
  location: string;
  phone: string;
  hours: string;
  bloodNeeded: string;
  rating: number;
  coordinates: {
    latitude: number;
    longitude: number;
  };
  createdAt: Date;
  updatedAt: Date;
}

const BloodBankSchema: Schema = new Schema({
  name: { 
    type: String, 
    required: [true, 'Blood bank name is required'],
    trim: true
  },
  location: { 
    type: String, 
    required: [true, 'Location is required'],
    trim: true
  },
  phone: { 
    type: String, 
    required: [true, 'Phone number is required']
  },
  hours: { 
    type: String, 
    required: [true, 'Operating hours are required']
  },
  bloodNeeded: { 
    type: String, 
    default: ''
  },
  rating: { 
    type: Number, 
    default: 0,
    min: 0,
    max: 5
  },
  coordinates: {
    latitude: {
      type: Number,
      required: [true, 'Latitude is required']
    },
    longitude: {
      type: Number,
      required: [true, 'Longitude is required']
    }
  }
}, {
  timestamps: true
});

export default mongoose.model<IBloodBank>('BloodBank', BloodBankSchema); 