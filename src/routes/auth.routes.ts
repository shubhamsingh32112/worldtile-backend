import express from 'express';
import { body, validationResult } from 'express-validator';
import User from '../models/User.model';
import jwt from 'jsonwebtoken';
import { authenticate, AuthRequest } from '../middleware/auth.middleware';

const router = express.Router();

// Generate JWT token
const generateToken = (userId: string): string => {
  const secret = process.env.JWT_SECRET || 'your-secret-key';
  const expiresIn = process.env.JWT_EXPIRE || '7d';
  return jwt.sign(
    { userId },
    secret,
    {
      expiresIn: expiresIn,
    } as jwt.SignOptions
  );
};

// @route   POST /api/auth/signup
// @desc    Register a new user
// @access  Public
router.post(
  '/signup',
  [
    body('name').trim().notEmpty().withMessage('Name is required'),
    body('email')
      .isEmail()
      .normalizeEmail()
      .withMessage('Please provide a valid email'),
    body('password')
      .isLength({ min: 6 })
      .withMessage('Password must be at least 6 characters'),
  ],
  async (req: express.Request, res: express.Response): Promise<void> => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors: errors.array(),
        });
        return;
      }

      const { name, email, password, referralCode } = req.body;

      // Check if user already exists
      const existingUser = await User.findOne({ email });
      if (existingUser) {
        res.status(400).json({
          success: false,
          message: 'User with this email already exists',
        });
        return;
      }

      // Handle referral code (if provided) - ONLY for new users
      let referredBy = null;
      if (referralCode) {
        // Find referrer by referral code
        const referrer = await User.findOne({ 
          referralCode: referralCode.trim().toUpperCase() 
        });
        
        if (referrer) {
          // Hard rule: Cannot refer yourself
          if (referrer.email.toLowerCase() === email.toLowerCase()) {
            res.status(400).json({
              success: false,
              message: 'Cannot refer yourself',
            });
            return;
          }
          // Hard rule: Prevent referral loops (A → B → A)
          if (referrer.referredBy) {
            const referrerOfReferrer = await User.findById(referrer.referredBy);
            if (referrerOfReferrer && referrerOfReferrer.email.toLowerCase() === email.toLowerCase()) {
              res.status(400).json({
                success: false,
                message: 'Referral loop detected',
              });
              return;
            }
          }
          referredBy = referrer._id;
        } else {
          // Invalid referral code - silently ignore (don't fail signup)
          console.warn(`Invalid referral code provided: ${referralCode}`);
        }
      }

      // Create new user
      const user = new User({
        name,
        email,
        password,
        referredBy: referredBy, // Set only once, immutable after save
      });

      await user.save();

      // If user was referred, increment referrer's totalReferrals count
      if (referredBy) {
        const referrer = await User.findById(referredBy);
        if (referrer && referrer.referralStats) {
          referrer.referralStats.totalReferrals = (referrer.referralStats.totalReferrals || 0) + 1;
          await referrer.save();
        }
      }

      // Generate token
      const token = generateToken(user._id.toString());

      res.status(201).json({
        success: true,
        message: 'User registered successfully',
        token,
        user: {
          id: user._id.toString(),
          name: user.name,
          email: user.email,
          role: user.role,
        },
      });
    } catch (error: any) {
      console.error('Signup error:', error);
      res.status(500).json({
        success: false,
        message: 'Server error during signup',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined,
      });
    }
  }
);

// @route   POST /api/auth/login
// @desc    Login user
// @access  Public
router.post(
  '/login',
  [
    body('email')
      .isEmail()
      .normalizeEmail()
      .withMessage('Please provide a valid email'),
    body('password').notEmpty().withMessage('Password is required'),
  ],
  async (req: express.Request, res: express.Response): Promise<void> => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors: errors.array(),
        });
        return;
      }

      const { email, password } = req.body;

      // Find user with password
      const user = await User.findOne({ email });

      if (!user) {
        res.status(401).json({
          success: false,
          message: 'Invalid email or password',
        });
        return;
      }

      // Check password
      const isPasswordValid = await user.comparePassword(password);

      if (!isPasswordValid) {
        res.status(401).json({
          success: false,
          message: 'Invalid email or password',
        });
        return;
      }

      // Generate token
      const token = generateToken(user._id.toString());

      res.status(200).json({
        success: true,
        message: 'Login successful',
        token,
        user: {
          id: user._id.toString(),
          name: user.name,
          email: user.email,
          role: user.role,
        },
      });
    } catch (error: any) {
      console.error('Login error:', error);
      res.status(500).json({
        success: false,
        message: 'Server error during login',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined,
      });
    }
  }
);

