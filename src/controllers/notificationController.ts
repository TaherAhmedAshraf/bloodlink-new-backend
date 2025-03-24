import { Request, Response, NextFunction } from 'express';
import Notification, { NotificationType } from '../models/Notification';
import DeviceToken from '../models/DeviceToken';
import NotificationSettings from '../models/NotificationSettings';
import User from '../models/User';
import { AppError } from '../middleware/errorHandler';
import logger from '../utils/logger';
import { sendPushNotification } from '../services/firebaseService';
import mongoose from 'mongoose';

// Define a custom Request type that includes the user property
type AuthRequest = Request & { user?: { id: string } };

export const registerDeviceToken = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { token, deviceType, deviceId } = req.body;
    const userId = req.user?.id;
    
    if (!userId) {
      return next(new AppError('User ID not found in request', 401));
    }
    
    if (!token) {
      return next(new AppError('Device token is required', 400));
    }
    
    if (!deviceType || !['ios', 'android', 'web'].includes(deviceType)) {
      return next(new AppError('Valid device type (ios, android, web) is required', 400));
    }
    
    // Check if token already exists for this user
    const existingToken = await DeviceToken.findOne({
      user: userId,
      token
    });
    
    if (existingToken) {
      // Update existing token
      existingToken.deviceType = deviceType;
      if (deviceId) existingToken.deviceId = deviceId;
      existingToken.isActive = true;
      await existingToken.save();
    } else {
      // Create new token
      await DeviceToken.create({
        user: userId,
        token,
        deviceType,
        deviceId,
        isActive: true
      });
    }
    
    // Create notification settings if they don't exist
    const existingSettings = await NotificationSettings.findOne({ user: userId });
    if (!existingSettings) {
      await NotificationSettings.create({
        user: userId,
        pushNotificationsEnabled: true,
        bloodRequestsEnabled: true,
        requestUpdatesEnabled: true,
        donationRemindersEnabled: true,
        systemAnnouncementsEnabled: true
      });
    }
    
    res.status(200).json({
      success: true,
      message: 'Device token registered successfully'
    });
  } catch (error) {
    logger.error('Error registering device token', error);
    next(new AppError('Failed to register device token', 500));
  }
};

export const getNotifications = async (req: AuthRequest, res: Response, next: NextFunction) => {
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
        title: notification.title,
        message: notification.message,
        time: timeAgo,
        isRead: notification.isRead
      };
      
      if (notification.relatedUser) {
        // Use type assertion for the populated relatedUser
        const relatedUser = notification.relatedUser as unknown as { _id: string; name: string };
        result.userName = relatedUser.name;
        result.userImage = 'https://randomuser.me/api/portraits/men/32.jpg'; // Placeholder image
      }
      
      if (notification.bloodType) {
        result.bloodType = notification.bloodType;
      }
      
      if (notification.metadata) {
        result.metadata = notification.metadata;
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

export const markNotificationAsRead = async (req: AuthRequest, res: Response, next: NextFunction) => {
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

export const markAllNotificationsAsRead = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = req.user?.id;
    
    if (!userId) {
      return next(new AppError('User ID not found in request', 401));
    }
    
    await Notification.updateMany(
      { user: userId, isRead: false },
      { isRead: true }
    );
    
    res.status(200).json({
      success: true,
      message: 'All notifications marked as read'
    });
  } catch (error) {
    logger.error('Error marking all notifications as read', error);
    next(new AppError('Failed to mark all notifications as read', 500));
  }
};

export const getNotificationSettings = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = req.user?.id;
    
    if (!userId) {
      return next(new AppError('User ID not found in request', 401));
    }
    
    // Find or create settings
    let settings = await NotificationSettings.findOne({ user: userId });
    
    if (!settings) {
      settings = await NotificationSettings.create({
        user: userId,
        pushNotificationsEnabled: true,
        bloodRequestsEnabled: true,
        requestUpdatesEnabled: true,
        donationRemindersEnabled: true,
        systemAnnouncementsEnabled: true
      });
    }
    
    res.status(200).json({
      pushNotificationsEnabled: settings.pushNotificationsEnabled,
      bloodRequestsEnabled: settings.bloodRequestsEnabled,
      requestUpdatesEnabled: settings.requestUpdatesEnabled,
      donationRemindersEnabled: settings.donationRemindersEnabled,
      systemAnnouncementsEnabled: settings.systemAnnouncementsEnabled
    });
  } catch (error) {
    logger.error('Error fetching notification settings', error);
    next(new AppError('Failed to fetch notification settings', 500));
  }
};

