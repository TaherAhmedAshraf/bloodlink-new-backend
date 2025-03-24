import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

// Load environment variables
dotenv.config();

// Environment
export const NODE_ENV = process.env.NODE_ENV || 'development';
export const PORT = parseInt(process.env.PORT || '3000', 10);
export const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/myapp';

// JWT Config
export const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';
export const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '1d';

// OpenAI Config
export const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';

// Firebase Config
let firebaseCredentials;
const firebaseCredentialsPath = process.env.FIREBASE_CREDENTIALS_PATH || path.join(__dirname, '../firebase-credentials.json');

try {
  if (fs.existsSync(firebaseCredentialsPath)) {
    firebaseCredentials = JSON.parse(fs.readFileSync(firebaseCredentialsPath, 'utf8'));
  } else if (process.env.FIREBASE_CREDENTIALS) {
    firebaseCredentials = JSON.parse(process.env.FIREBASE_CREDENTIALS);
  }
} catch (error) {
  console.error('Error loading Firebase credentials:', error);
}

export const FIREBASE_CREDENTIALS = firebaseCredentials; 