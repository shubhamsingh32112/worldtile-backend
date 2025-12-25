import express from 'express';
import { authenticate } from '../middleware/auth.middleware';
import { requireAdmin } from '../middleware/role.middleware';
import { AdminController } from '../controllers/admin.controller';

const router = express.Router();

// All admin routes require authentication and ADMIN role
router.use(authenticate, requireAdmin);

// Dashboard stats
router.get('/stats/overview', AdminController.getOverviewStats);

// Payments management
router.get('/payments', AdminController.getPayments);
router.post('/payments/:id/verify', AdminController.reVerifyPayment);

// Withdrawals management
router.get('/withdrawals', AdminController.getWithdrawals);
router.post('/withdrawals/:id/approve', AdminController.approveWithdrawal);
router.post('/withdrawals/:id/reject', AdminController.rejectWithdrawal);

// Business earnings
router.get('/earnings/business', AdminController.getBusinessEarnings);

// Agents management
router.get('/users/agents', AdminController.getAgents);

export default router;

