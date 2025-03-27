import { Router } from 'express';
import { adminLogin, createInitialAdmin } from '../controllers/adminAuthController';

const router = Router();

// Admin login
router.post('/login', adminLogin);

// Create initial admin (only works if no admin exists)
router.post('/setup', createInitialAdmin);

export default router; 