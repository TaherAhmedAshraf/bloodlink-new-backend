import dotenv from 'dotenv';
import path from 'path';

// Load environment variables
dotenv.config();

// Environment
export const NODE_ENV = process.env.NODE_ENV || 'development';
export const PORT = parseInt(process.env.PORT || '3000', 10);
export const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/myapp';

// JWT Config
export const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';
export const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '1d';

// Admin Config
export const ADMIN_SECRET_KEY = process.env.ADMIN_SECRET_KEY || 'admin-secret-key-change-this';

// OpenAI Config
export const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';

// Firebase Config
let firebaseCredentials;
try {
  if (process.env.FIREBASE_CREDENTIALS) {
    firebaseCredentials = JSON.parse(process.env.FIREBASE_CREDENTIALS);
  } else {
    console.warn('FIREBASE_CREDENTIALS environment variable not found');
  }
} catch (error) {
  console.error('Error parsing Firebase credentials:', error);
}

export const FIREBASE_CREDENTIALS = firebaseCredentials; 