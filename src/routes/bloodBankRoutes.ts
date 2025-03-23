import { Router } from 'express';
import { getBloodBanks, getBloodBankDetails } from '../controllers/bloodBankController';
import { protect } from '../middleware/authMiddleware';

const router = Router();

// Protect all routes
router.use(protect);

router.get('/', getBloodBanks);
router.get('/:bankId', getBloodBankDetails);

export default router; 