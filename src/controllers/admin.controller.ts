import { Response } from 'express';
import { ThirdwebAuthRequest } from '../middleware/thirdwebAuth.middleware';
import { AdminService } from '../services/admin.service';

export class AdminController {
  /**
   * GET /api/admin/stats/overview
   * Get dashboard overview statistics
   */
  static async getOverviewStats(_req: ThirdwebAuthRequest, res: Response): Promise<Response> {
    try {
      const stats = await AdminService.fetchStats();
      return res.status(200).json({
        success: true,
        data: stats,
      });
    } catch (error: any) {
      console.error('Get overview stats error:', error);
      return res.status(500).json({
        success: false,
        message: error.message || 'Failed to fetch overview statistics',
      });
    }
  }

  /**
   * GET /api/admin/payments
   * Get paginated list of payments with filters
   */
  static async getPayments(req: ThirdwebAuthRequest, res: Response): Promise<Response> {
    try {
      const data = await AdminService.getPayments(req.query);
      return res.status(200).json({
        success: true,
        data,
      });
    } catch (error: any) {
      console.error('Get payments error:', error);
      return res.status(500).json({
        success: false,
        message: error.message || 'Failed to fetch payments',
      });
    }
  }

  /**
   * POST /api/admin/payments/:id/verify
   * Re-verify a payment transaction
   */
  static async reVerifyPayment(req: ThirdwebAuthRequest, res: Response): Promise<Response> {
    try {
      const { id } = req.params;
      const adminId = req.user!.id;
      const ipAddress = req.ip || req.socket.remoteAddress || undefined;
      const userAgent = req.headers['user-agent'] || undefined;
      
      const result = await AdminService.verifyPayment(id, adminId, ipAddress, userAgent);
      return res.status(200).json({
        success: true,
        message: 'Re-verification triggered',
        data: result,
      });
    } catch (error: any) {
      console.error('Re-verify payment error:', error);
      const statusCode = error.message?.includes('FRAUD') ? 400 : 500;
      return res.status(statusCode).json({
        success: false,
        message: error.message || 'Failed to verify payment',
      });
    }
  }

  /**
   * GET /api/admin/withdrawals
   * Get withdrawal requests (pending and history)
   */
  static async getWithdrawals(req: ThirdwebAuthRequest, res: Response): Promise<Response> {
    try {
      const data = await AdminService.getWithdrawals(req.query);
      return res.status(200).json({
        success: true,
        data,
      });
    } catch (error: any) {
      console.error('Get withdrawals error:', error);
      return res.status(500).json({
        success: false,
        message: error.message || 'Failed to fetch withdrawals',
      });
    }
  }

  /**
   * POST /api/admin/withdrawals/:id/approve
   * Approve a withdrawal request
   */
  static async approveWithdrawal(req: ThirdwebAuthRequest, res: Response): Promise<Response> {
    try {
      const { id } = req.params;
      const { notes } = req.body;
      const adminId = req.user!.id;

      await AdminService.approveWithdrawal(id, adminId, notes);
      return res.status(200).json({
        success: true,
        message: 'Withdrawal approved successfully',
      });
    } catch (error: any) {
      console.error('Approve withdrawal error:', error);
      return res.status(400).json({
        success: false,
        message: error.message || 'Failed to approve withdrawal',
      });
    }
  }

  /**
   * POST /api/admin/withdrawals/:id/reject
   * Reject a withdrawal request
   */
  static async rejectWithdrawal(req: ThirdwebAuthRequest, res: Response): Promise<Response> {
    try {
      const { id } = req.params;
      const { notes } = req.body;
      const adminId = req.user!.id;

      await AdminService.rejectWithdrawal(id, adminId, notes);
      return res.status(200).json({
        success: true,
        message: 'Withdrawal rejected',
      });
    } catch (error: any) {
      console.error('Reject withdrawal error:', error);
      return res.status(400).json({
        success: false,
        message: error.message || 'Failed to reject withdrawal',
      });
    }
  }

