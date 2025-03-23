import { Router } from 'express';
import { 
  getProfile, 
  updateProfile, 
  updateDonationInfo, 
  getUserHistory,
  getOngoingRequests
} from '../controllers/userController';
import { protect } from '../middleware/authMiddleware';

const router = Router();

// Protect all routes
router.use(protect);

router.route('/profile')
  .get(getProfile)
  .put(updateProfile);

router.put('/donation-info', updateDonationInfo);
router.get('/history', getUserHistory);
router.get('/ongoing-requests', getOngoingRequests);

export default router; 