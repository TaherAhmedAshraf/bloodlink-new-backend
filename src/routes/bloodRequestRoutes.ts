import { Router } from 'express';
import { 
  createBloodRequest, 
  getBloodRequests, 
  getBloodRequestDetails, 
  acceptBloodRequest,
  completeBloodRequest,
  cancelBloodRequest,
  reportDonor,
  requestChangeDonor
} from '../controllers/bloodRequestController';
import { protect } from '../middleware/authMiddleware';

const router = Router();

// Protect all routes
router.use(protect);

router.route('/')
  .post(createBloodRequest)
  .get(getBloodRequests);

router.get('/:requestId', getBloodRequestDetails);
router.post('/:requestId/accept', acceptBloodRequest);
router.post('/:requestId/complete', completeBloodRequest);
router.post('/:requestId/cancel', cancelBloodRequest);
router.post('/:requestId/report-donor', reportDonor);
router.post('/:requestId/change-donor', requestChangeDonor);

export default router; 