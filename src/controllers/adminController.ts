import { Request, Response, NextFunction } from 'express';
import User from '../models/User';
import BloodRequest from '../models/BloodRequest';
import { AppError } from '../middleware/errorHandler';
import logger from '../utils/logger';

// Define a custom Request type that includes the user property
type AuthRequest = Request & { user?: { id: string } };

export const getReportedUsers = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = req.user?.id;
    
    if (!userId) {
      return next(new AppError('User ID not found in request', 401));
    }
    
    // Check if user is admin
    const user = await User.findById(userId);
    if (user?.role !== 'admin') {
      return next(new AppError('You do not have permission to access this resource', 403));
    }
    
    // Get reported users
    const reportedUsers = await User.find({ reportCount: { $gt: 0 } })
      .select('name phoneNumber reportCount isBlacklisted')
      .sort({ reportCount: -1 })
      .lean();
    
    res.status(200).json({
      success: true,
      count: reportedUsers.length,
      reportedUsers
    });
  } catch (error) {
    logger.error('Error fetching reported users', error);
    next(new AppError('Failed to fetch reported users', 500));
  }
};

export const getReportedUserDetails = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { userId: reportedUserId } = req.params;
    const userId = req.user?.id;
    
    if (!userId) {
      return next(new AppError('User ID not found in request', 401));
    }
    
    // Check if user is admin
    const user = await User.findById(userId);
    if (user?.role !== 'admin') {
      return next(new AppError('You do not have permission to access this resource', 403));
    }
    
    // Get reported user details
    const reportedUser = await User.findById(reportedUserId)
      .select('name phoneNumber bloodType address reportCount isBlacklisted reportedRequests')
      .lean();
    
    if (!reportedUser) {
      return next(new AppError('User not found', 404));
    }
    
    // Get details of reported requests
    const reportedRequests = await BloodRequest.find({
      _id: { $in: reportedUser.reportedRequests || [] }
    })
    .select('bloodType hospital location date time reportReason')
    .lean();
    
    res.status(200).json({
      success: true,
      user: {
        ...reportedUser,
        reportedRequests: reportedRequests
      }
    });
  } catch (error) {
    logger.error('Error fetching reported user details', error);
    next(new AppError('Failed to fetch reported user details', 500));
  }
};

export const toggleUserBlacklist = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { userId: targetUserId } = req.params;
    const userId = req.user?.id;
    
    if (!userId) {
      return next(new AppError('User ID not found in request', 401));
    }
    
    // Check if user is admin
    const user = await User.findById(userId);
    if (user?.role !== 'admin') {
      return next(new AppError('You do not have permission to perform this action', 403));
    }
    
    // Find target user
    const targetUser = await User.findById(targetUserId);
    
    if (!targetUser) {
      return next(new AppError('User not found', 404));
    }
    
    // Toggle blacklist status
    targetUser.isBlacklisted = !targetUser.isBlacklisted;
    await targetUser.save();
    
    res.status(200).json({
      success: true,
      message: `User ${targetUser.isBlacklisted ? 'blacklisted' : 'removed from blacklist'} successfully`,
      userId: targetUser._id,
      isBlacklisted: targetUser.isBlacklisted
    });
  } catch (error) {
    logger.error('Error toggling user blacklist status', error);
    next(new AppError('Failed to update user blacklist status', 500));
  }
}; 