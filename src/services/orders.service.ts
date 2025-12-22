import Order from '../models/Order.model';
import Area from '../models/Area.model';
import State from '../models/State.model';
import LandSlot from '../models/LandSlot.model';
import User from '../models/User.model';
import { LandSlotService } from './landSlot.service';
import { PricingService } from './pricing.service';
import { PaymentVerificationService } from './paymentVerification.service';

/**
 * Orders Service
 * Handles order business logic
 */
export class OrdersService {
  /**
   * Lazy expiry check - expires order if it has passed expiresAt
   * This is called whenever an order is accessed, ensuring expired orders
   * are marked as EXPIRED without needing a background worker
   * @param order - Order document to check
   * @throws Error if order is expired (with message 'Order expired')
   */
  private static async checkAndExpireOrder(order: any): Promise<void> {
    // Only check PENDING orders
    if (order.status !== 'PENDING') {
      return;
    }

    const now = new Date();
    const expiresAt = order.expiry?.expiresAt || order.expiresAt;

    if (!expiresAt) {
      return; // No expiry set, skip check
    }

    if (now > expiresAt) {
      // Order has expired - expire it NOW
      order.status = 'EXPIRED';
      if (order.expiry) {
        order.expiry.expiredAt = now;
      }
      await order.save();

      // Unlock land slots
      await this.unlockLandSlots(order.landSlotIds);

      throw new Error('Order expired. Payment window has closed. Slots have been released.');
    }
  }
  /**
   * Create a new order
   * @param userId - User ID
   * @param state - State key
   * @param place - Area key (place)
   * @param landSlotIds - Array of land slot IDs
   * @returns Created order and payment details
   * @throws Error if validation fails or order creation fails
   */
  static async createOrder(
    userId: string,
    state: string,
    place: string,
    landSlotIds: string[]
  ): Promise<{
    order: any;
    amount: string;
    address: string;
    network: string;
  }> {
    // Normalize inputs
    const normalizedState = state.toLowerCase().trim();
    const normalizedPlace = place.toLowerCase().trim();
    const normalizedLandSlotIds = landSlotIds.map((id) => id.trim());

    // Validate at least one slot
    if (normalizedLandSlotIds.length === 0) {
      throw new Error('At least one land slot ID is required');
    }

    // Validate state exists
    const stateDoc = await State.findOne({
      stateKey: normalizedState,
      enabled: true,
    });

    if (!stateDoc) {
      throw new Error('State not found or not enabled');
    }

    // Validate area exists
    const area = await Area.findOne({
      areaKey: normalizedPlace,
      stateKey: normalizedState,
      enabled: true,
    });

    if (!area) {
      throw new Error('Area not found or not enabled');
    }

    // Calculate price server-side (price per tile * quantity)
    const pricePerTile = await PricingService.calculateUSDTAmount();
    const quantity = normalizedLandSlotIds.length;
    const totalAmount = (parseFloat(pricePerTile) * quantity).toFixed(6);
    const usdtAddress = PricingService.getUSDTAddress();

    // Create order with 15 minute expiry
    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + 15); // 15 minutes from now

    // Get user to check referral info
    const user = await User.findById(userId);
    if (!user) {
      throw new Error('User not found');
    }

    // Set up referral info (if user was referred)
    let referralInfo: any = null;
    if (user.referredBy) {
      // Hard rule: Cannot refer yourself
      if (user.referredBy.toString() === userId) {
        throw new Error('Cannot refer yourself');
      }

      // Default commission rate is 25% (0.25)
      const commissionRate = 0.25;
      const commissionAmount = (parseFloat(totalAmount) * commissionRate).toFixed(6);

      referralInfo = {
        referrerId: user.referredBy,
        commissionRate: commissionRate,
        commissionRateAtPurchase: commissionRate, // Immutable snapshot
        commissionAmountUSDT: commissionAmount,
      };
    }

    // Validate and lock all land slots WITH order expiry time
    // This ensures locks expire at the same time as the order
    for (const landSlotId of normalizedLandSlotIds) {
      await LandSlotService.validateAndLockSlot(
        landSlotId,
        normalizedPlace,
        normalizedState,
        userId,
        expiresAt // Lock expires when order expires
      );
    }

    // Create order with nested structures
    const order = new Order({
      userId: userId,
      state: normalizedState,
      place: normalizedPlace,
      landSlotIds: normalizedLandSlotIds,
      quantity: quantity,
      usdtAddress: usdtAddress,
      network: 'TRC20',
      status: 'PENDING',
      // New nested structures
      payment: {
        expectedAmountUSDT: totalAmount,
        confirmations: 0,
      },
      expiry: {
        expiresAt: expiresAt,
      },
      referral: referralInfo,
      // Legacy fields (for backward compatibility)
      expectedAmountUSDT: totalAmount,
      confirmations: 0,
      expiresAt: expiresAt,
      nft: {
        chain: null,
        contractAddress: null,
        tokenId: null,
        txHash: null,
      },
    });

    await order.save();

