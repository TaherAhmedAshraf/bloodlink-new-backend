import { Router } from 'express';
import { 
  getNotifications, 
  markNotificationAsRead,
  markAllNotificationsAsRead,
  getNotificationSettings,
  updateNotificationSettings,
  getUnreadNotificationCount,
  registerDeviceToken,
  sendTestNotification
} from '../controllers/notificationController';
import { protect, restrictTo } from '../middleware/authMiddleware';

const router = Router();

// Protect all routes
router.use(protect);

// Device token registration
router.post('/register-token', registerDeviceToken);

// Notification routes
router.get('/', getNotifications);
router.put('/:notificationId/read', markNotificationAsRead);
router.put('/read-all', markAllNotificationsAsRead);
router.get('/unread-count', getUnreadNotificationCount);

// Notification settings
router.get('/settings', getNotificationSettings);
router.put('/settings', updateNotificationSettings);

// Admin only routes
router.post('/send-test', restrictTo('admin'), sendTestNotification);

export default router; 