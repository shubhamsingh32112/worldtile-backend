import { Response, NextFunction } from 'express';
import { ThirdwebAuthRequest } from './thirdwebAuth.middleware';
import User from '../models/User.model';

/**
 * Role-based access control middleware
 * Requires user to have one of the specified roles
 * @param allowedRoles - Array of allowed roles ('USER' | 'AGENT' | 'ADMIN')
 */
export const requireRole = (allowedRoles: ('USER' | 'AGENT' | 'ADMIN')[]) => {
  return async (
    req: ThirdwebAuthRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      // First ensure user is authenticated (thirdwebAuth middleware should have set req.user)
      if (!req.user || !req.user.id) {
        res.status(401).json({
          success: false,
          message: 'Authentication required',
        });
        return;
      }

      // Get user from database to check role
      const user = await User.findById(req.user.id).select('role');

      if (!user) {
        res.status(404).json({
          success: false,
          message: 'User not found',
        });
        return;
      }

      // Check if user has required role
      if (!allowedRoles.includes(user.role)) {
        res.status(403).json({
          success: false,
          message: `Access denied. Required role: ${allowedRoles.join(' or ')}`,
        });
        return;
      }

      // Attach user role to request for use in controllers
      req.user.role = user.role;

      next();
    } catch (error: any) {
      console.error('Role middleware error:', error);
      res.status(500).json({
        success: false,
        message: 'Authorization error',
      });
    }
  };
};

/**
 * Convenience middleware for ADMIN only
 */
export const requireAdmin = requireRole(['ADMIN']);

/**
 * Convenience middleware for AGENT or ADMIN
 */
export const requireAgent = requireRole(['AGENT', 'ADMIN']);

/**
 * Convenience middleware for any authenticated user (USER, AGENT, or ADMIN)
 */
export const requireUser = requireRole(['USER', 'AGENT', 'ADMIN']);