// @route   POST /api/auth/google
// @desc    Authenticate with Google (Firebase)
// @access  Public
router.post(
  '/google',
  [
    body('firebaseUid').notEmpty().withMessage('Firebase UID is required'),
    body('email').isEmail().normalizeEmail().withMessage('Please provide a valid email'),
    body('name').trim().notEmpty().withMessage('Name is required'),
  ],
  async (req: express.Request, res: express.Response): Promise<void> => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors: errors.array(),
        });
        return;
      }

      const { firebaseUid, email, name, photoUrl, referralCode } = req.body;
      const firebaseToken = req.header('Authorization')?.replace('Bearer ', '');

      if (!firebaseToken) {
        res.status(401).json({
          success: false,
          message: 'Firebase token is required',
        });
        return;
      }

      // Find user by Firebase UID or email
      let user = await User.findOne({
        $or: [{ firebaseUid }, { email: email.toLowerCase() }],
      });

      if (user) {
        // Update existing user (but NOT referredBy - it's immutable)
        user.name = name;
        user.email = email.toLowerCase();
        user.firebaseUid = firebaseUid;
        if (photoUrl) {
          user.photoUrl = photoUrl;
        }
        await user.save();
      } else {
        // Handle referral code (if provided) - ONLY for new users
        let referredBy = null;
        if (referralCode) {
          // Find referrer by referral code
          const referrer = await User.findOne({ 
            referralCode: referralCode.trim().toUpperCase() 
          });
          
          if (referrer) {
            // Hard rule: Cannot refer yourself
            if (referrer.email.toLowerCase() === email.toLowerCase()) {
              res.status(400).json({
                success: false,
                message: 'Cannot refer yourself',
              });
              return;
            }
            // Hard rule: Prevent referral loops (A → B → A)
            // Check if referrer was referred by this email (would create loop)
            if (referrer.referredBy) {
              const referrerOfReferrer = await User.findById(referrer.referredBy);
              if (referrerOfReferrer && referrerOfReferrer.email.toLowerCase() === email.toLowerCase()) {
                res.status(400).json({
                  success: false,
                  message: 'Referral loop detected',
                });
                return;
              }
            }
            referredBy = referrer._id;
          } else {
            // Invalid referral code - silently ignore (don't fail signup)
            console.warn(`Invalid referral code provided: ${referralCode}`);
          }
        }

        // Create new user
        user = new User({
          name,
          email: email.toLowerCase(),
          firebaseUid,
          photoUrl: photoUrl || undefined,
          referredBy: referredBy, // Set only once, immutable after save
          // No password for Firebase-authenticated users
        });
        await user.save();

        // If user was referred, increment referrer's totalReferrals count
        if (referredBy) {
          const referrer = await User.findById(referredBy);
          if (referrer && referrer.referralStats) {
            referrer.referralStats.totalReferrals = (referrer.referralStats.totalReferrals || 0) + 1;
            await referrer.save();
          }
        }
      }

      // Generate JWT token
      const token = generateToken(user._id.toString());

      res.status(200).json({
        success: true,
        message: 'Authentication successful',
        token,
        user: {
          id: user._id.toString(),
          name: user.name,
          email: user.email,
          photoUrl: user.photoUrl,
          firebaseUid: user.firebaseUid,
          walletAddress: user.walletAddress,
          role: user.role,
        },
      });
    } catch (error: any) {
      console.error('Google auth error:', error);
      res.status(500).json({
        success: false,
        message: 'Server error during authentication',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined,
      });
    }
  }
);

// @route   GET /api/auth/me
// @desc    Get current user
// @access  Private
router.get('/me', authenticate, async (req: AuthRequest, res: express.Response): Promise<void> => {
  try {
    const user = await User.findById(req.user!.id);

    if (!user) {
      res.status(404).json({
        success: false,
        message: 'User not found',
      });
      return;
    }

    res.status(200).json({
      success: true,
      user: {
        id: user._id.toString(),
        name: user.name,
        email: user.email,
        photoUrl: user.photoUrl,
        firebaseUid: user.firebaseUid,
        walletAddress: user.walletAddress,
        role: user.role,
      },
    });
  } catch (error: any) {
    console.error('Get user error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
});

export default router;

