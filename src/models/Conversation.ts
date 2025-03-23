import mongoose, { Schema, Document } from 'mongoose';

export interface IMessage {
  text: string;
  isUser: boolean;
  timestamp: Date;
}

export interface IConversation extends Document {
  title: string;
  user: mongoose.Types.ObjectId;
  messages: IMessage[];
  createdAt: Date;
  updatedAt: Date;
}

const MessageSchema = new Schema({
  text: {
    type: String,
    required: true
  },
  isUser: {
    type: Boolean,
    default: true
  },
  timestamp: {
    type: Date,
    default: Date.now
  }
});

const ConversationSchema: Schema = new Schema({
  title: {
    type: String,
    required: true
  },
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  messages: [MessageSchema]
}, {
  timestamps: true
});

export default mongoose.model<IConversation>('Conversation', ConversationSchema); 