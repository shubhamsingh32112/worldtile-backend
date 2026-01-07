import express from 'express';
import { thirdwebAuth, ThirdwebAuthRequest } from '../middleware/thirdwebAuth.middleware';
import SupportTicket from '../models/SupportTicket.model';
import mongoose from 'mongoose';

const router = express.Router();

/**
 * @route   POST /api/support/user-query
 * @desc    Create a support ticket for user query
 * @access  Private
 */
router.post(
  '/user-query',
  thirdwebAuth,
  async (req: ThirdwebAuthRequest, res: express.Response): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({
          success: false,
          message: 'User not found',
        });
        return;
      }
      const userId = req.user.id;
      const { withdrawalId, message } = req.body;

      // Validate input
      if (!message || !message.trim()) {
        res.status(400).json({
          success: false,
          message: 'Message is required',
        });
        return;
      }

      // Create support ticket
      const supportTicket = new SupportTicket({
        userId: new mongoose.Types.ObjectId(userId),
        withdrawalId: withdrawalId ? new mongoose.Types.ObjectId(withdrawalId) : undefined,
        message: message.trim(),
        status: 'OPEN',
      });

      await supportTicket.save();

      res.status(200).json({
        success: true,
        message: 'Support request sent to admin',
        ticketId: supportTicket._id.toString(),
      });
    } catch (error: any) {
      console.error('Create support ticket error:', error);
      res.status(500).json({
        success: false,
        message: 'Server error',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined,
      });
    }
  }
);

export default router;