export const updateNotificationSettings = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = req.user?.id;
    
    if (!userId) {
      return next(new AppError('User ID not found in request', 401));
    }
    
    const {
      pushNotificationsEnabled,
      bloodRequestsEnabled,
      requestUpdatesEnabled,
      donationRemindersEnabled,
      systemAnnouncementsEnabled
    } = req.body;
    
    // Find or create settings
    let settings = await NotificationSettings.findOne({ user: userId });
    
    if (!settings) {
      settings = new NotificationSettings({ user: userId });
    }
    
    // Update settings
    if (typeof pushNotificationsEnabled === 'boolean') {
      settings.pushNotificationsEnabled = pushNotificationsEnabled;
    }
    
    if (typeof bloodRequestsEnabled === 'boolean') {
      settings.bloodRequestsEnabled = bloodRequestsEnabled;
    }
    
    if (typeof requestUpdatesEnabled === 'boolean') {
      settings.requestUpdatesEnabled = requestUpdatesEnabled;
    }
    
    if (typeof donationRemindersEnabled === 'boolean') {
      settings.donationRemindersEnabled = donationRemindersEnabled;
    }
    
    if (typeof systemAnnouncementsEnabled === 'boolean') {
      settings.systemAnnouncementsEnabled = systemAnnouncementsEnabled;
    }
    
    await settings.save();
    
    res.status(200).json({
      success: true,
      message: 'Notification settings updated successfully'
    });
  } catch (error) {
    logger.error('Error updating notification settings', error);
    next(new AppError('Failed to update notification settings', 500));
  }
};

export const getUnreadNotificationCount = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = req.user?.id;
    
    if (!userId) {
      return next(new AppError('User ID not found in request', 401));
    }
    
    const count = await Notification.countDocuments({
      user: userId,
      isRead: false
    });
    
    res.status(200).json({ count });
  } catch (error) {
    logger.error('Error fetching unread notification count', error);
    next(new AppError('Failed to fetch unread notification count', 500));
  }
};

export const sendTestNotification = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { userId, type, title, message, data } = req.body;
    const adminId = req.user?.id;
    
    if (!adminId) {
      return next(new AppError('User ID not found in request', 401));
    }
    
    // Check if user is admin
    const admin = await User.findById(adminId);
    if (admin?.role !== 'admin') {
      return next(new AppError('Only admins can send test notifications', 403));
    }
    
    if (!userId || !type || !title || !message) {
      return next(new AppError('userId, type, title, and message are required', 400));
    }
    
    // Validate notification type
    const validTypes: NotificationType[] = [
      'request_accepted', 
      'blood_needed', 
      'donation_reminder', 
      'request_cancelled', 
      'donor_changed', 
      'donation_completed',
      'system_announcement'
    ];
    
    if (!validTypes.includes(type as NotificationType)) {
      return next(new AppError(`Invalid notification type. Must be one of: ${validTypes.join(', ')}`, 400));
    }
    
    // Create notification in database
    const notification = await Notification.create({
      type,
      title,
      user: userId,
      message,
      isRead: false,
      metadata: data
    });
    
    // Send push notification
    await sendPushNotification(
      userId,
      type as NotificationType,
      {
        title,
        body: message,
        data: data ? JSON.parse(JSON.stringify(data)) : undefined
      }
    );
    
    res.status(200).json({
      success: true,
      message: 'Test notification sent',
      notificationId: notification._id
    });
  } catch (error) {
    logger.error('Error sending test notification', error);
    next(new AppError('Failed to send test notification', 500));
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

// Helper function to create and send a notification
export const createNotification = async (
  userId: string,
  type: NotificationType,
  title: string,
  message: string,
  relatedUser?: string,
  bloodType?: string,
  metadata?: Record<string, any>
): Promise<boolean> => {
  try {
    // Create notification in database
    const notification = await Notification.create({
      type,
      title,
      user: userId,
      relatedUser: relatedUser ? new mongoose.Types.ObjectId(relatedUser) : undefined,
      bloodType,
      message,
      isRead: false,
      metadata
    });
    
    // Send push notification
    const pushSent = await sendPushNotification(
      userId,
      type,
      {
        title,
        body: message,
        data: metadata ? JSON.parse(JSON.stringify(metadata)) : undefined
      }
    );
    
    return !!notification && pushSent;
  } catch (error) {
    logger.error('Error creating notification', error);
    return false;
  }
}; 