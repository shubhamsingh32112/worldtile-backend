import { Response } from 'express';
import { AuthRequest } from '../middleware/auth.middleware';
import { AdminService } from '../services/admin.service';

export class AdminController {
  /**
   * GET /api/admin/stats/overview
   * Get dashboard overview statistics
   */
  static async getOverviewStats(req: AuthRequest, res: Response): Promise<Response> {
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
  static async getPayments(req: AuthRequest, res: Response): Promise<Response> {
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
  static async reVerifyPayment(req: AuthRequest, res: Response): Promise<Response> {
    try {
      const { id } = req.params;
      const result = await AdminService.verifyPayment(id);
      return res.status(200).json({
        success: true,
        message: 'Re-verification triggered',
        data: result,
      });
    } catch (error: any) {
      console.error('Re-verify payment error:', error);
      return res.status(500).json({
        success: false,
        message: error.message || 'Failed to verify payment',
      });
    }
  }

  /**
   * GET /api/admin/withdrawals
   * Get withdrawal requests (pending and history)
   */
  static async getWithdrawals(req: AuthRequest, res: Response): Promise<Response> {
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
  static async approveWithdrawal(req: AuthRequest, res: Response): Promise<Response> {
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
  static async rejectWithdrawal(req: AuthRequest, res: Response): Promise<Response> {
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
   * GET /api/admin/earnings/business
   * Get business earnings (platform revenue stats)
   */
  static async getBusinessEarnings(req: AuthRequest, res: Response): Promise<Response> {
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
  static async getAgents(req: AuthRequest, res: Response): Promise<Response> {
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
}

