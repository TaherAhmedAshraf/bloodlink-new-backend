import { Router } from 'express';
import authRoutes from './authRoutes';
import userRoutes from './userRoutes';
import bloodRequestRoutes from './bloodRequestRoutes';
import bloodBankRoutes from './bloodBankRoutes';
import notificationRoutes from './notificationRoutes';
import chatRoutes from './chatRoutes';
import adminRoutes from './adminRoutes';
import adminAuthRoutes from './adminAuthRoutes';
import healthRoutes from './healthRoutes';

const router = Router();

// Health check endpoint
router.use('/health', healthRoutes);

// Auth routes
router.use('/auth', authRoutes);

// User routes
router.use('/user', userRoutes);

// Blood request routes
router.use('/blood-requests', bloodRequestRoutes);

// Blood bank routes
router.use('/blood-banks', bloodBankRoutes);

// Notification routes
router.use('/notifications', notificationRoutes);

// Chat routes
router.use('/chat', chatRoutes);

// Admin routes
router.use('/admin', adminRoutes);

// Admin auth routes
router.use('/admin-auth', adminAuthRoutes);

export default router; 