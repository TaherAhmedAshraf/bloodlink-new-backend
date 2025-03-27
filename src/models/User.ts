import mongoose, { Schema, Document } from 'mongoose';
import bcrypt from 'bcrypt';

export interface IUser extends Document {
  name: string;
  phoneNumber: string;
  password?: string;
  bloodType: string;
  address: string;
  lastDonation?: Date;
  hemoglobin?: number;
  gender?: string;
  age?: number;
  role: string;
  createdAt: Date;
  updatedAt: Date;
  reportCount: number;
  reportedRequests: mongoose.Types.ObjectId[];
  isBlacklisted: boolean;
  comparePassword(candidatePassword: string): Promise<boolean>;
}

const UserSchema: Schema = new Schema({
  name: { 
    type: String, 
    trim: true
  },
  phoneNumber: { 
    type: String, 
    required: [true, 'Phone number is required'],
    unique: true,
    trim: true
  },
  password: {
    type: String,
    select: false // Don't include password in query results by default
  },
  bloodType: { 
    type: String, 
    enum: ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'],
  },
  address: { 
    type: String, 
    trim: true
  },
  lastDonation: { 
    type: Date
  },
  hemoglobin: { 
    type: Number,
    min: 0,
    max: 20
  },
  gender: { 
    type: String,
    enum: ['Male', 'Female', 'Other']
  },
  age: { 
    type: Number,
    min: 18,
    max: 65
  },
  role: {
    type: String,
    enum: ['user', 'admin'],
    default: 'user'
  },
  reportCount: {
    type: Number,
    default: 0
  },
  reportedRequests: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'BloodRequest'
  }],
  isBlacklisted: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Method to compare password
UserSchema.methods.comparePassword = async function(candidatePassword: string): Promise<boolean> {
  if (!this.password) return false;
  return bcrypt.compare(candidatePassword, this.password);
};

export default mongoose.model<IUser>('User', UserSchema); 