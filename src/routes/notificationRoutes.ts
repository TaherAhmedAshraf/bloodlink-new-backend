import { Router } from 'express';
import { getNotifications, markNotificationAsRead } from '../controllers/notificationController';
import { protect } from '../middleware/authMiddleware';

const router = Router();

// Protect all routes
router.use(protect);

router.get('/', getNotifications);
router.put('/:notificationId/read', markNotificationAsRead);

export default router; 