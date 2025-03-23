import { Router } from 'express';
import { sendOTP, verifyOTP } from '../controllers/authController';

const router = Router();

router.post('/send-otp', sendOTP);
router.post('/verify-otp', verifyOTP);

export default router; 