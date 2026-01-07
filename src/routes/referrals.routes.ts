import express from 'express';
import { thirdwebAuth, ThirdwebAuthRequest } from '../middleware/thirdwebAuth.middleware';
import { requireAgent } from '../middleware/role.middleware';
import User from '../models/User.model';
import ReferralEarning from '../models/ReferralEarning.model';
import WithdrawalRequest from '../models/WithdrawalRequest.model';
import State from '../models/State.model';
import Area from '../models/Area.model';
import mongoose from 'mongoose';

const router = express.Router();

/**
 * @route   GET /api/referrals/earnings
 * @desc    Get referral earnings with "real estate agent" feel
 * @access  Private
 */
router.get('/earnings', thirdwebAuth, async (req: ThirdwebAuthRequest, res: express.Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({
        success: false,
        message: 'User not found',
      });
      return;
    }
    const userId = req.user.id;

    // Get user with referral stats
    const user = await User.findById(userId);
    if (!user) {
      res.status(404).json({
        success: false,
        message: 'User not found',
      });
      return;
    }

    // Get all referral earnings for this user
    const earnings = await ReferralEarning.find({
      referrerId: new mongoose.Types.ObjectId(userId),
    })
      .sort({ createdAt: -1 })
      .populate('referredUserId', 'name email')
      .populate('orderId', 'state place')
      .lean();

    // Calculate summary
    const totalEarnings = earnings
      .filter((e) => e.status === 'EARNED' || e.status === 'PAID')
      .reduce((sum, e) => sum + parseFloat(e.commissionAmountUSDT || '0'), 0);

    const paidEarnings = earnings
      .filter((e) => e.status === 'PAID')
      .reduce((sum, e) => sum + parseFloat(e.commissionAmountUSDT || '0'), 0);

    const pendingEarnings = totalEarnings - paidEarnings;

    // Get state and area names for all unique combinations
    const stateKeys = [...new Set(earnings.map((e: any) => e.orderId?.state).filter(Boolean))];
    const areaKeys = [...new Set(earnings.map((e: any) => e.orderId?.place).filter(Boolean))];

    const states = await State.find({ stateKey: { $in: stateKeys } }).lean();
    const areas = await Area.find({ areaKey: { $in: areaKeys } }).lean();

    const stateMap = new Map(states.map((s) => [s.stateKey, s.stateName]));
    const areaMap = new Map(areas.map((a) => [a.areaKey, a.areaName]));

    // Format properties sold list
    const propertiesSold = earnings.map((earning: any) => {
      const referredUser = earning.referredUserId;
      const order = earning.orderId;

      return {
        buyerName: referredUser?.name ? `${referredUser.name.split(' ')[0]}***` : 'Anonymous Buyer',
        buyerEmail: referredUser?.email ? referredUser.email.replace(/(.{2})(.*)(@.*)/, '$1***$3') : 'anonymous@***',
        state: order?.state || '',
        stateName: stateMap.get(order?.state) || order?.state || '',
        area: order?.place || '',
        areaName: areaMap.get(order?.place) || order?.place || '',
        slots: earning.landSlotIds || [],
        purchaseAmountUSDT: earning.purchaseAmountUSDT || '0',
        commissionUSDT: earning.commissionAmountUSDT || '0',
        date: earning.createdAt ? new Date(earning.createdAt).toISOString().split('T')[0] : '',
        status: earning.status || 'EARNED',
      };
    });

    res.status(200).json({
      success: true,
      summary: {
        totalReferrals: user.referralStats?.totalReferrals || 0,
        totalEarningsUSDT: totalEarnings.toFixed(6),
        pendingEarningsUSDT: pendingEarnings.toFixed(6),
        paidEarningsUSDT: paidEarnings.toFixed(6),
        commissionRate: user.agentProfile?.commissionRate || 0.25,
        agentTitle: user.agentProfile?.title || 'Independent Land Agent',
        joinedAt: user.agentProfile?.joinedAt || user.createdAt,
      },
      propertiesSold: propertiesSold,
    });
  } catch (error: any) {
    console.error('Get referral earnings error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
});

/**
 * @route   POST /api/referrals/withdraw
 * @desc    Request withdrawal of earnings
 * @access  Private (AGENT only)
 */
