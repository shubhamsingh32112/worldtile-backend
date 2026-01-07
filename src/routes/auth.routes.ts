import express from 'express';
import { auth, adminClient } from '../lib/thirdwebAuth';
import { polygon } from 'thirdweb/chains';
import User from '../models/User.model';
import { createBackendJWT, setAuthCookie } from '../lib/jwt';
import { authMiddleware, ThirdwebAuthRequest } from '../middleware/thirdwebAuth.middleware';
import jwt from 'jsonwebtoken';
import jwksClient from 'jwks-rsa';

const router = express.Router();

// ============================================================================
// JWKS Client for In-App Wallet JWT Verification
// ============================================================================
// CRITICAL: In-App Wallet JWTs are signed by thirdweb servers (RS256)
// They use JWKS (JSON Web Key Set) for verification
// JWKS endpoint: https://auth.thirdweb.com/.well-known/jwks.json
const jwksClientInstance = jwksClient({
  jwksUri: 'https://auth.thirdweb.com/.well-known/jwks.json',
  cache: true,
  cacheMaxAge: 86400000, // 24 hours
  rateLimit: true,
  jwksRequestsPerMinute: 10,
});

// Helper function to get signing key from JWKS
function getKey(header: jwt.JwtHeader, callback: jwt.SigningKeyCallback) {
  jwksClientInstance.getSigningKey(header.kid, (err, key) => {
    if (err) {
      return callback(err);
    }
    const signingKey = key?.getPublicKey();
    callback(null, signingKey);
  });
}

// Verify In-App Wallet JWT using JWKS
async function verifyInAppWalletJWT(token: string): Promise<jwt.JwtPayload> {
  return new Promise((resolve, reject) => {
    jwt.verify(
      token,
      getKey,
      {
        algorithms: ['RS256'],
        // Don't verify issuer/audience for now - thirdweb's JWTs might have different claims
        // We'll verify the signature and extract the payload
      },
      (err, decoded) => {
        if (err) {
          reject(err);
        } else {
          resolve(decoded as jwt.JwtPayload);
        }
      }
    );
  });
}

