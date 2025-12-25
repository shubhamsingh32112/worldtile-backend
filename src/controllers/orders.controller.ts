import { Response } from 'express';
import { AuthRequest } from '../middleware/auth.middleware';
import { OrdersService } from '../services/orders.service';

/**
 * Orders Controller
 * Handles HTTP requests and responses for order operations
 */
export class OrdersController {
  /**
   * Create a new order
   * POST /api/orders/create
   * @body { state: string, place: string, quantity: number }
   * Backend atomically assigns slots to prevent race conditions
   */
  static async createOrder(req: AuthRequest, res: Response): Promise<Response> {
    try {
      const userId = req.user!.id;
      const { state, place, quantity } = req.body;

      // Validate quantity
      if (!quantity || typeof quantity !== 'number' || quantity < 1 || quantity > 100) {
        return res.status(400).json({
          success: false,
          message: 'quantity must be a number between 1 and 100',
        });
      }

      // Validate state and place
      if (!state || !place) {
        return res.status(400).json({
          success: false,
          message: 'state and place are required',
        });
      }

      const result = await OrdersService.createOrder(
        userId,
        state,
        place,
        quantity
      );

      return res.status(201).json({
        orderId: result.order._id.toString(),
        amount: result.amount,
        address: result.address,
        network: result.network,
        assignedSlots: result.assignedSlots, // Return assigned slots for reference
        expiresAt: result.order.expiry?.expiresAt || result.order.expiresAt, // Return expiry timestamp
      });
    } catch (error: any) {
      // Use status code from AppError if available, otherwise determine from message
      const statusCode = error.statusCode || error.status || 
        (error.message.includes('not found') ||
         error.message.includes('not enabled') ||
         error.message.includes('already sold') ||
         error.message.includes('locked by another')
          ? 400
          : error.message.includes('not configured')
          ? 500
          : 500);

      // Include metadata if available (for 409 conflicts)
      const responseBody: any = {
        success: false,
        message: error.message || 'Failed to create order',
      };

      if (error.meta) {
        responseBody.meta = error.meta;
      }

      if (process.env.NODE_ENV === 'development') {
        responseBody.error = error.message;
      }

      return res.status(statusCode).json(responseBody);
    }
  }

  /**
   * Submit transaction hash for an order
   * POST /api/orders/submit-tx
   */
  static async submitTransactionHash(req: AuthRequest, res: Response): Promise<Response> {
    try {
      const userId = req.user!.id;
      const { orderId, txHash } = req.body;

      await OrdersService.submitTransactionHash(userId, orderId, txHash);

      return res.status(200).json({
        success: true,
        message: 'Transaction submitted. Verification pending.',
      });
    } catch (error: any) {
      console.error('Submit transaction hash error:', error);

      // Determine status code based on error type
      const statusCode = error.message.includes('not found') ||
                        error.message.includes('Cannot submit') ||
                        error.message.includes('already been used')
        ? 400
        : 500;

      return res.status(statusCode).json({
        success: false,
        message: error.message || 'Failed to submit transaction hash',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined,
      });
    }
  }

  /**
   * Get order by ID
   * GET /api/orders/:orderId
   */
  static async getOrderById(req: AuthRequest, res: Response): Promise<Response> {
    try {
      const userId = req.user!.id;
      const { orderId } = req.params;

      const order = await OrdersService.getOrderById(userId, orderId);

      return res.status(200).json({
        success: true,
        order: {
          _id: order._id,
          userId: order.userId,
          state: order.state,
          place: order.place,
          landSlotIds: order.landSlotIds,
          quantity: order.quantity,
          expectedAmountUSDT: order.expectedAmountUSDT,
          usdtAddress: order.usdtAddress,
          network: order.network,
          status: order.status,
          txHash: order.txHash,
          confirmations: order.confirmations,
          nft: order.nft,
          createdAt: order.createdAt,
          paidAt: order.paidAt,
          expiresAt: order.expiry?.expiresAt || order.expiresAt, // Return expiry timestamp
        },
      });
    } catch (error: any) {
      console.error('Get order error:', error);

      return res.status(404).json({
        success: false,
        message: error.message || 'Order not found',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined,
      });
    }
  }

