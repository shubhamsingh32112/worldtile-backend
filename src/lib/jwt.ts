import jwt, { Secret, SignOptions } from 'jsonwebtoken';
import { Response } from 'express';

const JWT_SECRET: Secret =
  process.env.JWT_SECRET ?? 'your-secret-key-change-in-production';
const JWT_EXPIRES_IN: string = process.env.JWT_EXPIRES_IN || '7d';

export interface BackendJWTPayload {
  userId: string;
  email?: string;
  role?: 'USER' | 'AGENT' | 'ADMIN';
}

/**
 * Create a backend JWT token for authenticated users
 */
export function createBackendJWT(user: { _id: any; email?: string; role?: string }): string {
  const payload: BackendJWTPayload = {
    userId: user._id.toString(),
    email: user.email,
    role: user.role as 'USER' | 'AGENT' | 'ADMIN' | undefined,
  };

  // Use type assertion to satisfy TypeScript's strict checking
  // JWT_EXPIRES_IN is a string like '7d' which is valid for expiresIn
  return jwt.sign(payload, JWT_SECRET, {
    expiresIn: JWT_EXPIRES_IN,
  } as SignOptions);
}

/**
 * Verify a backend JWT token
 */
export function verifyBackendJWT(token: string): BackendJWTPayload {
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as BackendJWTPayload;
    return decoded;
  } catch (error) {
    throw new Error('Invalid or expired token');
  }
}

/**
 * Set authentication cookie with backend JWT
 */
export function setAuthCookie(res: Response, token: string): void {
  const isProduction = process.env.NODE_ENV === 'production';
  
  res.cookie('auth_token', token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: isProduction, // true in production, false in development
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  });
}