// ============================================================================
// FLOW A: Google / In-App Wallet Login
// ============================================================================
router.post('/in-app/login', async (req, res) => {
  try {
    const { authToken } = req.body;

    if (!authToken) {
      return res.status(400).json({ message: 'Auth token required' });
    }

    // Verify the thirdweb auth token (for In-App Wallets)
    // CRITICAL: In-App Wallet JWTs are signed by thirdweb servers (RS256 with JWKS)
    // Frontend issues JWT with: wallet.getAuthToken({ client: thirdwebClient }) // uses clientId
    // Backend must verify using JWKS (createAuth.verifyJWT is for ES256K, not RS256)
    console.log('[AUTH] Attempting to verify In-App Wallet JWT using JWKS...');
    console.log('[AUTH] AuthToken length:', authToken?.length || 0);
    console.log('[AUTH] AuthToken preview:', authToken?.substring(0, 50) || 'NO TOKEN');
    
    // Decode JWT header to inspect structure
    let header: any = {};
    try {
      const headerPart = authToken.split('.')[0];
      header = JSON.parse(Buffer.from(headerPart, 'base64url').toString());
      console.log('[AUTH] JWT Header:', JSON.stringify(header, null, 2));
      console.log('[AUTH] JWT Algorithm:', header.alg);
      console.log('[AUTH] JWT Key ID:', header.kid);
      console.log('[AUTH] JWT Type:', header.typ);
    } catch (decodeError) {
      console.warn('[AUTH] Could not decode JWT header:', decodeError);
    }
    
    let parsedJWT: jwt.JwtPayload;
    try {
      // CRITICAL: Use JWKS verification for RS256 JWTs from thirdweb servers
      // createAuth.verifyJWT is designed for ES256K (EOA) JWTs, not RS256 (server-signed) JWTs
      parsedJWT = await verifyInAppWalletJWT(authToken);
      console.log('[AUTH] ✅ JWT verified successfully using JWKS');
      console.log('[AUTH] JWT payload keys:', Object.keys(parsedJWT));
    } catch (verifyError: any) {
      console.error('[AUTH] ❌ JWKS verification failed');
      console.error('[AUTH] Error name:', verifyError.name);
      console.error('[AUTH] Error message:', verifyError.message);
      console.error('[AUTH] Error stack:', verifyError.stack);
      return res.status(401).json({ message: 'Invalid token' });
    }

    // Extract address and email from verified JWT
    // In-App Wallet JWTs use 'sub' for the wallet address
    const address = parsedJWT.sub;
    const email = parsedJWT.email as string | undefined;
    
    if (!address) {
      console.error('[AUTH] JWT missing required "sub" claim (wallet address)');
      return res.status(401).json({ message: 'Invalid token: missing address' });
    }
    
    console.log('[AUTH] JWT verified successfully');
    console.log('[AUTH] Extracted address:', address);
    console.log('[AUTH] Extracted email:', email || 'NO EMAIL');

    // Find user by any linked wallet
    const searchAddress = address.toLowerCase();
    console.log('[DB] Looking for user with wallet address:', searchAddress);
    
    let user = await User.findOne({
      'wallets.address': searchAddress,
    });

    console.log('[DB] User found?', Boolean(user));
    if (user) {
      console.log('[DB] Existing user ID:', user._id.toString());
    }

    if (!user) {
      // Create new user with In-App Wallet
      console.log('[DB] Creating new user...');
      console.log('[DB] User data:', {
        name: email?.split('@')[0] || 'User',
        email: email || null,
        primaryWallet: searchAddress,
        walletCount: 1,
      });

      try {
        user = await User.create({
          name: email?.split('@')[0] || 'User', // Use email prefix as name, or 'User' as fallback
          email: email || undefined, // Make email optional - some Google accounts may not have email
          primaryWallet: searchAddress,
          wallets: [
            {
              address: searchAddress,
              type: 'IN_APP',
              provider: 'google',
              isPrimary: true,
              createdAt: new Date(),
            },
          ],
        });
        
        console.log('[DB] ✅ User created successfully');
        console.log('[DB] Created user ID:', user._id.toString());
        console.log('[DB] Created user email:', user.email || 'NO EMAIL');
        console.log('[DB] Created user primaryWallet:', user.primaryWallet);
      } catch (createError: any) {
        console.error('[DB] ❌ User creation FAILED');
        console.error('[DB] Error name:', createError.name);
        console.error('[DB] Error message:', createError.message);
        console.error('[DB] Error stack:', createError.stack);
        
        // Check for specific MongoDB errors
        if (createError.code === 11000) {
          console.error('[DB] Duplicate key error - user may already exist with different query');
        }
        if (createError.errors) {
          console.error('[DB] Validation errors:', JSON.stringify(createError.errors, null, 2));
        }
        
        throw createError; // Re-throw to be caught by outer catch
      }
    } else {
      // User exists - ensure this wallet is linked
      const walletExists = user.wallets.some(
        (w) => w.address.toLowerCase() === address.toLowerCase()
      );

      if (!walletExists) {
        // Link this wallet to existing user
        user.wallets.push({
          address: address.toLowerCase(),
          type: 'IN_APP',
          provider: 'google',
          isPrimary: false,
          createdAt: new Date(),
        });
        await user.save();
      }
    }

    // Issue backend JWT
    const jwt = createBackendJWT(user);
    setAuthCookie(res, jwt);

    return res.json({ success: true, user: { id: user._id, email: user.email } });
  } catch (error: any) {
    console.error('[AUTH] ❌ In-app login error');
    console.error('[AUTH] Error name:', error.name);
    console.error('[AUTH] Error message:', error.message);
    console.error('[AUTH] Error stack:', error.stack || 'No stack trace');
    
    // Log MongoDB connection state
    const mongoose = require('mongoose');
    console.error('[DB] MongoDB connection state:', mongoose.connection.readyState);
    console.error('[DB] MongoDB connection name:', mongoose.connection.name);
    
    return res.status(500).json({ 
      message: error.message || 'Login failed',
      error: process.env.NODE_ENV === 'development' ? error.stack : undefined,
    });
  }
});

