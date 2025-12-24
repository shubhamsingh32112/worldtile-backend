import express from 'express';
import { body, validationResult } from 'express-validator';
import Subscription from '../models/Subscription.model';

const router = express.Router();

/**
 * @route   POST /api/subscriptions/subscribe
 * @desc    Subscribe an email to the newsletter
 * @access  Public
 */
router.post(
  '/subscribe',
  [
    body('email')
      .trim()
      .notEmpty()
      .withMessage('Email is required')
      .isEmail()
      .withMessage('Please provide a valid email address')
      .normalizeEmail()
      .toLowerCase(),
  ],
  async (req: express.Request, res: express.Response): Promise<void> => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors: errors.array(),
        });
        return;
      }

      const { email } = req.body;
      const source = req.body.source || 'footer'; // Default to 'footer' if not specified

      // Check if email already exists
      const existingSubscription = await Subscription.findOne({ email });

      if (existingSubscription) {
        // If subscription exists but is inactive, reactivate it
        if (!existingSubscription.isActive) {
          existingSubscription.isActive = true;
          existingSubscription.subscribedAt = new Date();
          existingSubscription.unsubscribedAt = undefined;
          existingSubscription.source = source;
          await existingSubscription.save();

          res.status(200).json({
            success: true,
            message: 'Successfully resubscribed to newsletter!',
          });
          return;
        }

        // If already subscribed and active
        res.status(409).json({
          success: false,
          message: 'This email is already subscribed to our newsletter.',
        });
        return;
      }

      // Create new subscription
      const subscription = new Subscription({
        email,
        source,
        isActive: true,
        subscribedAt: new Date(),
      });

      await subscription.save();

      res.status(201).json({
        success: true,
        message: 'Successfully subscribed to newsletter!',
      });
    } catch (error: any) {
      console.error('Subscribe error:', error);

      // Handle duplicate key error (unique constraint violation)
      if (error.code === 11000) {
        res.status(409).json({
          success: false,
          message: 'This email is already subscribed to our newsletter.',
        });
        return;
      }

      res.status(500).json({
        success: false,
        message: 'Failed to subscribe. Please try again later.',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined,
      });
    }
  }
);

/**
 * @route   POST /api/subscriptions/unsubscribe
 * @desc    Unsubscribe an email from the newsletter
 * @access  Public
 */
router.post(
  '/unsubscribe',
  [
    body('email')
      .trim()
      .notEmpty()
      .withMessage('Email is required')
      .isEmail()
      .withMessage('Please provide a valid email address')
      .normalizeEmail()
      .toLowerCase(),
  ],
  async (req: express.Request, res: express.Response): Promise<void> => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors: errors.array(),
        });
        return;
      }

      const { email } = req.body;

      const subscription = await Subscription.findOne({ email });

      if (!subscription) {
        res.status(404).json({
          success: false,
          message: 'Email not found in our subscription list.',
        });
        return;
      }

      if (!subscription.isActive) {
        res.status(400).json({
          success: false,
          message: 'This email is already unsubscribed.',
        });
        return;
      }

      subscription.isActive = false;
      subscription.unsubscribedAt = new Date();
      await subscription.save();

      res.status(200).json({
        success: true,
        message: 'Successfully unsubscribed from newsletter.',
      });
    } catch (error: any) {
      console.error('Unsubscribe error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to unsubscribe. Please try again later.',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined,
      });
    }
  }
);

/**
 * @route   GET /api/subscriptions/all
 * @desc    Get all subscriptions (admin only - can add auth middleware later)
 * @access  Public (should be protected with admin middleware)
 */
router.get('/all', async (req: express.Request, res: express.Response): Promise<void> => {
  try {
    const { page = 1, limit = 50, active } = req.query;
    const pageNumber = parseInt(page as string, 10);
    const limitNumber = parseInt(limit as string, 10);
    const skip = (pageNumber - 1) * limitNumber;

    const query: any = {};
    if (active !== undefined) {
      query.isActive = active === 'true';
    }

    const [subscriptions, total] = await Promise.all([
      Subscription.find(query)
        .sort({ subscribedAt: -1 })
        .skip(skip)
        .limit(limitNumber)
        .lean(),
      Subscription.countDocuments(query),
    ]);

    res.status(200).json({
      success: true,
      subscriptions,
      pagination: {
        page: pageNumber,
        limit: limitNumber,
        total,
        pages: Math.ceil(total / limitNumber),
      },
    });
  } catch (error: any) {
    console.error('Get subscriptions error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch subscriptions.',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
});

export default router;

