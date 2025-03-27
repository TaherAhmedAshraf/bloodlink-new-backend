import { Request, Response, NextFunction } from 'express';
import User from '../models/User';
import { AppError } from '../middleware/errorHandler';
import logger from '../utils/logger';
import jwt from 'jsonwebtoken';
import { JWT_SECRET, JWT_EXPIRES_IN, ADMIN_SECRET_KEY } from '../config';
import bcrypt from 'bcrypt';

// Generate JWT token
const generateToken = (userId: string): string => {
  return jwt.sign(
    { id: userId.toString() },
    JWT_SECRET,
    // { expiresIn: JWT_EXPIRES_IN as string }
  );
};

export const adminLogin = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { phoneNumber, password } = req.body;

    if (!phoneNumber || !password) {
      return next(new AppError('Phone number and password are required', 400));
    }

    // Find admin user with password included
    const admin = await User.findOne({ 
      phoneNumber, 
      role: 'admin' 
    }).select('+password');

    if (!admin) {
      return next(new AppError('Invalid credentials', 401));
    }

    // Check if password is correct
    const isPasswordCorrect = await bcrypt.compare(password, admin.password || '');
    
    if (!isPasswordCorrect) {
      return next(new AppError('Invalid credentials', 401));
    }

    // Generate token
    const token = generateToken(admin._id);

    res.status(200).json({
      success: true,
      message: 'Admin login successful',
      token,
      admin: {
        id: admin._id,
        name: admin.name,
        phoneNumber: admin.phoneNumber,
        role: admin.role
      }
    });
  } catch (error) {
    logger.error('Error in admin login', error);
    next(new AppError('Failed to login', 500));
  }
};

export const createInitialAdmin = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { name, phoneNumber, password, secretKey } = req.body;

    // Validate required fields
    if (!name || !phoneNumber || !password || !secretKey) {
      return next(new AppError('All fields are required', 400));
    }

    // Verify secret key
    if (secretKey !== ADMIN_SECRET_KEY) {
      return next(new AppError('Invalid secret key', 403));
    }

    // Check if admin already exists
    const adminExists = await User.findOne({ role: 'admin' });
    
    if (adminExists) {
      return next(new AppError('Initial admin already exists', 400));
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create admin user
    const admin = await User.create({
      name,
      phoneNumber,
      password: hashedPassword,
      role: 'admin',
      bloodType: 'O+', // Default value
      address: 'Admin Office', // Default value
    });

    // Generate token
    const token = generateToken(admin._id);

    res.status(201).json({
      success: true,
      message: 'Initial admin created successfully',
      token,
      admin: {
        id: admin._id,
        name: admin.name,
        phoneNumber: admin.phoneNumber,
        role: admin.role
      }
    });
  } catch (error) {
    logger.error('Error creating initial admin', error);
    next(new AppError('Failed to create initial admin', 500));
  }
}; 