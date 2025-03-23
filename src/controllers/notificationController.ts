import { Request, Response, NextFunction } from 'express';
import Notification from '../models/Notification';
import { AppError } from '../middleware/errorHandler';
import logger from '../utils/logger';

export const getNotifications = async (req: Request & { user?: { id: string } }, res: Response, next: NextFunction) => {
  try {
    const userId = req.user?.id;
    
    if (!userId) {
      return next(new AppError('User ID not found in request', 401));
    }
    
    const { page = 1, limit = 10 } = req.query;
    
    // Calculate pagination
    const pageNum = parseInt(page as string, 10);
    const limitNum = parseInt(limit as string, 10);
    const skip = (pageNum - 1) * limitNum;
    
    // Get total count
    const total = await Notification.countDocuments({ user: userId });
    
    // Get notifications
    const notifications = await Notification.find({ user: userId })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum)
      .populate('relatedUser', 'name')
      .lean();
    
    // Format notifications for response
    const formattedNotifications = notifications.map(notification => {
      const timeAgo = getTimeAgo(notification.createdAt);
      
      let result: any = {
        id: notification._id,
        type: notification.type,
        time: timeAgo,
        isRead: notification.isRead
      };
      
      if (notification.type === 'request_accepted' && notification.relatedUser) {
        // Use type assertion for the populated relatedUser
        const relatedUser = notification.relatedUser as unknown as { name: string };
        result.userName = relatedUser.name;
        result.userImage = 'https://randomuser.me/api/portraits/men/32.jpg'; // Placeholder image
      } else if (notification.type === 'blood_needed' && notification.bloodType) {
        result.bloodType = notification.bloodType;
      }
      
      return result;
    });
    
    res.status(200).json({
      notifications: formattedNotifications,
      pagination: {
        total,
        page: pageNum,
        limit: limitNum,
        pages: Math.ceil(total / limitNum)
      }
    });
  } catch (error) {
    logger.error('Error fetching notifications', error);
    next(new AppError('Failed to fetch notifications', 500));
  }
};

export const markNotificationAsRead = async (req: Request & { user?: { id: string } }, res: Response, next: NextFunction) => {
  try {
    const { notificationId } = req.params;
    const userId = req.user?.id;
    
    if (!userId) {
      return next(new AppError('User ID not found in request', 401));
    }
    
    const notification = await Notification.findOneAndUpdate(
      { _id: notificationId, user: userId },
      { isRead: true },
      { new: true }
    );
    
    if (!notification) {
      return next(new AppError('Notification not found', 404));
    }
    
    res.status(200).json({
      success: true,
      message: 'Notification marked as read',
      notificationId
    });
  } catch (error) {
    logger.error('Error marking notification as read', error);
    next(new AppError('Failed to mark notification as read', 500));
  }
};

// Helper function to format time ago
const getTimeAgo = (date: Date): string => {
  const now = new Date();
  const diffMs = now.getTime() - new Date(date).getTime();
  const diffSec = Math.round(diffMs / 1000);
  const diffMin = Math.round(diffSec / 60);
  const diffHour = Math.round(diffMin / 60);
  const diffDay = Math.round(diffHour / 24);
  
  if (diffSec < 60) {
    return `${diffSec}s`;
  } else if (diffMin < 60) {
    return `${diffMin}m`;
  } else if (diffHour < 24) {
    return `${diffHour}h`;
  } else if (diffDay < 7) {
    return `${diffDay}d`;
  } else {
    return new Date(date).toLocaleDateString();
  }
}; 