import { Router } from 'express';
import { 
  createBloodRequest, 
  getBloodRequests, 
  getBloodRequestDetails, 
  acceptBloodRequest,
  completeBloodRequest
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

export default router; 