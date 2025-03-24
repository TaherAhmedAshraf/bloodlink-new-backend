import { Router } from 'express';
import { 
  getReportedUsers,
  getReportedUserDetails,
  toggleUserBlacklist
} from '../controllers/adminController';
import { protect, restrictTo } from '../middleware/authMiddleware';

const router = Router();

// Protect all routes and restrict to admin
router.use(protect);
router.use(restrictTo('admin'));

router.get('/reported-users', getReportedUsers);
router.get('/reported-users/:userId', getReportedUserDetails);
router.patch('/reported-users/:userId/toggle-blacklist', toggleUserBlacklist);

export default router; 