router.post(
  '/withdraw',
  thirdwebAuth,
  requireAgent,
  async (req: ThirdwebAuthRequest, res: express.Response): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({
          success: false,
          message: 'User not found. Please ensure you are logged in.',
        });
        return;
      }
      const userId = req.user.id;
      const { amount, walletAddress, fullName, email, phoneNumber, saveDetails } = req.body;

      // Validate input
      if (!amount || !walletAddress) {
        res.status(400).json({
          success: false,
          message: 'Amount and wallet address are required',
        });
        return;
      }

      // Validate additional fields if provided
      if (saveDetails) {
        if (!fullName || !email) {
          res.status(400).json({
            success: false,
            message: 'Full name and email are required when saving details',
          });
          return;
        }

        // Validate email format
        const emailRegex = /^\S+@\S+\.\S+$/;
        if (!emailRegex.test(email.trim())) {
          res.status(400).json({
            success: false,
            message: 'Invalid email format',
          });
          return;
        }

        // Validate phone number if provided (10-15 digits)
        if (phoneNumber && phoneNumber.trim()) {
          const phoneRegex = /^\d{10,15}$/;
          const cleanedPhone = phoneNumber.trim().replace(/[\s\-\(\)]/g, ''); // Remove common formatting
          if (!phoneRegex.test(cleanedPhone)) {
            res.status(400).json({
              success: false,
              message: 'Invalid phone number. Must be 10-15 digits',
            });
            return;
          }
        }
      }

      const amountNum = parseFloat(amount);
      if (isNaN(amountNum) || amountNum <= 0) {
        res.status(400).json({
          success: false,
          message: 'Invalid amount',
        });
        return;
      }

      // Get user
      const user = await User.findById(userId);
      if (!user) {
        res.status(404).json({
          success: false,
          message: 'User not found',
        });
        return;
      }

      // Check if user is an agent
      if (user.role !== 'AGENT' && user.role !== 'ADMIN') {
        res.status(403).json({
          success: false,
          message: 'Only agents can request withdrawals',
        });
        return;
      }

      // Get available earnings (EARNED status)
      const earnedEarnings = await ReferralEarning.aggregate([
        {
          $match: {
            referrerId: new mongoose.Types.ObjectId(userId),
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

      const availableEarnings = earnedEarnings[0]?.total || 0;

      if (amountNum > availableEarnings) {
        res.status(400).json({
          success: false,
          message: `Insufficient earnings. Available: ${availableEarnings.toFixed(6)} USDT`,
        });
        return;
      }

      // Check for existing pending withdrawal
      const existingPending = await WithdrawalRequest.findOne({
        agentId: userId,
        status: 'PENDING',
      });

      if (existingPending) {
        res.status(400).json({
          success: false,
          message: 'You already have a pending withdrawal request',
        });
        return;
      }

      // Save user details if checkbox is checked
      if (saveDetails === true) {
        const updateData: any = {
          fullName: fullName.trim(),
          email: email.trim().toLowerCase(),
          tronWalletAddress: walletAddress.trim(),
          savedWithdrawalDetails: true,
        };
        
        // Clean and save phone number if provided
        if (phoneNumber && phoneNumber.trim()) {
          const cleanedPhone = phoneNumber.trim().replace(/[\s\-\(\)]/g, '');
          updateData.phoneNumber = cleanedPhone;
        }

        await User.findByIdAndUpdate(userId, updateData);
      }

      // Create withdrawal request
      const withdrawalRequest = new WithdrawalRequest({
        agentId: userId,
        amountUSDT: amountNum.toFixed(6),
        walletAddress: walletAddress.trim(),
        status: 'PENDING',
      });

      await withdrawalRequest.save();

      res.status(200).json({
        success: true,
        message: 'Withdrawal request submitted successfully',
        transactionId: withdrawalRequest._id.toString(),
      });
    } catch (error: any) {
      console.error('Withdrawal request error:', error);
      res.status(500).json({
        success: false,
        message: 'Server error',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined,
      });
    }
  }
);

/**
 * @route   GET /api/referrals/withdrawals/history
 * @desc    Get withdrawal history for the current agent
 * @access  Private (AGENT only)
 */
router.get(
  '/withdrawals/history',
  thirdwebAuth,
  requireAgent,
  async (req: ThirdwebAuthRequest, res: express.Response): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({
          success: false,
          message: 'User not found. Please ensure you are logged in.',
        });
        return;
      }
      const userId = req.user.id;

      const withdrawals = await WithdrawalRequest.find({ agentId: userId })
        .sort({ createdAt: -1 })
        .lean();

      const formattedWithdrawals = withdrawals.map((withdrawal: any) => ({
        id: withdrawal._id.toString(),
        amount: withdrawal.amountUSDT,
        walletAddress: withdrawal.walletAddress,
        status: withdrawal.status,
        adminNotes: withdrawal.adminNotes,
        payoutTxHash: withdrawal.payoutTxHash,
        createdAt: withdrawal.createdAt,
        updatedAt: withdrawal.updatedAt,
      }));

      res.status(200).json({
        success: true,
        data: formattedWithdrawals,
      });
    } catch (error: any) {
      console.error('Get withdrawal history error:', error);
      res.status(500).json({
        success: false,
        message: 'Server error',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined,
      });
    }
  }
);

export default router;

