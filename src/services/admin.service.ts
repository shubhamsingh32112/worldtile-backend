import mongoose from 'mongoose';
import PaymentTransaction from '../models/PaymentTransaction.model';
import Order from '../models/Order.model';
import ReferralEarning from '../models/ReferralEarning.model';
import User from '../models/User.model';
import WithdrawalRequest from '../models/WithdrawalRequest.model';
import { PaymentVerificationService } from './paymentVerification.service';

export class AdminService {
  /**
   * Get overview statistics for admin dashboard
   */
  static async fetchStats() {
    try {
      // Total revenue from all PAID orders
      const totalRevenueResult = await Order.aggregate([
        { $match: { status: 'PAID' } },
        {
          $group: {
            _id: null,
            totalRevenue: {
              $sum: { $toDouble: '$payment.paidAmountUSDT' },
            },
          },
        },
      ]);

      const totalRevenue = totalRevenueResult[0]?.totalRevenue || 0;

      // Total commissions paid out
      const totalCommissionsResult = await ReferralEarning.aggregate([
        { $match: { status: 'PAID' } },
        {
          $group: {
            _id: null,
            totalCommissions: {
              $sum: { $toDouble: '$commissionAmountUSDT' },
            },
          },
        },
      ]);

      const totalCommissions = totalCommissionsResult[0]?.totalCommissions || 0;

      // Net revenue (total sales - commissions)
      const netRevenue = totalRevenue - totalCommissions;

      // Pending withdrawals
      const pendingWithdrawals = await WithdrawalRequest.countDocuments({
        status: 'PENDING',
      });

      // Pending withdrawals total amount
      const pendingWithdrawalsAmountResult = await WithdrawalRequest.aggregate([
        { $match: { status: 'PENDING' } },
        {
          $group: {
            _id: null,
            totalAmount: {
              $sum: { $toDouble: '$amountUSDT' },
            },
          },
        },
      ]);

      const pendingWithdrawalsAmount =
        pendingWithdrawalsAmountResult[0]?.totalAmount || 0;

      // Pending payments (orders with status PENDING)
      const pendingPayments = await Order.countDocuments({
        status: 'PENDING',
      });

      // Total users
      const totalUsers = await User.countDocuments();

      // Total agents
      const totalAgents = await User.countDocuments({ role: 'AGENT' });

      // Total orders
      const totalOrders = await Order.countDocuments();

      return {
        totalRevenue: totalRevenue.toFixed(6),
        totalCommissions: totalCommissions.toFixed(6),
        netRevenue: netRevenue.toFixed(6),
        pendingWithdrawals,
        pendingWithdrawalsAmount: pendingWithdrawalsAmount.toFixed(6),
        pendingPayments,
        totalUsers,
        totalAgents,
        totalOrders,
      };
    } catch (error: any) {
      console.error('Error fetching admin stats:', error);
      throw new Error('Failed to fetch admin statistics');
    }
  }

