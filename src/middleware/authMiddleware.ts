import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { JWT_SECRET } from '../config';
import User from '../models/User';
import { AppError } from './errorHandler';
import logger from '../utils/logger';

// Extend Express Request interface to include user
declare global {
  namespace Express {
    interface Request {
      user: {
        id: string;
        phoneNumber?: string;
      };
    }
  }
}

export const protect = async (req: Request, res: Response, next: NextFunction) => {
  try {
    let token;
    
    // Get token from Authorization header
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1];
    }
    
    if (!token) {
      return next(new AppError('You are not logged in. Please log in to get access.', 401));
    }
    
    // Verify token
    const decoded: any = jwt.verify(token, JWT_SECRET);
    
    // Check if user still exists
    const user = await User.findById(decoded.id);
    
    if (!user) {
      return next(new AppError('The user belonging to this token no longer exists.', 401));
    }
    
    // Grant access to protected route
    req.user = {
      id: user._id.toString(),
      phoneNumber: user.phoneNumber
    };
    
    next();
  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError) {
      return next(new AppError('Invalid token. Please log in again.', 401));
    }
    
    if (error instanceof jwt.TokenExpiredError) {
      return next(new AppError('Your token has expired. Please log in again.', 401));
    }
    
    logger.error('Authentication error', error);
    next(new AppError('Authentication failed', 401));
  }
};

export const restrictTo = (...roles: string[]) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = await User.findById(req.user.id);
      
      if (!user) {
        return next(new AppError('User not found', 404));
      }
      
      if (!roles.includes(user.role)) {
        return next(new AppError('You do not have permission to perform this action', 403));
      }
      
      next();
    } catch (error) {
      logger.error('Authorization error', error);
      next(new AppError('Authorization failed', 403));
    }
  };
}; 