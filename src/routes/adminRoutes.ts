import express from 'express';
import { 
  getReportedUsers,
  getReportedUserDetails,
  toggleUserBlacklist,
  getDashboardStats,
  sendSystemAnnouncement,
  getAllBloodRequests,
  getBloodRequestDetails,
  updateBloodRequestStatus,
  deleteBloodRequest,
  getBloodRequestStats,
  getAllUsers,
  getUserDetails,
  updateUserDetails,
  deleteUser,
  updateReportStatus
} from '../controllers/adminController';
import { protect, restrictTo } from '../middleware/authMiddleware';

const router = express.Router();

// Protect all routes and restrict to admin
router.use(protect);
router.use(restrictTo('admin'));

// Dashboard
router.get('/dashboard', getDashboardStats);

// User management routes
router.get('/users', getAllUsers);
router.get('/users/:userId', getUserDetails);
router.patch('/users/:userId', updateUserDetails);
router.delete('/users/:userId', deleteUser);

// Reported users management
router.get('/reported-users', getReportedUsers);
router.get('/reported-users/:userId', getReportedUserDetails);
router.patch('/reported-users/:userId/blacklist', toggleUserBlacklist);

// System announcements
router.post('/announcements', sendSystemAnnouncement);

// Blood request management
router.get('/blood-requests', getAllBloodRequests);
router.get('/blood-requests/stats', getBloodRequestStats);
router.get('/blood-requests/:requestId', getBloodRequestDetails);
router.patch('/blood-requests/:requestId/status', updateBloodRequestStatus);
router.delete('/blood-requests/:requestId', deleteBloodRequest);

// Report management
router.patch('/reports/:reportId/status', updateReportStatus);

export default router; 