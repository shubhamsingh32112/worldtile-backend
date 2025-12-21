import express from 'express';
import { body, validationResult } from 'express-validator';
import { authenticate, AuthRequest } from '../middleware/auth.middleware';
import { OrdersController } from '../controllers/orders.controller';

const router = express.Router();

/**
 * Validation middleware
 * Checks validation results and returns errors if any
 */
const validate = (req: AuthRequest, res: express.Response, next: express.NextFunction): void => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: errors.array(),
    });
    return;
  }
  next();
};

/**
 * @route   POST /api/orders/create
 * @desc    Create a new order for buying virtual land
 * @access  Private
 */
router.post(
  '/create',
  authenticate,
  [
    body('state')
      .trim()
      .notEmpty()
      .withMessage('State is required'),
    body('place')
      .trim()
      .notEmpty()
      .withMessage('Place (area) is required'),
    body('landSlotIds')
      .isArray({ min: 1 })
      .withMessage('Land slot IDs array is required with at least one slot'),
    body('landSlotIds.*')
      .trim()
      .notEmpty()
      .withMessage('Each land slot ID must be non-empty'),
  ],
  validate,
  OrdersController.createOrder
);

/**
 * @route   POST /api/orders/submit-tx
 * @desc    Submit transaction hash for an order
 * @access  Private
 */
router.post(
  '/submit-tx',
  authenticate,
  [
    body('orderId')
      .trim()
      .notEmpty()
      .withMessage('Order ID is required'),
    body('txHash')
      .trim()
      .notEmpty()
      .withMessage('Transaction hash is required')
      .matches(/^[a-fA-F0-9]{64}$/)
      .withMessage('Transaction hash must be a valid 64-character hexadecimal string'),
  ],
  validate,
  OrdersController.submitTransactionHash
);

/**
 * @route   GET /api/orders
 * @desc    Get all orders for the authenticated user
 * @access  Private
 */
router.get(
  '/',
  authenticate,
  OrdersController.getUserOrders
);

/**
 * @route   GET /api/orders/:orderId
 * @desc    Get a specific order by ID
 * @access  Private
 */
router.get(
  '/:orderId',
  authenticate,
  OrdersController.getOrderById

);

/**
 * @route   POST /api/orders/verify-payment
 * @desc    Verify payment for an order using TronGrid v1 API
 * @access  Private
 */
router.post(
  '/verify-payment',
  authenticate,
  [
    body('orderId')
      .trim()
      .notEmpty()
      .withMessage('Order ID is required'),
  ],
  validate,
  OrdersController.verifyPayment
);

/**
 * @route   POST /api/orders/auto-verify-payment
 * @desc    Auto-verify payment by checking recent transactions to address
 * @access  Private
 */
router.post(
  '/auto-verify-payment',
  authenticate,
  [
    body('orderId')
      .trim()
      .notEmpty()
      .withMessage('Order ID is required'),
  ],
  validate,
  OrdersController.autoVerifyPayment
);

export default router;