  /**
   * POST /api/admin/withdrawals/:id/mark-paid
   * Mark withdrawal as paid (COMPLETED) with transaction hash
   */
  static async markWithdrawalAsPaid(req: ThirdwebAuthRequest, res: Response): Promise<Response> {
    try {
      const { id } = req.params;
      const { payoutTxHash, notes } = req.body;
      const adminId = req.user!.id;
      const ipAddress = req.ip || req.socket.remoteAddress || undefined;
      const userAgent = req.headers['user-agent'] || undefined;

      if (!payoutTxHash) {
        return res.status(400).json({
          success: false,
          message: 'Payout transaction hash is required',
        });
      }

      await AdminService.markWithdrawalAsPaid(
        id,
        adminId,
        payoutTxHash,
        notes,
        ipAddress,
        userAgent
      );
      return res.status(200).json({
        success: true,
        message: 'Withdrawal marked as paid',
      });
    } catch (error: any) {
      console.error('Mark withdrawal as paid error:', error);
      const statusCode = error.message?.includes('FRAUD') ? 400 : 400;
      return res.status(statusCode).json({
        success: false,
        message: error.message || 'Failed to mark withdrawal as paid',
      });
    }
  }

  /**
   * GET /api/admin/earnings/business
   * Get business earnings (platform revenue stats)
   */
  static async getBusinessEarnings(req: ThirdwebAuthRequest, res: Response): Promise<Response> {
    try {
      const data = await AdminService.getBusinessEarnings(req.query);
      return res.status(200).json({
        success: true,
        data,
      });
    } catch (error: any) {
      console.error('Get business earnings error:', error);
      return res.status(500).json({
        success: false,
        message: error.message || 'Failed to fetch business earnings',
      });
    }
  }

  /**
   * GET /api/admin/users/agents
   * Get list of agents
   */
  static async getAgents(req: ThirdwebAuthRequest, res: Response): Promise<Response> {
    try {
      const data = await AdminService.getAgents(req.query);
      return res.status(200).json({
        success: true,
        data,
      });
    } catch (error: any) {
      console.error('Get agents error:', error);
      return res.status(500).json({
        success: false,
        message: error.message || 'Failed to fetch agents',
      });
    }
  }

  /**
   * GET /api/admin/health
   * Admin health check endpoint
   */
  static async getHealth(_req: ThirdwebAuthRequest, res: Response): Promise<Response> {
    try {
      const health = await AdminService.getHealth();
      return res.status(200).json({
        success: true,
        data: health,
      });
    } catch (error: any) {
      console.error('Health check error:', error);
      return res.status(500).json({
        success: false,
        message: error.message || 'Health check failed',
      });
    }
  }

  /**
   * GET /api/admin/support/tickets
   * Get support tickets (paginated)
   */
  static async getSupportTickets(req: ThirdwebAuthRequest, res: Response): Promise<Response> {
    try {
      const data = await AdminService.getSupportTickets(req.query);
      return res.status(200).json({
        success: true,
        data,
      });
    } catch (error: any) {
      console.error('Get support tickets error:', error);
      return res.status(500).json({
        success: false,
        message: error.message || 'Failed to fetch support tickets',
      });
    }
  }

  /**
   * PATCH /api/admin/support/:id/resolve
   * Resolve a support ticket
   */
  static async resolveSupportTicket(req: ThirdwebAuthRequest, res: Response): Promise<Response> {
    try {
      const { id } = req.params;
      const { response } = req.body;
      const adminId = req.user!.id;

      await AdminService.resolveSupportTicket(id, adminId, response);
      return res.status(200).json({
        success: true,
        message: 'Support ticket resolved',
      });
    } catch (error: any) {
      console.error('Resolve support ticket error:', error);
      return res.status(400).json({
        success: false,
        message: error.message || 'Failed to resolve support ticket',
      });
    }
  }
}

