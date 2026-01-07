import { createThirdwebClient } from 'thirdweb';
import { createAuth } from 'thirdweb/auth';
import { privateKeyToAccount } from 'thirdweb/wallets';
import { polygon } from 'thirdweb/chains';

// ============================================================================
// CRITICAL: In thirdweb v5, In-App Wallet JWTs and SIWE use DIFFERENT clients
// ============================================================================
// Flow                    JWT signer        JWT verifier
// In-App Wallet           clientId          clientId
// SIWE (EOA)              secretKey         secretKey
// ============================================================================

// ✅ Client for In-App Wallet JWT verification (clientId)
// Frontend signs JWTs with: wallet.getAuthToken({ client: thirdwebClient })
// Backend must verify with: publicClient (same clientId)
if (!process.env.THIRDWEB_CLIENT_ID) {
  console.warn('[AUTH] ⚠️ THIRDWEB_CLIENT_ID is not set - In-App Wallet JWT verification will fail');
}
export const publicClient = createThirdwebClient({
  clientId: process.env.THIRDWEB_CLIENT_ID!,
});

// ✅ Client for SIWE (EOA) verification (secretKey)
// Used for SIWE payload generation and verification
export const adminClient = createThirdwebClient({
  secretKey: process.env.THIRDWEB_SECRET_KEY!,
});

// CRITICAL: Domain must EXACTLY match the frontend origin (host + port, no protocol)
// SIWE is domain-bound - this is non-negotiable
// Frontend MUST be accessed via the same domain (e.g., http://localhost:3000, NOT 127.0.0.1)
// Set THIRDWEB_AUTH_DOMAIN env var to match your frontend origin (default: localhost:3000)
const authDomain = process.env.THIRDWEB_AUTH_DOMAIN || 'localhost:3000';

// ✅ Auth instance for SIWE (EOA) - uses adminClient with secretKey
export const auth = createAuth({
  domain: authDomain,
  client: adminClient, // Use adminClient for SIWE
  chain: polygon, // ✅ REQUIRED FOR SMART ACCOUNT (In-App Wallet) VERIFICATION
  adminAccount: privateKeyToAccount({
    client: adminClient,
    privateKey: process.env.THIRDWEB_PRIVATE_KEY!,
  }),
} as any); // Type assertion needed - chain is required at runtime for Smart Account verification

// ✅ Auth instance for In-App Wallet JWT verification - uses publicClient with clientId
// This is used to verify JWTs issued by wallet.getAuthToken()
// CRITICAL: In-App Wallet JWTs are signed by thirdweb servers (RS256 with JWKS)
// The auth instance's verifyJWT method will use the client to fetch JWKS keys
export const publicAuth = createAuth({
  domain: authDomain,
  client: publicClient, // Use publicClient (clientId) for In-App Wallet JWTs
  chain: polygon,
} as any);

// Legacy export for backward compatibility
export const client = adminClient;

