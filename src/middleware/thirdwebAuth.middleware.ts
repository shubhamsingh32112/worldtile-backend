import { Request, Response, NextFunction } from 'express';
import User from '../models/User.model';
import { verifyBackendJWT } from '../lib/jwt';

export interface ThirdwebAuthRequest extends Request {
  user?: {
    id: string;
    email?: string;
    name: string;
    role?: 'USER' | 'AGENT' | 'ADMIN';
  };
}

/**
 * Unified auth middleware using backend-issued JWT.
 * Backend owns the session, not thirdweb.
 * 
 * This middleware:
 * - Verifies backend JWT from HttpOnly cookie
 * - Loads full user document from database
 * - Attaches user to request for use in routes
 */
export const authMiddleware = async (
  req: ThirdwebAuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  const jwt = req.cookies?.auth_token;

  if (!jwt) {
    res.status(401).json({
      success: false,
      message: 'Not authenticated',
    });
    return;
  }

  try {
    // Verify backend JWT (not thirdweb JWT)
    const payload = verifyBackendJWT(jwt);

    // Load full user document from database
    const user = await User.findById(payload.userId);

    if (!user) {
      res.status(401).json({
        success: false,
        message: 'User not found',
      });
      return;
    }

    // Attach user to request
    req.user = {
      id: user._id.toString(),
      email: user.email,
      name: user.name,
      role: user.role,
    };

    next();
  } catch (err: any) {
    console.error('❌ [AUTH] JWT verification failed', err);

    res.status(401).json({
      success: false,
      message: 'Authentication failed. Please log in again.',
    });
  }
};

// Keep old export name for backward compatibility
export const thirdwebAuth = authMiddleware;

export default authMiddleware;
