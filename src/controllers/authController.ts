import { Request, Response, NextFunction } from 'express';
import User from '../models/User';
import { AppError } from '../middleware/errorHandler';
import logger from '../utils/logger';
import jwt from 'jsonwebtoken';
import { JWT_SECRET, JWT_EXPIRES_IN } from '../config';

// In a real app, you would integrate with an SMS service
// This is a mock implementation for demonstration
const otpStore: Record<string, { otp: string, phoneNumber: string, expiresAt: Date }> = {};

// Generate a random OTP
const generateOTP = (): string => {
  // return Math.floor(1000 + Math.random() * 9000).toString();
  // using 0000 as a default OTP for testing
  return "0000";
};

// Generate a unique request ID
const generateRequestId = (): string => {
  return `otp-request-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
};

// Generate JWT token
const generateToken = (userId: string): string => {
  //@ts-ignore
  return jwt.sign(
    { id: userId }, 
    JWT_SECRET as jwt.Secret,
    {
      expiresIn: JWT_EXPIRES_IN
    }
  );
};

export const sendOTP = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { phoneNumber } = req.body;

    if (!phoneNumber) {
      return next(new AppError('Phone number is required', 400));
    }

    // Generate OTP and request ID
    const otp = generateOTP();
    const requestId = generateRequestId();
    
    // Store OTP with expiration (5 minutes)
    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + 5);
    
    otpStore[requestId] = {
      otp,
      phoneNumber,
      expiresAt
    };
    
    // In a real app, you would send the OTP via SMS
    logger.info(`OTP for ${phoneNumber}: ${otp}`);
    
    res.status(200).json({
      success: true,
      message: 'OTP sent successfully',
      requestId
    });
  } catch (error) {
    logger.error('Error sending OTP', error);
    next(new AppError('Failed to send OTP', 500));
  }
};

export const verifyOTP = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { phoneNumber, otp, requestId } = req.body;

    if (!phoneNumber || !otp || !requestId) {
      return next(new AppError('Phone number, OTP, and request ID are required', 400));
    }

    // Check if OTP exists and is valid
    const otpData = otpStore[requestId];
    
    if (!otpData) {
      return next(new AppError('Invalid request ID', 400));
    }
    
    if (otpData.phoneNumber !== phoneNumber) {
      return next(new AppError('Phone number does not match', 400));
    }
    
    if (otpData.otp !== otp) {
      return next(new AppError('Invalid OTP', 400));
    }
    
    if (new Date() > otpData.expiresAt) {
      delete otpStore[requestId];
      return next(new AppError('OTP has expired', 400));
    }
    
    // OTP is valid, find or create user
    let user = await User.findOne({ phoneNumber });
    
    if (!user) {
      // Create a new user with minimal information
      user = await User.create({
        phoneNumber,
        name: 'New User',
        bloodType: 'O+', // Default value, user should update
        address: 'Not specified' // Default value, user should update
      });
    }
    
    // Generate JWT token
    const token = generateToken(user._id);
    
    // Remove OTP from store
    delete otpStore[requestId];
    
    res.status(200).json({
      success: true,
      message: 'OTP verified successfully',
      token,
      user: {
        id: user._id,
        name: user.name,
        phoneNumber: user.phoneNumber,
        bloodType: user.bloodType,
        address: user.address
      }
    });
  } catch (error) {
    logger.error('Error verifying OTP', error);
    next(new AppError('Failed to verify OTP', 500));
  }
}; 