import LandSlot from '../models/LandSlot.model';
import mongoose from 'mongoose';

/**
 * Land Slot Service
 * Handles land slot operations: locking, validation, status management
 */
export class LandSlotService {
  /**
   * Lock duration in minutes
   */
  private static readonly LOCK_DURATION_MINUTES = 15;

  /**
   * Validate and lock a land slot
   * @param landSlotId - Land slot ID
   * @param areaKey - Area key
   * @param stateKey - State key
   * @param userId - User ID requesting the lock
   * @param lockExpiresAt - Optional lock expiry time (if not provided, uses default 15 minutes)
   * @returns Land slot document if successful
   * @throws Error if validation fails or slot cannot be locked
   */
  static async validateAndLockSlot(
    landSlotId: string,
    areaKey: string,
    stateKey: string,
    userId: string,
    lockExpiresAt?: Date
  ): Promise<any> {
    // Find the land slot
    const landSlot = await LandSlot.findOne({
      landSlotId: landSlotId.trim(),
      areaKey: areaKey.toLowerCase().trim(),
      stateKey: stateKey.toLowerCase().trim(),
    });

    if (!landSlot) {
      throw new Error('Land slot not found');
    }

    // Check if slot is already sold
    if (landSlot.status === 'SOLD') {
      throw new Error('This land slot is already sold');
    }

    // Check if slot is locked by another user
    if (landSlot.status === 'LOCKED') {
      // Check if lock has expired
      if (landSlot.lockExpiresAt && landSlot.lockExpiresAt < new Date()) {
        // Lock expired, we can proceed to lock it again
      } else if (landSlot.lockedBy?.toString() !== userId) {
        throw new Error('This land slot is currently locked by another user');
      }
      // If locked by same user, allow re-locking (extend lock)
    }

    // Apply soft lock - use provided expiry or default 15 minutes
    const finalLockExpiresAt = lockExpiresAt || (() => {
      const defaultExpiry = new Date();
      defaultExpiry.setMinutes(defaultExpiry.getMinutes() + this.LOCK_DURATION_MINUTES);
      return defaultExpiry;
    })();

    const updatedSlot = await LandSlot.findOneAndUpdate(
      { landSlotId: landSlotId.trim() },
      {
        status: 'LOCKED',
        lockedBy: new mongoose.Types.ObjectId(userId),
        lockExpiresAt: finalLockExpiresAt,
      },
      { new: true }
    );

    if (!updatedSlot) {
      throw new Error('Failed to lock land slot');
    }

    return updatedSlot;
  }

  /**
   * Release lock on a land slot (set back to AVAILABLE)
   * @param landSlotId - Land slot ID
   */
  static async releaseLock(landSlotId: string): Promise<void> {
    try {
      await LandSlot.findOneAndUpdate(
        { landSlotId: landSlotId.trim() },
        {
          status: 'AVAILABLE',
          lockedBy: null,
          lockExpiresAt: null,
        }
      );
    } catch (error) {
      console.error('Failed to release lock:', error);
      // Don't throw - this is a cleanup operation
    }
  }

  /**
   * Mark a land slot as SOLD
   * @param landSlotId - Land slot ID
   */
  static async markAsSold(landSlotId: string): Promise<void> {
    await LandSlot.findOneAndUpdate(
      { landSlotId: landSlotId.trim() },
      {
        status: 'SOLD',
        lockedBy: null,
        lockExpiresAt: null,
      }
    );
  }
}

