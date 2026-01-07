import express from 'express';
import { thirdwebAuth } from '../middleware/thirdwebAuth.middleware';
import { requireAdmin } from '../middleware/role.middleware';
import { AdminController } from '../controllers/admin.controller';

const router = express.Router();

// All admin routes require authentication and ADMIN role
router.use(thirdwebAuth, requireAdmin);

// Dashboard stats
router.get('/stats/overview', AdminController.getOverviewStats);

// Payments management
router.get('/payments', AdminController.getPayments);
router.post('/payments/:id/verify', AdminController.reVerifyPayment);

// Withdrawals management
router.get('/withdrawals', AdminController.getWithdrawals);
router.post('/withdrawals/:id/approve', AdminController.approveWithdrawal);
router.post('/withdrawals/:id/reject', AdminController.rejectWithdrawal);
router.post('/withdrawals/:id/mark-paid', AdminController.markWithdrawalAsPaid);

// Business earnings
router.get('/earnings/business', AdminController.getBusinessEarnings);

// Agents management
router.get('/users/agents', AdminController.getAgents);

// Support tickets management
router.get('/support/tickets', AdminController.getSupportTickets);
router.patch('/support/:id/resolve', AdminController.resolveSupportTicket);

// Health check
router.get('/health', AdminController.getHealth);

export default router;

