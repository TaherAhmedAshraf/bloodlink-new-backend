import mongoose, { Schema, Document } from 'mongoose';

export interface IBloodRequest extends Document {
  requester: mongoose.Types.ObjectId;
  donor?: mongoose.Types.ObjectId;
  acceptedBy?: mongoose.Types.ObjectId;
  bloodType: string;
  units: number;
  hospital: string;
  location: string;
  patientName: string;
  patientAge?: number;
  patientGender?: string;
  notes?: string;
  hemoglobinPoint: string;
  patientProblem: string;
  bagNeeded: string;
  zone: string;
  additionalInfo: string;
  status: 'active' | 'accepted' | 'completed' | 'cancelled';
  isUrgent: boolean;
  date: string;
  time: string;
  viewCount: number;
  completedAt?: Date;
  cancelReason?: string;
  reportReason?: string;
  isReported: boolean;
  changeRequested: boolean;
  changeReason?: string;
  adminNotes?: Array<{
    note: string;
    timestamp: Date;
    adminId: mongoose.Types.ObjectId;
  }>;
  createdAt: Date;
  updatedAt: Date;
}

const BloodRequestSchema: Schema = new Schema({
  requester: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  donor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  acceptedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  bloodType: {
    type: String,
    required: true,
    enum: ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-']
  },
  units: {
    type: Number,
    required: true,
    min: 1
  },
  hospital: {
    type: String,
    required: true,
    trim: true
  },
  location: {
    type: String,
    required: true,
    trim: true
  },
  patientName: {
    type: String,
    required: true,
    trim: true
  },
  patientAge: {
    type: Number,
    min: 0,
    max: 150
  },
  patientGender: {
    type: String,
    enum: ['Male', 'Female', 'Other']
  },
  notes: {
    type: String,
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
  additionalInfo: {
    type: String,
    default: ''
  },
  status: {
    type: String,
    required: true,
    enum: ['active', 'accepted', 'completed', 'cancelled'],
    default: 'active'
  },
  isUrgent: {
    type: Boolean,
    default: false
  },
  date: {
    type: String,
    required: true
  },
  time: {
    type: String,
    required: true
  },
  viewCount: {
    type: Number,
    default: 0
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
  },
  adminNotes: [{
    note: {
      type: String,
      required: true
    },
    timestamp: {
      type: Date,
      default: Date.now
    },
    adminId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    }
  }]
}, {
  timestamps: true
});

export default mongoose.model<IBloodRequest>('BloodRequest', BloodRequestSchema); 