import express from 'express';
import { body, validationResult } from 'express-validator';
import { authenticate, AuthRequest } from '../middleware/auth.middleware';
import User from '../models/User.model';
import UserLand from '../models/UserLand.model';
import ReferralEarning from '../models/ReferralEarning.model';
import State from '../models/State.model';
import Area from '../models/Area.model';
import mongoose from 'mongoose';

const router = express.Router();

/**
 * @route   GET /api/user/stats
 * @desc    Get user statistics (lands owned count, referral earnings)
 * @access  Private
 */
router.get('/stats', authenticate, async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.id;

    // Count user lands
    const landsOwned = await UserLand.countDocuments({
      userId: new mongoose.Types.ObjectId(userId),
    });

    // Get user's referral earnings
    const user = await User.findById(userId);
    const referralEarningsUSDT = user?.referralStats?.totalEarningsUSDT || '0';

    res.status(200).json({
      success: true,
      stats: {
        landsOwned,
        referralEarningsUSDT,
      },
    });
  } catch (error: any) {
    console.error('Get user stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
});

/**
 * @route   GET /api/user/lands
 * @desc    Get all lands owned by the authenticated user
 * @access  Private
 */
router.get('/lands', authenticate, async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.id;
    console.log(`[GET /api/user/lands] Fetching lands for user: ${userId}`);

    // Get user lands
    const userLands = await UserLand.find({
      userId: new mongoose.Types.ObjectId(userId),
    })
      .sort({ acquiredAt: -1 })
      .lean();
    
    console.log(`[GET /api/user/lands] Found ${userLands.length} user lands`);

    // Get unique state and area keys (only if we have lands)
    let stateKeys: string[] = [];
    let areaKeys: string[] = [];
    
    if (userLands.length > 0) {
      stateKeys = [...new Set(userLands.map((land) => land.state || land.stateKey).filter(Boolean))];
      areaKeys = [...new Set(userLands.map((land) => land.place || land.areaKey).filter(Boolean))];
      
      console.log(`[GET /api/user/lands] Fetching ${stateKeys.length} states and ${areaKeys.length} areas`);
      
      // Fetch state and area names (only if we have keys)
      const [states, areas] = await Promise.all([
        stateKeys.length > 0 ? State.find({ stateKey: { $in: stateKeys } }).lean() : Promise.resolve([]),
        areaKeys.length > 0 ? Area.find({ areaKey: { $in: areaKeys } }).lean() : Promise.resolve([]),
      ]);

      // Create lookup maps
      const stateMap = new Map(states.map((s) => [s.stateKey, s.stateName]));
      const areaMap = new Map(areas.map((a) => [a.areaKey, a.areaName]));

      // Format lands with state and area names
      const lands = userLands.map((land) => {
        const stateKey = land.state || land.stateKey || '';
        const areaKey = land.place || land.areaKey || '';

        return {
          _id: land._id.toString(),
          userId: land.userId.toString(),
          landSlotId: land.landSlotId,
          state: stateKey,
          stateName: stateMap.get(stateKey) || stateKey,
          place: areaKey,
          areaName: areaMap.get(areaKey) || areaKey,
          orderId: land.orderId.toString(),
          paymentTxHash: land.paymentTxHash,
          acquiredAt: land.acquiredAt,
          // Legacy fields for backward compatibility
          stateKey: stateKey,
          areaKey: areaKey,
          purchasedAt: land.purchasedAt || land.acquiredAt,
          purchasePriceUSDT: land.purchasePriceUSDT,
          createdAt: land.createdAt,
          updatedAt: land.updatedAt,
        };
      });

      console.log(`[GET /api/user/lands] Returning ${lands.length} formatted lands`);
      
      res.status(200).json({
        success: true,
        lands,
        count: lands.length,
      });
    } else {
      // No lands found - return empty array
      console.log(`[GET /api/user/lands] No lands found, returning empty array`);
      res.status(200).json({
        success: true,
        lands: [],
        count: 0,
      });
    }
  } catch (error: any) {
    console.error('[GET /api/user/lands] Error:', error);
    console.error('[GET /api/user/lands] Error stack:', error.stack);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
});

/**
 * @route   GET /api/users/me
 * @desc    Get current user's full account data (with agentProfile and referralStats)
 * @access  Private
 */