  /**
   * Get all orders for the authenticated user
   * GET /api/orders
   */
  static async getUserOrders(req: AuthRequest, res: Response): Promise<Response> {
    try {
      const userId = req.user!.id;
      const { status } = req.query;

      const orders = await OrdersService.getUserOrders(
        userId,
        status as string | undefined
      );

      return res.status(200).json({
        success: true,
        count: orders.length,
        orders: orders.map((order) => ({
          _id: order._id,
          state: order.state,
          place: order.place,
          landSlotIds: order.landSlotIds,
          quantity: order.quantity,
          expectedAmountUSDT: order.expectedAmountUSDT,
          network: order.network,
          status: order.status,
          txHash: order.txHash,
          confirmations: order.confirmations,
          createdAt: order.createdAt,
          paidAt: order.paidAt,
        })),
      });
    } catch (error: any) {
      console.error('Get user orders error:', error);

      return res.status(500).json({
        success: false,
        message: 'Failed to fetch orders',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined,
      });
    }
  }

  /**
   * Verify payment for an order
   * POST /api/orders/verify-payment
   */
  static async verifyPayment(req: AuthRequest, res: Response): Promise<Response> {
    try {
      const userId = req.user!.id;
      const { orderId } = req.body;

      const result = await OrdersService.verifyPayment(userId, orderId);

      // If verification is pending (insufficient confirmations), return 200 with pending status
      if (!result.success) {
        return res.status(200).json({
          success: false,
          status: result.status,
          message: result.message,
          confirmations: result.confirmations,
        });
      }

      // Payment verified successfully
      return res.status(200).json({
        success: true,
        status: result.status,
        message: result.message,
        confirmations: result.confirmations,
      });
    } catch (error: any) {
      console.error('Verify payment error:', error);

      // Determine status code based on error type
      const statusCode = error.message.includes('not found') ||
                        error.message.includes('not found') ||
                        error.message.includes('already') ||
                        error.message.includes('Cannot verify') ||
                        error.message.includes('Transaction hash not found')
        ? 400
        : error.message.includes('pending') ||
          error.message.includes('Awaiting confirmations') ||
          error.message.includes('unavailable') ||
          error.message.includes('timeout')
        ? 200 // Return 200 for pending/awaiting cases
        : 500;

      return res.status(statusCode).json({
        success: false,
        message: error.message || 'Failed to verify payment',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined,
      });
    }
  }

  /**
   * Auto-verify payment for an order by checking recent transactions
   * POST /api/orders/auto-verify-payment
   */
  static async autoVerifyPayment(req: AuthRequest, res: Response): Promise<Response> {
    try {
      const userId = req.user!.id;
      const { orderId } = req.body;

      const result = await OrdersService.autoVerifyPayment(userId, orderId);

      // If verification is pending (payment not found or insufficient confirmations), return 200 with pending status
      if (!result.success) {
        return res.status(200).json({
          success: false,
          status: result.status,
          message: result.message,
          confirmations: result.confirmations,
        });
      }

      // Payment verified successfully
      return res.status(200).json({
        success: true,
        status: result.status,
        message: result.message,
        confirmations: result.confirmations,
        txHash: result.txHash,
      });
    } catch (error: any) {
      console.error('Auto-verify payment error:', error);

      // Determine status code based on error type
      const statusCode = error.message.includes('not found') ||
                        error.message.includes('already') ||
                        error.message.includes('Cannot verify') ||
                        error.message.includes('double-spend')
        ? 400
        : error.message.includes('pending') ||
          error.message.includes('Awaiting confirmations') ||
          error.message.includes('unavailable') ||
          error.message.includes('timeout')
        ? 200 // Return 200 for pending/awaiting cases
        : 500;

      return res.status(statusCode).json({
        success: false,
        message: error.message || 'Failed to auto-verify payment',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined,
      });
    }
  }
}

