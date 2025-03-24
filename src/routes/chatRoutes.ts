import { Router } from 'express';
import { getChatHistory, sendChatMessage, getConversation } from '../controllers/chatController';
import { protect } from '../middleware/authMiddleware';

const router = Router();

// Protect all routes
router.use(protect);

router.get('/history', getChatHistory);
router.get('/conversation/:conversationId', getConversation);
router.post('/message', sendChatMessage);

export default router; 