// ============================================================================
// FLOW B: EOA (MetaMask / WalletConnect) Login via SIWE
// ============================================================================

// Generate SIWE payload
router.post('/siwe/payload', async (req, res) => {
  try {
    const { address, walletType } = req.body;

    if (!address) {
      return res.status(400).json({ message: 'Address required' });
    }

    // Backend guard: block SIWE for in-app wallets
    // This ensures no future regression can route Google users into SIWE
    if (walletType === 'inApp' || walletType === 'inAppWallet') {
      return res.status(400).json({
        message: 'SIWE not allowed for in-app wallets',
      });
    }

    const payload = await auth.generatePayload({ address });
    const message = [
      `${(payload as any).domain} wants you to sign in with your Ethereum account:`,
      (payload as any).address,
      ``,
      (payload as any).statement,
      ``,
      `URI: ${(payload as any).uri}`,
      `Version: ${(payload as any).version}`,
      (payload as any).chain_id
        ? `Chain ID: ${(payload as any).chain_id}`
        : (payload as any).chainId
        ? `Chain ID: ${(payload as any).chainId}`
        : null,
      `Nonce: ${(payload as any).nonce}`,
      `Issued At: ${(payload as any).issued_at || (payload as any).issuedAt}`,
      (payload as any).expiration_time
        ? `Expiration Time: ${(payload as any).expiration_time}`
        : (payload as any).expirationTime
        ? `Expiration Time: ${(payload as any).expirationTime}`
        : null,
    ]
      .filter(Boolean)
      .join('\n');

    console.log('[AUTH] SIWE message built:\n', message);

    return res.json({
      payload,
      message,
    });
  } catch (error: any) {
    console.error('[AUTH] SIWE payload error:', error);
    return res.status(500).json({ message: error.message || 'Failed to generate payload' });
  }
});

// Verify SIWE signature and issue backend JWT
router.post('/siwe/verify', async (req, res) => {
  try {
    const { payload, signature } = req.body;

    if (!payload || !signature) {
      return res.status(400).json({ message: 'Payload and signature required' });
    }

    // Verify SIWE payload
    // CRITICAL: SIWE uses secretKey-based client (adminClient)
    // Flow B (EOA) → adminAuth.verifyPayload with adminClient
    const result = await (auth.verifyPayload as any)({
      payload,
      signature,
      client: adminClient, // REQUIRED in v5 - use adminClient (secretKey) for SIWE
      chain: polygon, // REQUIRED in v5 - must match frontend activeChain
    });

    const { valid, payload: verifiedPayload } = result as {
      valid: boolean;
      payload: any;
    };

    if (!valid) {
      return res.status(401).json({ message: 'Invalid signature' });
    }

    const address = verifiedPayload.address?.toLowerCase();

    if (!address) {
      return res.status(400).json({ message: 'Address not found in verified payload' });
    }

    // Find user by any linked wallet
    let user = await User.findOne({
      'wallets.address': address,
    });

    // Determine provider from context (default to metamask, could be enhanced)
    const provider = 'metamask'; // Could be passed from frontend or detected

    if (!user) {
      // Create new user with EOA wallet
      user = await User.create({
        name: 'User', // Default name, can be updated later
        primaryWallet: address,
        wallets: [
          {
            address: address,
            type: 'EOA',
            provider: provider as 'metamask' | 'walletconnect',
            isPrimary: true,
            createdAt: new Date(),
          },
        ],
      });
    } else {
      // User exists - ensure this wallet is linked
      const walletExists = user.wallets.some((w) => w.address.toLowerCase() === address);

      if (!walletExists) {
        // Link this wallet to existing user
        user.wallets.push({
          address: address,
          type: 'EOA',
          provider: provider as 'metamask' | 'walletconnect',
          isPrimary: false,
          createdAt: new Date(),
        });
        await user.save();
      }
    }

    // Issue backend JWT
    const jwt = createBackendJWT(user);
    setAuthCookie(res, jwt);

    return res.json({ success: true, user: { id: user._id, email: user.email } });
  } catch (error: any) {
    console.error('[AUTH] SIWE verify error:', error);
    return res.status(500).json({ message: error.message || 'Verification failed' });
  }
});

