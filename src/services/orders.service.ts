import mongoose from 'mongoose';
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
   * @param quantity - Number of slots to purchase (backend will atomically assign slots)
   * @returns Created order and payment details
   * @throws Error if validation fails or order creation fails
   */
  static async createOrder(
    userId: string,
    state: string,
    place: string,
    quantity: number
  ): Promise<{
    order: any;
    amount: string;
    address: string;
    network: string;
    assignedSlots: string[];
  }> {
    // Normalize inputs
    const normalizedState = state.toLowerCase().trim();
    const normalizedPlace = place.toLowerCase().trim();

    // Validate quantity
    if (!quantity || quantity < 1 || quantity > 100) {
      throw new Error('Quantity must be between 1 and 100');
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

    // Get user to check referral info (before pricing calculation)
    const user = await User.findById(userId);
    if (!user) {
      throw new Error('User not found');
    }

    // Calculate pricing with discount (if user has referral)
    const hasReferral = !!user.referredBy;
    const pricing = PricingService.calculatePricing(quantity, hasReferral);
    
    // Use finalAmount as the expected amount (after discount)
    const totalAmount = pricing.finalAmountUSDT;
    const usdtAddress = PricingService.getUSDTAddress();

    // Create order with 15 minute expiry
    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + 15); // 15 minutes from now

    // Set up referral info (if user was referred)
    let referralInfo: any = null;
    if (user.referredBy) {
      // Hard rule: Cannot refer yourself
      if (user.referredBy.toString() === userId) {
        throw new Error('Cannot refer yourself');
      }

      // Default commission rate is 25% (0.25)
      // Commission is calculated on paidAmountUSDT (final amount after discount)
      // This is handled in paymentVerification service
      const commissionRate = 0.25;

      referralInfo = {
        referrerId: user.referredBy,
        commissionRate: commissionRate,
        commissionRateAtPurchase: commissionRate, // Immutable snapshot
        // commissionAmountUSDT will be calculated on paidAmountUSDT during payment verification
      };
    }

    // Atomically allot and lock slots
    // This prevents race conditions when multiple users click simultaneously
    const { assignedSlots } = await LandSlotService.allotSlotsForOrder(
      normalizedState,
      normalizedPlace,
      quantity,
      userId,
      expiresAt // Lock expires when order expires
    );

    // Create order with nested structures
    const order = new Order({
      userId: userId,
      state: normalizedState,
      place: normalizedPlace,
      landSlotIds: assignedSlots, // Use atomically assigned slots
      quantity: quantity,
      usdtAddress: usdtAddress,
      network: 'TRC20',
      status: 'PENDING',
      // New nested structures
      payment: {
        expectedAmountUSDT: totalAmount, // Final amount after discount
        confirmations: 0,
      },
      expiry: {
        expiresAt: expiresAt,
      },
      referral: referralInfo,
      pricing: {
        baseAmountUSDT: pricing.baseAmountUSDT,
        discountUSDT: pricing.discountUSDT,
        finalAmountUSDT: pricing.finalAmountUSDT,
      },
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
      assignedSlots, // Return assigned slots for frontend reference
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

  /**
   * Add referral to an order (ONE TIME ONLY, before payment)
   * Uses atomic operations and transaction to prevent race conditions
   * @param userId - User ID
   * @param orderId - Order ID
   * @param referralCode - Referral code to apply
   * @returns Updated order
   * @throws Error if validation fails
   */
  static async addReferralToOrder(
    userId: string,
    orderId: string,
    referralCode: string
  ): Promise<any> {
    const normalizedCode = referralCode.trim().toUpperCase();

    // Validate order exists and belongs to user
    const order = await Order.findOne({
      _id: orderId,
      userId: userId,
    });

    if (!order) {
      throw new Error('Order not found');
    }

    // Rule: Order must be PENDING
    if (order.status !== 'PENDING') {
      throw new Error('Cannot add referral. Order is not pending.');
    }

    // Rule: Order must NOT already have referral
    if (order.referral && order.referral.referrerId) {
      throw new Error('Referral already locked. Cannot change.');
    }

    // Find referrer by referral code (before transaction)
    const referrer = await User.findOne({
      referralCode: normalizedCode,
    });

    if (!referrer) {
      throw new Error('Invalid referral code');
    }

    // Hard rule: Cannot refer yourself
    if (referrer._id.toString() === userId) {
      throw new Error('Cannot refer yourself');
    }

    // Hard rule: Prevent referral loops (A → B → A)
    // If the referrer was referred by the current user, applying their code would create a loop
    if (referrer.referredBy) {
      const referrerOfReferrer = await User.findById(referrer.referredBy);
      if (referrerOfReferrer && referrerOfReferrer._id.toString() === userId) {
        throw new Error('Cannot apply this referral code. This user was referred by you, which would create a referral loop.');
      }
    }

    // Recalculate pricing with discount (user now has referral)
    // User.referredBy will be set, so they get $5 discount
    const newPricing = PricingService.calculatePricing(order.quantity, true); // hasReferral = true (just added)
    const commissionRate = 0.25; // Default 25%
    // Commission will be calculated on paidAmountUSDT during payment verification

    // 🔒 TRANSACTION: All operations must succeed or all fail
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      // 1️⃣ ATOMIC: Set user.referredBy ONLY if it's null (prevents race condition)
      // Use direct MongoDB collection update to bypass Mongoose immutable field restrictions
      const db = mongoose.connection.db;
      if (!db) {
        await session.abortTransaction();
        session.endSession();
        throw new Error('Database connection not available');
      }
      const usersCollection = db.collection('users');
      
      const userUpdateResult = await usersCollection.updateOne(
        { _id: new mongoose.Types.ObjectId(userId), referredBy: null },
        { $set: { referredBy: new mongoose.Types.ObjectId(referrer._id) } },
        { session }
      );

      if (userUpdateResult.matchedCount === 0 || userUpdateResult.modifiedCount === 0) {
        await session.abortTransaction();
        session.endSession();
        throw new Error('User already has a referral. Cannot change.');
      }

      // 2️⃣ ATOMIC: Set order.referral AND update pricing/discount (prevents race condition)
      const orderUpdated = await Order.findOneAndUpdate(
        { 
          _id: orderId,
          userId: userId,
          status: 'PENDING',
          $or: [
            { 'referral.referrerId': { $exists: false } },
            { 'referral.referrerId': null },
          ],
        },
        {
          $set: {
            referral: {
              referrerId: referrer._id,
              commissionRate: commissionRate,
              commissionRateAtPurchase: commissionRate,
              // commissionAmountUSDT will be calculated on paidAmountUSDT during payment verification
            },
            pricing: {
              baseAmountUSDT: newPricing.baseAmountUSDT,
              discountUSDT: newPricing.discountUSDT,
              finalAmountUSDT: newPricing.finalAmountUSDT,
            },
            'payment.expectedAmountUSDT': newPricing.finalAmountUSDT, // Update expected amount with discount
          },
        },
        { session, new: true }
      );

      if (!orderUpdated) {
        await session.abortTransaction();
        session.endSession();
        throw new Error('Order referral already set or order is not pending.');
      }

      // Also update legacy expectedAmountUSDT field (for backward compatibility)
      await Order.findByIdAndUpdate(
        orderId,
        { expectedAmountUSDT: newPricing.finalAmountUSDT },
        { session }
      );

      // 3️⃣ Increment referrer's totalReferrals count
      await User.findByIdAndUpdate(
        referrer._id,
        { $inc: { 'referralStats.totalReferrals': 1 } },
        { session }
      );

      // Commit transaction
      await session.commitTransaction();
      session.endSession();

      // Reload order to get all updated fields
      const updatedOrder = await Order.findById(orderId);
      return updatedOrder || orderUpdated;
    } catch (error: any) {
      // Abort transaction on any error
      await session.abortTransaction();
      session.endSession();
      throw error;
    }
  }
}

