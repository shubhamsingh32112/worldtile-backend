import User from '../models/User.model';
import mongoose from 'mongoose';

/**
 * User Service
 * Handles user-related business logic
 */
export class UserService {
  /**
   * Promote a user to AGENT role (idempotent)
   * If user is already AGENT or ADMIN, this function does nothing
   * @param userId - User ID to promote
   * @returns true if promotion occurred, false if already AGENT/ADMIN
   * @throws Error if user not found or promotion fails
   */
  static async promoteUserToAgent(
    userId: string | mongoose.Types.ObjectId
  ): Promise<boolean> {
    const user = await User.findById(userId);

    if (!user) {
      throw new Error('User not found');
    }

    // If already AGENT or ADMIN, do nothing (idempotent)
    if (user.role === 'AGENT' || user.role === 'ADMIN') {
      return false;
    }

    // Promote USER to AGENT
    await User.updateOne(
      { _id: userId, role: 'USER' },
      {
        $set: {
          role: 'AGENT',
          agentProfile: {
            commissionRate: 0.25,
            joinedAt: new Date(),
            title: 'Independent Land Agent',
          },
        },
      }
    );

    return true;
  }
}