// ============================================================================
// WALLET BINDING: Link additional wallets to existing user
// ============================================================================
// Bind wallet endpoint - requires authentication middleware
router.post('/bind-wallet', authMiddleware, async (req: ThirdwebAuthRequest, res) => {
  try {
    // Get user from request (set by authMiddleware)
    const user = (req as any).user;
    if (!user) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    // Load full user document
    const userDoc = await User.findById(user.id);

    if (!userDoc) {
      return res.status(401).json({ message: 'User not found' });
    }

    const { authToken: newAuthToken, signature, payload: siwePayload, walletType } = req.body;

    let newAddress: string;
    let walletTypeValue: 'EOA' | 'IN_APP';
    let provider: 'metamask' | 'walletconnect' | 'google' | 'email';

    // Determine wallet type and verify accordingly
    if (newAuthToken) {
      // In-App Wallet binding
      // CRITICAL: In-App Wallet JWTs are RS256 (server-signed), need JWKS verification
      try {
        const parsedJWT = await verifyInAppWalletJWT(newAuthToken);
        
        if (!parsedJWT.sub) {
          return res.status(401).json({ message: 'Invalid auth token: missing address' });
        }

        newAddress = parsedJWT.sub.toLowerCase();
      } catch (verifyError: any) {
        console.error('[AUTH] ❌ JWKS verification failed for bind-wallet:', verifyError.message);
        return res.status(401).json({ message: 'Invalid auth token' });
      }
      walletTypeValue = 'IN_APP';
      provider = 'google'; // Could be enhanced to detect provider
    } else if (signature && siwePayload) {
      // EOA wallet binding via SIWE
      // CRITICAL: SIWE uses secretKey-based client (adminClient)
      const result = await (auth.verifyPayload as any)({
        payload: siwePayload,
        signature,
        client: adminClient, // REQUIRED in v5 - use adminClient (secretKey) for SIWE
        chain: polygon, // REQUIRED in v5 - must match frontend activeChain
      });

      if (!result.valid) {
        return res.status(401).json({ message: 'Invalid signature' });
      }

      newAddress = result.payload.address?.toLowerCase();
      walletTypeValue = 'EOA';
      provider = walletType === 'walletconnect' ? 'walletconnect' : 'metamask';
    } else {
      return res.status(400).json({
        message: 'Either authToken (for In-App) or signature+payload (for EOA) required',
      });
    }

    if (!newAddress) {
      return res.status(400).json({ message: 'Address not found' });
    }

    // Check if wallet is already linked to this user
    if (userDoc.wallets.some((w) => w.address.toLowerCase() === newAddress)) {
      return res.status(409).json({ message: 'Wallet already linked to this account' });
    }

    // Check if wallet is linked to another user
    const existingUser = await User.findOne({
      'wallets.address': newAddress,
      _id: { $ne: userDoc._id },
    });

    if (existingUser) {
      return res.status(409).json({ message: 'Wallet is already linked to another account' });
    }

    // Link the wallet
    userDoc.wallets.push({
      address: newAddress,
      type: walletTypeValue,
      provider: provider,
      isPrimary: false, // Never make bound wallet primary
      createdAt: new Date(),
    });

    await userDoc.save();

    return res.json({
      success: true,
      message: 'Wallet linked successfully',
      wallet: {
        address: newAddress,
        type: walletTypeValue,
        provider: provider,
      },
    });
  } catch (error: any) {
    console.error('[AUTH] Bind wallet error:', error);
    return res.status(500).json({ message: error.message || 'Failed to bind wallet' });
  }
});

