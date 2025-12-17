import Order from '../models/Order.model';
import Area from '../models/Area.model';
import State from '../models/State.model';
import LandSlot from '../models/LandSlot.model';
import mongoose from 'mongoose';
import { LandSlotService } from './landSlot.service';
import { PricingService } from './pricing.service';
import { PaymentVerificationService } from './paymentVerification.service';

/**
 * Orders Service
 * Handles order business logic
 */
export class OrdersService {
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

    // Validate and lock all land slots
    for (const landSlotId of normalizedLandSlotIds) {
      await LandSlotService.validateAndLockSlot(
        landSlotId,
        normalizedPlace,
        normalizedState,
        userId
      );
    }

    // Calculate price server-side (price per tile * quantity)
    const pricePerTile = await PricingService.calculateUSDTAmount(area);
    const quantity = normalizedLandSlotIds.length;
    const totalAmount = (parseFloat(pricePerTile) * quantity).toFixed(6);
    const usdtAddress = PricingService.getUSDTAddress();

    // Create order
    const order = new Order({
      userId: userId,
      state: normalizedState,
      place: normalizedPlace,
      landSlotIds: normalizedLandSlotIds,
      quantity: quantity,
      expectedAmountUSDT: totalAmount,
      usdtAddress: usdtAddress,
      network: 'TRC20',
      status: 'PENDING',
      confirmations: 0,
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

    // Validate order status is PENDING
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

    return await Order.find(query).sort({ createdAt: -1 });
  }

  /**
   * Verify payment for an order using TronGrid v1 API
   * @param userId - User ID
   * @param orderId - Order ID
   * @returns Verification result
   * @throws Error if verification fails
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
    // 1️⃣ Load Order
    const order = await Order.findOne({
      _id: orderId,
      userId: userId,
    });

    if (!order) {
      throw new Error('Order not found');
    }

    // Ensure order status is PENDING
    if (order.status !== 'PENDING') {
      throw new Error(`Order is already ${order.status}. Cannot verify payment.`);
    }

    // Ensure txHash exists
    if (!order.txHash) {
      throw new Error('Transaction hash not found. Please submit transaction hash first.');
    }

    // 2️⃣ Check for double-spend / replay attack
    // Check if this txHash is already used in a PAID order
    const existingPaidOrder = await Order.findOne({
      txHash: order.txHash.trim(),
      status: 'PAID',
      _id: { $ne: orderId }, // Exclude current order
    });

    if (existingPaidOrder) {
      // Mark current order as FAILED due to double-spend attempt
      order.status = 'FAILED';
      await order.save();
      throw new Error('Transaction hash has already been used in another paid order (double-spend detected)');
    }

    // 3️⃣ Call TronGrid API and verify payment
    let verificationResult;
    try {
      verificationResult = await PaymentVerificationService.verifyPayment(
        order.txHash.trim(),
        order.expectedAmountUSDT,
        order.usdtAddress,
        undefined // userWalletAddress - optional, not stored in order currently
      );
    } catch (error: any) {
      // If verification fails, mark order as FAILED
      order.status = 'FAILED';
      await order.save();

      // Check if it's a "pending" error (TronGrid down, insufficient confirmations, etc.)
      if (error.message?.includes('pending') || error.message?.includes('Awaiting confirmations')) {
        // Don't mark as FAILED for pending cases, just throw the error
        order.status = 'PENDING'; // Revert status
        await order.save();
        throw error;
      }

      throw error;
    }

    // If verification succeeded but confirmations < 19, return awaiting message
    if (!verificationResult.success) {
      // Update confirmations count but keep status as PENDING
      order.confirmations = verificationResult.confirmations;
      await order.save();

      return {
        success: false,
        status: 'PENDING',
        message: verificationResult.message || `Awaiting confirmations: ${verificationResult.confirmations}/19`,
        confirmations: verificationResult.confirmations,
      };
    }

    // 4️⃣ Atomic Order Finalization using MongoDB transaction
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      // Update order to PAID
      await Order.findOneAndUpdate(
        { _id: orderId },
        {
          status: 'PAID',
          paidAt: new Date(),
          confirmations: verificationResult.confirmations,
        },
        { session, new: true }
      );

      // Update all land slots to SOLD and remove locks
      await LandSlot.updateMany(
        { landSlotId: { $in: order.landSlotIds } },
        {
          status: 'SOLD',
          lockedBy: null,
          lockExpiresAt: null,
        },
        { session }
      );

      // Commit transaction
      await session.commitTransaction();
      session.endSession();

      return {
        success: true,
        status: 'PAID',
        message: 'Payment verified successfully',
        confirmations: verificationResult.confirmations,
      };
    } catch (error: any) {
      // Abort transaction on any error
      await session.abortTransaction();
      session.endSession();

      // Order remains PENDING, LandSlot remains LOCKED
      throw new Error(`Failed to finalize order: ${error.message}`);
    }
  }
}

