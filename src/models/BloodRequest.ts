import mongoose, { Schema, Document } from 'mongoose';

export interface IBloodRequest extends Document {
  bloodType: string;
  hospital: string;
  location: string;
  hemoglobinPoint: string;
  patientProblem: string;
  bagNeeded: string;
  zone: string;
  date: string;
  time: string;
  additionalInfo: string;
  status: 'active' | 'accepted' | 'completed' | 'cancelled';
  viewCount: number;
  requester: mongoose.Types.ObjectId;
  acceptedBy?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
  completedAt?: Date;
  cancelReason?: string;
  reportReason?: string;
  isReported: boolean;
  changeRequested: boolean;
  changeReason?: string;
}

const BloodRequestSchema: Schema = new Schema({
  bloodType: { 
    type: String, 
    required: [true, 'Blood type is required'],
    enum: ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-']
  },
  hospital: { 
    type: String, 
    required: [true, 'Hospital name is required'],
    trim: true
  },
  location: { 
    type: String, 
    required: [true, 'Location is required'],
    trim: true
  },
  hemoglobinPoint: { 
    type: String, 
    default: 'N/A'
  },
  patientProblem: { 
    type: String, 
    required: [true, 'Patient problem is required']
  },
  bagNeeded: { 
    type: String, 
    required: [true, 'Number of bags needed is required']
  },
  zone: { 
    type: String, 
    required: [true, 'Zone is required']
  },
  date: { 
    type: String, 
    required: [true, 'Date is required']
  },
  time: { 
    type: String, 
    required: [true, 'Time is required']
  },
  additionalInfo: { 
    type: String, 
    default: ''
  },
  status: { 
    type: String, 
    enum: ['active', 'accepted', 'completed', 'cancelled'],
    default: 'active'
  },
  viewCount: { 
    type: Number, 
    default: 0
  },
  requester: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User',
    required: true
  },
  acceptedBy: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User'
  },
  completedAt: {
    type: Date
  },
  cancelReason: {
    type: String
  },
  reportReason: {
    type: String
  },
  isReported: {
    type: Boolean,
    default: false
  },
  changeRequested: {
    type: Boolean,
    default: false
  },
  changeReason: {
    type: String
  }
}, {
  timestamps: true
});

export default mongoose.model<IBloodRequest>('BloodRequest', BloodRequestSchema); 