// ============================================================================
// LEGACY ENDPOINTS (for backward compatibility)
// ============================================================================
// Keep old endpoints but use same handlers as new SIWE endpoints
router.post('/login/payload', async (req, res) => {
  // Use same handler as /siwe/payload
  const { address } = req.body;

  if (!address) {
    return res.status(400).json({ message: 'Address required' });
  }

  try {
    const payload = await auth.generatePayload({ address });
    const message = [
      `${(payload as any).domain} wants you to sign in with your Ethereum account:`,
      (payload as any).address,
      ``,
      (payload as any).statement,
      ``,
      `URI: ${(payload as any).uri}`,
      `Version: ${(payload as any).version}`,
      (payload as any).chain_id
        ? `Chain ID: ${(payload as any).chain_id}`
        : (payload as any).chainId
        ? `Chain ID: ${(payload as any).chainId}`
        : null,
      `Nonce: ${(payload as any).nonce}`,
      `Issued At: ${(payload as any).issued_at || (payload as any).issuedAt}`,
      (payload as any).expiration_time
        ? `Expiration Time: ${(payload as any).expiration_time}`
        : (payload as any).expirationTime
        ? `Expiration Time: ${(payload as any).expirationTime}`
        : null,
    ]
      .filter(Boolean)
      .join('\n');

    return res.json({ payload, message });
  } catch (error: any) {
    console.error('[AUTH] SIWE payload error:', error);
    return res.status(500).json({ message: error.message || 'Failed to generate payload' });
  }
});

router.post('/login/verify', async (req, res) => {
  // Use same handler as /siwe/verify
  const { payload, signature } = req.body;

  if (!payload || !signature) {
    return res.status(400).json({ message: 'Payload and signature required' });
  }

  try {
    // CRITICAL: In thirdweb v5, ALL SIWE verification requires client + chain
    const result = await (auth.verifyPayload as any)({
      payload,
      signature,
      client: adminClient, // REQUIRED in v5 - use adminClient (secretKey) for SIWE
      chain: polygon, // REQUIRED in v5 - must match frontend activeChain
    });

    const { valid, payload: verifiedPayload } = result as {
      valid: boolean;
      payload: any;
    };

    if (!valid) {
      return res.status(401).json({ message: 'Invalid signature' });
    }

    const address = verifiedPayload.address?.toLowerCase();

    if (!address) {
      return res.status(400).json({ message: 'Address not found in verified payload' });
    }

    let user = await User.findOne({
      'wallets.address': address,
    });

    const provider = 'metamask';

    if (!user) {
      user = await User.create({
        name: 'User',
        primaryWallet: address,
        wallets: [
          {
            address: address,
            type: 'EOA',
            provider: provider as 'metamask' | 'walletconnect',
            isPrimary: true,
            createdAt: new Date(),
          },
        ],
      });
    } else {
      const walletExists = user.wallets.some((w) => w.address.toLowerCase() === address);

      if (!walletExists) {
        user.wallets.push({
          address: address,
          type: 'EOA',
          provider: provider as 'metamask' | 'walletconnect',
          isPrimary: false,
          createdAt: new Date(),
        });
        await user.save();
      }
    }

    const jwt = createBackendJWT(user);
    setAuthCookie(res, jwt);

    return res.json({ success: true, user: { id: user._id, email: user.email } });
  } catch (error: any) {
    console.error('[AUTH] SIWE verify error:', error);
    return res.status(500).json({ message: error.message || 'Verification failed' });
  }
});

export default router;
