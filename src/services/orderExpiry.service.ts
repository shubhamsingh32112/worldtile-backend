import Order from '../models/Order.model';
import LandSlot from '../models/LandSlot.model';

/**
 * Order Expiry Service
 * Handles automatic expiry of pending orders via background job
 */
export class OrderExpiryService {
  /**
   * Process expired orders
   * Finds all PENDING orders where expiresAt < now
   * Marks them as EXPIRED and unlocks land slots
   */
  static async processExpiredOrders(): Promise<{
    processed: number;
    errors: number;
  }> {
    const now = new Date();
    let processed = 0;
    let errors = 0;

    try {
      // Find orders where status = PENDING AND expiresAt < now
      // Support both nested and legacy expiry fields
      const expiredOrders = await Order.find({
        status: 'PENDING',
        $or: [
          { 'expiry.expiresAt': { $lt: now } },
          { expiresAt: { $lt: now } }, // Legacy field
        ],
      });

      console.log(`[OrderExpiry] Found ${expiredOrders.length} expired orders to process`);

      for (const order of expiredOrders) {
        try {
          // Update order status to EXPIRED
          order.status = 'EXPIRED';
          if (order.expiry) {
            order.expiry.expiredAt = now;
          }
          await order.save();

          // Unlock land slots
          await LandSlot.updateMany(
            { landSlotId: { $in: order.landSlotIds } },
            {
              $set: {
                status: 'AVAILABLE',
                lockedBy: null,
                lockExpiresAt: null,
              },
            }
          );

          processed++;
          console.log(`[OrderExpiry] Processed expired order: ${order._id}`);
        } catch (error: any) {
          errors++;
          console.error(`[OrderExpiry] Error processing order ${order._id}:`, error.message);
          // Continue with next order
        }
      }

      return { processed, errors };
    } catch (error: any) {
      console.error('[OrderExpiry] Fatal error in processExpiredOrders:', error);
      throw error;
    }
  }

  /**
   * Start the expiry worker (runs every 1-2 minutes)
   * Call this once when server starts
   */
  static startWorker(intervalMinutes: number = 1): NodeJS.Timeout {
    console.log(`[OrderExpiry] Starting expiry worker (interval: ${intervalMinutes} minute(s))`);

    // Run immediately on start
    this.processExpiredOrders().catch((error) => {
      console.error('[OrderExpiry] Error in initial expiry check:', error);
    });

    // Then run on interval
    const intervalMs = intervalMinutes * 60 * 1000;
    const interval = setInterval(() => {
      this.processExpiredOrders().catch((error) => {
        console.error('[OrderExpiry] Error in expiry worker:', error);
      });
    }, intervalMs);

    return interval;
  }

  /**
   * Stop the expiry worker
   */
  static stopWorker(interval: NodeJS.Timeout): void {
    clearInterval(interval);
    console.log('[OrderExpiry] Expiry worker stopped');
  }
}