  /**
   * Get paginated list of payments with filters
   */
  static async getPayments(query: any) {
    try {
      const page = parseInt(query.page) || 1;
      const limit = parseInt(query.limit) || 20;
      const skip = (page - 1) * limit;

      // Build filter
      const filter: any = {};

      // Search by user email, name, or txHash
      if (query.search) {
        const users = await User.find({
          $or: [
            { email: { $regex: query.search, $options: 'i' } },
            { name: { $regex: query.search, $options: 'i' } },
          ],
        }).select('_id');

        const userIds = users.map((u) => u._id);

        filter.$or = [
          { userId: { $in: userIds } },
          { txHash: { $regex: query.search, $options: 'i' } },
        ];
      }

      // Get payment transactions with populated order and user
      let payments = await PaymentTransaction.find(filter)
        .populate('orderId', 'status payment userId state place')
        .populate('userId', 'name email')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean();

      // Apply status filter after fetching (since status is derived from order)
      if (query.status) {
        const statusFilter = query.status.toUpperCase();
        payments = payments.filter((payment: any) => {
          const order = payment.orderId;
          let paymentStatus = 'PENDING';
          if (order?.status === 'PAID') {
            paymentStatus = payment.confirmations >= 19 ? 'COMPLETED' : 'PENDING';
          } else if (order?.status === 'FAILED' || order?.status === 'EXPIRED') {
            paymentStatus = 'FAILED';
          }
          return paymentStatus === statusFilter;
        });
      }

      // Format response
      const formattedPayments = payments.map((payment: any) => {
        const order = payment.orderId;
        const user = payment.userId;

        // Determine payment status
        let paymentStatus = 'PENDING';
        if (order?.status === 'PAID') {
          if (payment.confirmations >= 19) {
            paymentStatus = 'COMPLETED';
          } else {
            paymentStatus = 'PENDING';
          }
        } else if (order?.status === 'FAILED') {
          paymentStatus = 'FAILED';
        } else if (order?.status === 'EXPIRED') {
          paymentStatus = 'FAILED';
        }

        return {
          id: payment._id.toString(),
          txHash: payment.txHash,
          user: {
            id: user?._id?.toString(),
            name: user?.name,
            email: user?.email,
          },
          orderId: order?._id?.toString(),
          amount: payment.amountUSDT,
          confirmations: payment.confirmations,
          status: paymentStatus,
          orderStatus: order?.status,
          fromAddress: payment.fromAddress,
          toAddress: payment.toAddress,
          blockTimestamp: payment.blockTimestamp,
          createdAt: payment.createdAt,
        };
      });

      // Count total - for status filter, we approximate by fetching all matching records
      // This is not ideal for large datasets, but status is derived from order, not stored
      let total: number;
      if (query.status) {
        // Fetch all matching payments to count (without pagination)
        const allPayments = await PaymentTransaction.find(filter)
          .populate('orderId', 'status payment')
          .lean();
        
        const statusFilter = query.status.toUpperCase();
        const filtered = allPayments.filter((payment: any) => {
          const order = payment.orderId;
          let paymentStatus = 'PENDING';
          if (order?.status === 'PAID') {
            paymentStatus = payment.confirmations >= 19 ? 'COMPLETED' : 'PENDING';
          } else if (order?.status === 'FAILED' || order?.status === 'EXPIRED') {
            paymentStatus = 'FAILED';
          }
          return paymentStatus === statusFilter;
        });
        total = filtered.length;
      } else {
        total = await PaymentTransaction.countDocuments(filter);
      }

      return {
        payments: formattedPayments,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      };
    } catch (error: any) {
      console.error('Error getting payments:', error);
      throw new Error('Failed to fetch payments');
    }
  }

  /**
   * Re-verify a payment transaction
   */
  static async verifyPayment(paymentId: string) {
    try {
      const payment = await PaymentTransaction.findById(paymentId).populate(
        'orderId'
      );

      if (!payment) {
        throw new Error('Payment transaction not found');
      }

      const order = payment.orderId as any;

      if (!order) {
        throw new Error('Order not found');
      }

      // Re-run verification
      const result = await PaymentVerificationService.verifyAndFinalizeOrder(
        order._id.toString()
      );

      // Refresh payment data
      const updatedPayment = await PaymentTransaction.findById(paymentId)
        .populate('orderId', 'status payment')
        .populate('userId', 'name email')
        .lean();

      return {
        success: result.success,
        status: result.status,
        message: result.message,
        confirmations: result.confirmations,
        payment: updatedPayment,
      };
    } catch (error: any) {
      console.error('Error verifying payment:', error);
      throw new Error(error.message || 'Failed to verify payment');
    }
  }

  /**
   * Get withdrawal requests (pending and history)
   */
  static async getWithdrawals(query: any) {
    try {
      const page = parseInt(query.page) || 1;
      const limit = parseInt(query.limit) || 20;
      const skip = (page - 1) * limit;

      const filter: any = {};

      // Status filter
      if (query.status) {
        filter.status = query.status.toUpperCase();
      }

      // Get withdrawals with populated agent
      const withdrawals = await WithdrawalRequest.find(filter)
        .populate('agentId', 'name email walletAddress role')
        .populate('approvedBy', 'name email')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean();

      const formattedWithdrawals = withdrawals.map((withdrawal: any) => ({
        id: withdrawal._id.toString(),
        agent: {
          id: withdrawal.agentId?._id?.toString(),
          name: withdrawal.agentId?.name,
          email: withdrawal.agentId?.email,
          walletAddress: withdrawal.agentId?.walletAddress,
        },
        amount: withdrawal.amountUSDT,
        walletAddress: withdrawal.walletAddress,
        status: withdrawal.status,
        adminNotes: withdrawal.adminNotes,
        approvedBy: withdrawal.approvedBy
          ? {
              id: withdrawal.approvedBy._id.toString(),
              name: withdrawal.approvedBy.name,
              email: withdrawal.approvedBy.email,
            }
          : null,
        approvedAt: withdrawal.approvedAt,
        payoutTxHash: withdrawal.payoutTxHash,
        createdAt: withdrawal.createdAt,
        updatedAt: withdrawal.updatedAt,
      }));

      const total = await WithdrawalRequest.countDocuments(filter);

      return {
        withdrawals: formattedWithdrawals,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      };
    } catch (error: any) {
      console.error('Error getting withdrawals:', error);
      throw new Error('Failed to fetch withdrawals');
    }
  }