    return {
      order,
      amount: totalAmount,
      address: usdtAddress,
      network: 'TRC20',
    };
  }

  /**
   * Submit transaction hash for an order
   * @param userId - User ID
   * @param orderId - Order ID
   * @param txHash - Transaction hash
   * @returns Updated order
   * @throws Error if validation fails
   */
  static async submitTransactionHash(
    userId: string,
    orderId: string,
    txHash: string
  ): Promise<any> {
    // Validate order exists and belongs to user
    const order = await Order.findOne({
      _id: orderId,
      userId: userId,
    });

    if (!order) {
      throw new Error('Order not found');
    }

    // Lazy expiry check - expire if needed
    await this.checkAndExpireOrder(order);
    // Note: If expired, checkAndExpireOrder throws, so we won't reach here

    // Validate order status is PENDING (should still be PENDING after expiry check)
    if (order.status !== 'PENDING') {
      throw new Error(`Cannot submit transaction hash. Order status is ${order.status}`);
    }

    // Check if txHash is already used in any other order
    const existingOrder = await Order.findOne({
      txHash: txHash.trim(),
      _id: { $ne: orderId }, // Exclude current order
    });

    if (existingOrder) {
      throw new Error('This transaction hash has already been used in another order');
    }

    // Update order with txHash (keep status as PENDING)
    order.txHash = txHash.trim();
    await order.save();

    return order;
  }

  /**
   * Get order by ID (for user)
   * @param userId - User ID
   * @param orderId - Order ID
   * @returns Order document
   * @throws Error if order not found
   */
  static async getOrderById(userId: string, orderId: string): Promise<any> {
    const order = await Order.findOne({
      _id: orderId,
      userId: userId,
    });

    if (!order) {
      throw new Error('Order not found');
    }

    // Lazy expiry check - expire if needed (non-blocking for GET requests)
    // If expired, we still return the order with EXPIRED status for frontend handling
    try {
      await this.checkAndExpireOrder(order);
    } catch (error: any) {
      // Order was expired and status updated, reload to get fresh status (with userId check)
      return await Order.findOne({
        _id: orderId,
        userId: userId,
      }) || order;
    }

    return order;
  }

  /**
   * Get all orders for a user
   * @param userId - User ID
   * @param status - Optional status filter
   * @returns Array of orders
   */
  static async getUserOrders(userId: string, status?: string): Promise<any[]> {
    const query: any = { userId: userId };
    if (status) {
      query.status = status;
    }

    const orders = await Order.find(query).sort({ createdAt: -1 });

    // Lazy expiry check - expire any expired PENDING orders (non-blocking)
    for (const order of orders) {
      try {
        await this.checkAndExpireOrder(order);
      } catch (error: any) {
        // Order was expired, continue with next order
        // The order status has been updated to EXPIRED in the DB
      }
    }

    // Reload orders to get updated statuses
    return await Order.find(query).sort({ createdAt: -1 });
  }

  /**
   * Verify payment for an order using TronGrid v1 API
   * @param userId - User ID
   * @param orderId - Order ID
   * @returns Verification result
   * @throws Error if verification fails
   * @deprecated This method now delegates to PaymentVerificationService.verifyAndFinalizeOrder
   */
  static async verifyPayment(
    userId: string,
    orderId: string
  ): Promise<{
    success: boolean;
    status: string;
    message: string;
    confirmations?: number;
  }> {
    // Validate order exists and belongs to user
    const order = await Order.findOne({
      _id: orderId,
      userId: userId,
    });

    if (!order) {
      throw new Error('Order not found');
    }

    // Lazy expiry check - expire if needed
    await this.checkAndExpireOrder(order);
    // Note: If expired, checkAndExpireOrder throws, so we won't reach here

    // Ensure txHash exists (for manual verification flow)
    const txHash = order.payment?.txHash || order.txHash;
    if (!txHash) {
      throw new Error('Transaction hash not found. Please submit transaction hash first.');
    }

    // Delegate to atomic verification function
    return await PaymentVerificationService.verifyAndFinalizeOrder(orderId);
  }

  /**
   * Unlock land slots (idempotent)
   * @param landSlotIds - Array of land slot IDs to unlock
   */
  private static async unlockLandSlots(landSlotIds: string[]): Promise<void> {
    try {
      await LandSlot.updateMany(
        { landSlotId: { $in: landSlotIds } },
        {
          status: 'AVAILABLE',
          lockedBy: null,
          lockExpiresAt: null,
        }
      );
    } catch (error: any) {
      console.error('Error unlocking land slots:', error);
      // Don't throw - this should be idempotent
    }
  }

  /**
   * Auto-verify payment for an order by checking recent transactions
   * Finds matching transaction by amount and automatically verifies it
   * @param userId - User ID
   * @param orderId - Order ID
   * @returns Verification result
   * @throws Error if verification fails
   */
  static async autoVerifyPayment(
    userId: string,
    orderId: string
  ): Promise<{
    success: boolean;
    status: string;
    message: string;
    confirmations?: number;
    txHash?: string;
  }> {
    // Validate order exists and belongs to user
    const order = await Order.findOne({
      _id: orderId,
      userId: userId,
    });

    if (!order) {
      throw new Error('Order not found');
    }

    // Lazy expiry check - expire if needed
    try {
      await this.checkAndExpireOrder(order);
    } catch (error: any) {
      // Order expired - return expired status
      return {
        success: false,
        status: 'EXPIRED',
        message: error.message || 'Order expired',
      };
    }

    // If already PAID, return success
    if (order.status === 'PAID') {
      const txHash = order.payment?.txHash || order.txHash;
      return {
        success: true,
        status: 'PAID',
        message: 'Payment already verified',
        txHash: txHash || undefined,
      };
    }

    // Delegate to atomic verification function
    // This will handle:
    // - Transaction detection
    // - Payment verification
    // - Order finalization
    // Note: Expiry already checked above
    const result = await PaymentVerificationService.verifyAndFinalizeOrder(orderId);

    // Get txHash from order if available
    const txHash = order.payment?.txHash || order.txHash;

    return {
      ...result,
      txHash: txHash || undefined,
    };
  }
}

