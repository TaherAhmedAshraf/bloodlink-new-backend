import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Environment
export const NODE_ENV = process.env.NODE_ENV || 'development';
export const PORT = parseInt(process.env.PORT || '3000', 10);
export const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/myapp';

// JWT Config
export const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';
export const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '1d'; 