  /**
   * Approve a withdrawal request
   */
  static async approveWithdrawal(
    withdrawalId: string,
    adminId: string,
    notes?: string
  ) {
    try {
      const withdrawal = await WithdrawalRequest.findById(withdrawalId);

      if (!withdrawal) {
        throw new Error('Withdrawal request not found');
      }

      if (withdrawal.status !== 'PENDING') {
        throw new Error(
          `Cannot approve withdrawal with status: ${withdrawal.status}`
        );
      }

      // Get agent to check available earnings
      const agent = await User.findById(withdrawal.agentId);
      if (!agent) {
        throw new Error('Agent not found');
      }

      // Get total earned but not paid
      const earnedEarnings = await ReferralEarning.aggregate([
        {
          $match: {
            referrerId: new mongoose.Types.ObjectId(withdrawal.agentId),
            status: 'EARNED',
          },
        },
        {
          $group: {
            _id: null,
            total: { $sum: { $toDouble: '$commissionAmountUSDT' } },
          },
        },
      ]);

      const availableEarnings =
        earnedEarnings[0]?.total || parseFloat(agent.referralStats?.totalEarningsUSDT || '0');

      const requestedAmount = parseFloat(withdrawal.amountUSDT);

      if (requestedAmount > availableEarnings) {
        throw new Error(
          `Insufficient earnings. Available: ${availableEarnings.toFixed(6)}, Requested: ${requestedAmount.toFixed(6)}`
        );
      }

      // Update withdrawal status
      withdrawal.status = 'APPROVED';
      withdrawal.approvedBy = new mongoose.Types.ObjectId(adminId);
      withdrawal.approvedAt = new Date();
      if (notes) {
        withdrawal.adminNotes = notes;
      }
      await withdrawal.save();

      // Mark referral earnings as PAID (up to the withdrawal amount)
      let remainingAmount = requestedAmount;
      const earningsToMark = await ReferralEarning.find({
        referrerId: withdrawal.agentId,
        status: 'EARNED',
      })
        .sort({ createdAt: 1 })
        .lean();

      for (const earning of earningsToMark) {
        if (remainingAmount <= 0) break;

        const earningAmount = parseFloat(earning.commissionAmountUSDT);
        if (earningAmount <= remainingAmount) {
          // Mark entire earning as paid
          await ReferralEarning.updateOne(
            { _id: earning._id },
            { $set: { status: 'PAID' } }
          );
          remainingAmount -= earningAmount;
        } else {
          // Partial payment - this shouldn't happen in practice, but handle it
          // For simplicity, we'll mark it as paid if it's close enough
          await ReferralEarning.updateOne(
            { _id: earning._id },
            { $set: { status: 'PAID' } }
          );
          remainingAmount = 0;
        }
      }

      // Update agent's wallet address if provided
      if (withdrawal.walletAddress && !agent.walletAddress) {
        agent.walletAddress = withdrawal.walletAddress;
        await agent.save();
      }

      return withdrawal;
    } catch (error: any) {
      console.error('Error approving withdrawal:', error);
      throw new Error(error.message || 'Failed to approve withdrawal');
    }
  }

  /**
   * Reject a withdrawal request
   */
  static async rejectWithdrawal(
    withdrawalId: string,
    adminId: string,
    notes?: string
  ) {
    try {
      const withdrawal = await WithdrawalRequest.findById(withdrawalId);

      if (!withdrawal) {
        throw new Error('Withdrawal request not found');
      }

      if (withdrawal.status !== 'PENDING') {
        throw new Error(
          `Cannot reject withdrawal with status: ${withdrawal.status}`
        );
      }

      withdrawal.status = 'REJECTED';
      withdrawal.approvedBy = new mongoose.Types.ObjectId(adminId);
      withdrawal.approvedAt = new Date();
      if (notes) {
        withdrawal.adminNotes = notes;
      }
      await withdrawal.save();

      return withdrawal;
    } catch (error: any) {
      console.error('Error rejecting withdrawal:', error);
      throw new Error(error.message || 'Failed to reject withdrawal');
    }
  }

