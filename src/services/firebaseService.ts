import admin from 'firebase-admin';
import { FIREBASE_CREDENTIALS } from '../config';
import logger from '../utils/logger';
import DeviceToken from '../models/DeviceToken';
import NotificationSettings from '../models/NotificationSettings';
import { NotificationType } from '../models/Notification';

// Initialize Firebase Admin SDK
try {
  // Check if app is already initialized to prevent multiple initializations
  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert(FIREBASE_CREDENTIALS as admin.ServiceAccount)
    });
    logger.info('Firebase Admin SDK initialized successfully');
  }
} catch (error) {
  logger.error('Error initializing Firebase Admin SDK', error);
}

// Mock interface for notification payload
interface NotificationPayload {
  title: string;
  body: string;
  data?: Record<string, string>;
  imageUrl?: string;
}

// Mock implementation that just logs the notification
export const sendPushNotification = async (
  userId: string,
  notificationType: NotificationType,
  payload: NotificationPayload
): Promise<boolean> => {
  try {
    // Check user notification settings
    const settings = await NotificationSettings.findOne({ user: userId });
    
    // If settings exist and push notifications are disabled, don't send
    if (settings && !settings.pushNotificationsEnabled) {
      return false;
    }
    
    // Check specific notification type settings
    if (settings) {
      if (notificationType === 'blood_needed' && !settings.bloodRequestsEnabled) return false;
      if (['request_accepted', 'donor_changed', 'request_cancelled', 'donation_completed'].includes(notificationType) && 
          !settings.requestUpdatesEnabled) return false;
      if (notificationType === 'donation_reminder' && !settings.donationRemindersEnabled) return false;
      if (notificationType === 'system_announcement' && !settings.systemAnnouncementsEnabled) return false;
    }
    
    // Get user's device tokens
    const deviceTokens = await DeviceToken.find({ 
      user: userId,
      isActive: true
    });
    
    if (deviceTokens.length === 0) {
      logger.info(`No active device tokens found for user ${userId}`);
      return false;
    }
    
    // Extract tokens
    const tokens = deviceTokens.map(device => device.token);
    
    // Prepare notification message
    const message: admin.messaging.MulticastMessage = {
      tokens,
      notification: {
        title: payload.title,
        body: payload.body,
        imageUrl: payload.imageUrl
      },
      data: payload.data || {},
      android: {
        priority: 'high',
        notification: {
          sound: 'default'
        }
      },
      apns: {
        payload: {
          aps: {
            sound: 'default',
            badge: 1
          }
        }
      }
    };
    
    // Send the notification
    const response = await admin.messaging().sendMulticast(message);
    
    logger.info(`Push notification sent to ${response.successCount} devices for user ${userId}`);
    
    // Handle failed tokens
    if (response.failureCount > 0) {
      const failedTokens: string[] = [];
      response.responses.forEach((resp: admin.messaging.SendResponse, idx: number) => {
        if (!resp.success) {
          failedTokens.push(tokens[idx]);
          logger.warn(`Failed to send notification to token: ${tokens[idx]}, error: ${resp.error?.message}`);
        }
      });
      
      // Deactivate failed tokens
      if (failedTokens.length > 0) {
        await DeviceToken.updateMany(
          { token: { $in: failedTokens } },
          { isActive: false }
        );
        logger.info(`Deactivated ${failedTokens.length} invalid tokens`);
      }
    }
    
    return response.successCount > 0;
  } catch (error) {
    logger.error('Error sending push notification', error);
    return false;
  }
};

export default {
  sendPushNotification
}; 