router.get('/me', authenticate, async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.id;

    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    // Initialize agentProfile if user is AGENT but agentProfile doesn't exist
    let agentProfile = user.agentProfile;
    if (user.role === 'AGENT' && !agentProfile) {
      agentProfile = {
        title: 'Independent Land Agent',
        commissionRate: 0.25,
        joinedAt: user.createdAt,
      };
    }

    // Initialize agentProfile for USER role (default values for display)
    if (!agentProfile) {
      agentProfile = {
        title: 'Independent Land Agent',
        commissionRate: 0.25,
        joinedAt: user.createdAt,
      };
    }

    // Initialize referralStats if not present
    const referralStats = user.referralStats || {
      totalReferrals: 0,
      totalEarningsUSDT: '0',
    };

    // Return user account matching UserAccount model structure
    res.status(200).json({
      name: user.name,
      email: user.email,
      photoUrl: user.photoUrl || null,
      walletAddress: user.walletAddress || null,
      referralCode: user.referralCode || null,
      referredBy: user.referredBy ? user.referredBy.toString() : null,
      agentProfile: {
        title: agentProfile.title,
        commissionRate: agentProfile.commissionRate,
        joinedAt: agentProfile.joinedAt.toISOString(),
      },
      referralStats: {
        totalReferrals: referralStats.totalReferrals,
        totalEarningsUSDT: referralStats.totalEarningsUSDT,
      },
      createdAt: user.createdAt.toISOString(),
    });
  } catch (error: any) {
    console.error('Get user account error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
});

/**
 * @route   POST /api/users/add-referral
 * @desc    Add referral code (ONE TIME ONLY, immutable after set)
 * @access  Private
 */
router.post(
  '/add-referral',
  authenticate,
  [
    body('referralCode')
      .trim()
      .notEmpty()
      .withMessage('Referral code is required')
      .isLength({ min: 4, max: 20 })
      .withMessage('Referral code must be between 4 and 20 characters'),
  ],
  async (req: AuthRequest, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors: errors.array(),
        });
      }

      const userId = req.user!.id;
      const { referralCode } = req.body;
      const normalizedCode = referralCode.trim().toUpperCase();

      // Get current user
      const user = await User.findById(userId);
      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found',
        });
      }

      // Check if user already has a referral (immutable)
      if (user.referredBy) {
        return res.status(403).json({
          success: false,
          message: 'Referral code already set. Cannot be changed.',
        });
      }

      // Find referrer by referral code
      const referrer = await User.findOne({
        referralCode: normalizedCode,
      });

      if (!referrer) {
        return res.status(400).json({
          success: false,
          message: 'Invalid referral code',
        });
      }

      // Hard rule: Cannot refer yourself
      if (referrer._id.toString() === userId) {
        return res.status(400).json({
          success: false,
          message: 'Cannot refer yourself',
        });
      }

      // Hard rule: Prevent referral loops (A → B → A)
      if (referrer.referredBy) {
        const referrerOfReferrer = await User.findById(referrer.referredBy);
        if (referrerOfReferrer && referrerOfReferrer._id.toString() === userId) {
          return res.status(400).json({
            success: false,
            message: 'Referral loop detected',
          });
        }
      }

      // Update user with referredBy (immutable after this)
      user.referredBy = referrer._id;
      await user.save();

      // Increment referrer's totalReferrals count
      if (referrer.referralStats) {
        referrer.referralStats.totalReferrals = (referrer.referralStats.totalReferrals || 0) + 1;
        await referrer.save();
      }

      // Initialize agentProfile if needed for response
      let agentProfile = user.agentProfile;
      if (user.role === 'AGENT' && !agentProfile) {
        agentProfile = {
          title: 'Independent Land Agent',
          commissionRate: 0.25,
          joinedAt: user.createdAt,
        };
      }
      if (!agentProfile) {
        agentProfile = {
          title: 'Independent Land Agent',
          commissionRate: 0.25,
          joinedAt: user.createdAt,
        };
      }

      // Initialize referralStats if needed
      const referralStats = user.referralStats || {
        totalReferrals: 0,
        totalEarningsUSDT: '0',
      };

      // Return updated user account
      res.status(200).json({
        success: true,
        message: 'Referral code added successfully',
        user: {
          name: user.name,
          email: user.email,
          photoUrl: user.photoUrl || null,
          walletAddress: user.walletAddress || null,
          referralCode: user.referralCode || null,
          referredBy: user.referredBy ? user.referredBy.toString() : null,
          agentProfile: {
            title: agentProfile.title,
            commissionRate: agentProfile.commissionRate,
            joinedAt: agentProfile.joinedAt.toISOString(),
          },
          referralStats: {
            totalReferrals: referralStats.totalReferrals,
            totalEarningsUSDT: referralStats.totalEarningsUSDT,
          },
          createdAt: user.createdAt.toISOString(),
        },
      });
    } catch (error: any) {
      console.error('Add referral code error:', error);
      res.status(500).json({
        success: false,
        message: 'Server error',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined,
      });
    }
  }
);

export default router;