  /**
   * Get business earnings (platform revenue stats)
   */
  static async getBusinessEarnings(query: any) {
    try {
      const period = query.period || 'all'; // 'daily', 'weekly', 'monthly', 'all'

      let dateFilter: any = {};

      if (period === 'daily') {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        dateFilter = { createdAt: { $gte: today } };
      } else if (period === 'weekly') {
        const weekAgo = new Date();
        weekAgo.setDate(weekAgo.getDate() - 7);
        dateFilter = { createdAt: { $gte: weekAgo } };
      } else if (period === 'monthly') {
        const monthAgo = new Date();
        monthAgo.setMonth(monthAgo.getMonth() - 1);
        dateFilter = { createdAt: { $gte: monthAgo } };
      }

      // Total revenue from orders
      const revenueResult = await Order.aggregate([
        {
          $match: {
            status: 'PAID',
            ...dateFilter,
          },
        },
        {
          $group: {
            _id: null,
            totalRevenue: {
              $sum: { $toDouble: '$payment.paidAmountUSDT' },
            },
            count: { $sum: 1 },
          },
        },
      ]);

      const totalRevenue = revenueResult[0]?.totalRevenue || 0;
      const orderCount = revenueResult[0]?.count || 0;

      // Total commissions paid
      const commissionsResult = await ReferralEarning.aggregate([
        {
          $match: {
            status: 'PAID',
            ...dateFilter,
          },
        },
        {
          $group: {
            _id: null,
            totalCommissions: {
              $sum: { $toDouble: '$commissionAmountUSDT' },
            },
            count: { $sum: 1 },
          },
        },
      ]);

      const totalCommissions = commissionsResult[0]?.totalCommissions || 0;
      const commissionCount = commissionsResult[0]?.count || 0;

      // Net revenue
      const netRevenue = totalRevenue - totalCommissions;

      // Get all orders for detailed breakdown
      const orders = await Order.find({
        status: 'PAID',
        ...dateFilter,
      })
        .populate('userId', 'name email')
        .sort({ createdAt: -1 })
        .lean();

      const formattedOrders = orders.map((order: any) => ({
        id: order._id.toString(),
        user: {
          id: order.userId?._id?.toString(),
          name: order.userId?.name,
          email: order.userId?.email,
        },
        amount: order.payment?.paidAmountUSDT || '0',
        state: order.state,
        place: order.place,
        quantity: order.quantity,
        txHash: order.payment?.txHash,
        paidAt: order.payment?.paidAt || order.createdAt,
        createdAt: order.createdAt,
      }));

      return {
        summary: {
          totalRevenue: totalRevenue.toFixed(6),
          totalCommissions: totalCommissions.toFixed(6),
          netRevenue: netRevenue.toFixed(6),
          orderCount,
          commissionCount,
          period,
        },
        orders: formattedOrders,
      };
    } catch (error: any) {
      console.error('Error getting business earnings:', error);
      throw new Error('Failed to fetch business earnings');
    }
  }

  /**
   * Get list of agents
   */
  static async getAgents(query: any) {
    try {
      const page = parseInt(query.page) || 1;
      const limit = parseInt(query.limit) || 20;
      const skip = (page - 1) * limit;

      const filter: any = { role: 'AGENT' };

      // Search filter
      if (query.search) {
        filter.$or = [
          { email: { $regex: query.search, $options: 'i' } },
          { name: { $regex: query.search, $options: 'i' } },
          { referralCode: { $regex: query.search, $options: 'i' } },
        ];
      }

      const agents = await User.find(filter)
        .select('name email referralCode referralStats agentProfile walletAddress createdAt')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean();

      // Get earnings for each agent
      const agentsWithEarnings = await Promise.all(
        agents.map(async (agent: any) => {
          const earnings = await ReferralEarning.aggregate([
            {
              $match: {
                referrerId: new mongoose.Types.ObjectId(agent._id),
              },
            },
            {
              $group: {
                _id: null,
                totalEarned: {
                  $sum: { $toDouble: '$commissionAmountUSDT' },
                },
                totalPaid: {
                  $sum: {
                    $cond: [
                      { $eq: ['$status', 'PAID'] },
                      { $toDouble: '$commissionAmountUSDT' },
                      0,
                    ],
                  },
                },
                pendingAmount: {
                  $sum: {
                    $cond: [
                      { $eq: ['$status', 'EARNED'] },
                      { $toDouble: '$commissionAmountUSDT' },
                      0,
                    ],
                  },
                },
                referralCount: { $sum: 1 },
              },
            },
          ]);

          const stats = earnings[0] || {
            totalEarned: 0,
            totalPaid: 0,
            pendingAmount: 0,
            referralCount: 0,
          };

          return {
            id: agent._id.toString(),
            name: agent.name,
            email: agent.email,
            referralCode: agent.referralCode,
            walletAddress: agent.walletAddress,
            totalEarned: stats.totalEarned.toFixed(6),
            totalPaid: stats.totalPaid.toFixed(6),
            pendingAmount: stats.pendingAmount.toFixed(6),
            referralCount: stats.referralCount,
            joinedAt: agent.agentProfile?.joinedAt || agent.createdAt,
            createdAt: agent.createdAt,
          };
        })
      );

      const total = await User.countDocuments(filter);

      return {
        agents: agentsWithEarnings,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      };
    } catch (error: any) {
      console.error('Error getting agents:', error);
      throw new Error('Failed to fetch agents');
    }
  }
}

