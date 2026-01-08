import axios, { AxiosError } from 'axios';

/**
 * TronGrid API Response Types
 */
interface TronGridTokenTransfer {
  transaction_id: string;
  token_info: {
    symbol: string;
    address: string;
  };
  from: string;
  to: string;
  type: string;
  value: string;
  block_timestamp: number;
  block: number;
}

/**
 * Payment Verification Service
 * Handles USDT TRC20 payment verification via TronGrid v1 API
 */
export class PaymentVerificationService {
  private static readonly TRONGRID_BASE_URL = 'https://api.trongrid.io/v1';
  
  /**
   * Get required confirmations from environment (default: 19)
   */
  private static getRequiredConfirmations(): number {
    const confirmations = process.env.TRON_CONFIRMATIONS_REQUIRED;
    if (confirmations) {
      const parsed = parseInt(confirmations, 10);
      if (isNaN(parsed) || parsed < 1) {
        throw new Error('TRON_CONFIRMATIONS_REQUIRED must be a positive integer');
      }
      return parsed;
    }
    return 19; // Default
  }

  /**
   * Get TronGrid API timeout from environment (default: 5000ms)
   */
  private static getTimeout(): number {
    const timeout = process.env.TRONGRID_TIMEOUT_MS;
    if (timeout) {
      const parsed = parseInt(timeout, 10);
      if (isNaN(parsed) || parsed < 1000) {
        throw new Error('TRONGRID_TIMEOUT_MS must be at least 1000ms');
      }
      return parsed;
    }
    return 5000; // Default 5 seconds
  }

  /**
   * Get TronGrid API key from environment
   */
  private static getApiKey(): string {
    const apiKey = process.env.TRONGRID_API_KEY;
    if (!apiKey) {
      throw new Error('TRONGRID_API_KEY not configured in environment variables');
    }
    return apiKey;
  }

  /**
   * Get USDT TRC20 contract address from environment
   * Official TRON USDT (TRC20) contract: TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t
   */
  private static getUSDTContractAddress(): string {
    // Official TRON USDT TRC20 contract address (mainnet)
    const OFFICIAL_USDT_CONTRACT = 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t';
    
    const contractAddress = process.env.USDT_TRC20_CONTRACT;
    if (contractAddress) {
      const trimmed = contractAddress.trim();
      // Validate that it's the correct contract
      if (trimmed.toLowerCase() === OFFICIAL_USDT_CONTRACT.toLowerCase()) {
        return trimmed;
      }
      // If env var is set but wrong, log warning and use correct one
      console.warn(`[USDT Contract] Environment variable USDT_TRC20_CONTRACT is set to ${trimmed}, but should be ${OFFICIAL_USDT_CONTRACT}. Using correct contract.`);
    }
    
    // Always use the official contract address
    return OFFICIAL_USDT_CONTRACT;
  }

  /**
   * Get token transfer information for USDT TRC20 transaction
   * Uses account's TRC20 transactions filtered by transaction_id
   * @param txHash - Transaction hash
   * @param ledgerAddress - Ledger address to query transactions for
   * @returns Token transfer details
   * @throws Error if transfer not found or invalid
   */
  private static async fetchTokenTransfer(
    txHash: string,
    ledgerAddress: string
  ): Promise<TronGridTokenTransfer> {
    const apiKey = this.getApiKey();
    const timeout = this.getTimeout();
    // Query account's TRC20 transactions and filter by transaction_id
    // TronGrid returns transactions in reverse chronological order
    const url = `${this.TRONGRID_BASE_URL}/accounts/${ledgerAddress}/transactions/trc20`;

    try {
      const response = await axios.get<{
        data: TronGridTokenTransfer[];
        success: boolean;
      }>(url, {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        params: {
          limit: 200, // Get recent transactions
          only_confirmed: true,
        },
        timeout: timeout,
      });

      if (!response.data?.data || response.data.data.length === 0) {
        throw new Error('No TRC20 token transfers found for account');
      }

      // Find the transaction matching our txHash
      const matchingTransfer = response.data.data.find(
        (transfer) => transfer.transaction_id === txHash && transfer.token_info?.symbol === 'USDT'
      );

      if (!matchingTransfer) {
        throw new Error('USDT transfer not found in transaction');
      }

      return matchingTransfer;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const axiosError = error as AxiosError;
        if (axiosError.response?.status === 404) {
          throw new Error('Account or token transfer not found on blockchain');
        }
        if (axiosError.code === 'ECONNABORTED' || axiosError.code === 'ETIMEDOUT') {
          throw new Error('TronGrid API request timeout. Verification pending.');
        }
        if (axiosError.code === 'ECONNREFUSED' || axiosError.code === 'ENOTFOUND') {
          throw new Error('TronGrid API unavailable. Verification pending.');
        }
        throw new Error(`TronGrid API error: ${axiosError.message}`);
      }
      throw new Error(`Failed to fetch token transfer: ${error}`);
    }
  }

  /**
   * Get current block number to calculate confirmations
   * @returns Current block number
   */
  private static async getCurrentBlockNumber(): Promise<number> {
    const apiKey = this.getApiKey();
    const timeout = this.getTimeout();
    // Try the blocks/latest endpoint first
    const url = `${this.TRONGRID_BASE_URL}/blocks/latest`;

    try {
      const response = await axios.get<{ 
        block_header?: { raw_data?: { number?: number } };
        number?: number;
      }>(url, {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        timeout: timeout,
      });

      // Handle different possible response structures
      const blockNumber = response.data.block_header?.raw_data?.number || 
                          response.data.number;

      if (blockNumber === undefined) {
        throw new Error('Block number not found in response');
      }

      return blockNumber;
    } catch (error) {
      // If we can't get current block, we can't calculate confirmations accurately
      throw new Error('Failed to fetch current block number');
    }
  }

  /**
   * Find matching USDT TRC20 payment transaction by amount
   * Checks recent transactions to the ledger address and finds one matching the expected amount
   * @param expectedAmountUSDT - Expected amount in USDT (as string, e.g., "10.500000")
   * @param ledgerAddress - Expected recipient address (ledger address)
   * @param orderId - Optional order ID to check if transaction was already used
   * @param orderCreatedAt - Order creation timestamp (used for time window)
   * @returns Matching transfer object or null if not found
   * @throws Error if API call fails
   */
  static async findMatchingTransaction(
    expectedAmountUSDT: string,
    ledgerAddress: string,
    _orderId?: string,
    orderCreatedAt?: Date
  ): Promise<TronGridTokenTransfer | null> {
    const apiKey = this.getApiKey();
    const timeout = this.getTimeout();
    // Use TRC20 endpoint - USDT transfers only appear here
    const url = `${this.TRONGRID_BASE_URL}/accounts/${ledgerAddress}/transactions/trc20`;
    const usdtContractAddress = this.getUSDTContractAddress();
    const expectedAmountSun = Math.floor(parseFloat(expectedAmountUSDT) * 1_000_000);
    
    // Use order.createdAt to now as time window (not hardcoded 60 minutes)
    const cutoffTime = orderCreatedAt 
      ? orderCreatedAt.getTime() 
      : Date.now() - (60 * 60 * 1000); // Fallback to 60 minutes if no createdAt
    
    console.log(`[TronGrid] Querying: ${url}`);
    console.log(`[TronGrid] USDT Contract: ${usdtContractAddress}`);
    console.log(`[TronGrid] Expected Amount: ${expectedAmountUSDT} USDT (${expectedAmountSun} sun)`);
    console.log(`[TronGrid] Time window: ${new Date(cutoffTime).toISOString()} to now`);

    try {
      const response = await axios.get<{
        data: TronGridTokenTransfer[];
        success: boolean;
      }>(url, {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        params: {
          limit: 200, // Get recent transactions
          only_confirmed: true,
        },
        timeout: timeout,
      });

      if (!response.data?.data || response.data.data.length === 0) {
        console.log(`[TronGrid] No transactions found for address ${ledgerAddress}`);
        return null;
      }

      console.log(`[TronGrid] Found ${response.data.data.length} TRC20 transactions`);

      // Collect all matching transactions (may be multiple)
      const matchingTransactions: Array<{
        txId: string;
        amount: number;
        timestamp: number;
      }> = [];

      // Find matching transactions
      // Match by: USDT token, correct contract, correct recipient, correct amount, within time window
      // DO NOT filter by confirmations here - detect first, check confirmations later
      for (const transfer of response.data.data) {
        // 1. Check if it's USDT
        if (transfer.token_info?.symbol !== 'USDT') {
          continue;
        }

        // 2. Check contract address (CRITICAL - must match official USDT contract)
        const normalizedContractAddress = transfer.token_info?.address?.toLowerCase();
        const normalizedExpectedContract = usdtContractAddress.toLowerCase();
        if (normalizedContractAddress !== normalizedExpectedContract) {
          console.log(`[TronGrid] Tx ${transfer.transaction_id} skipped: wrong contract ${transfer.token_info?.address} (expected ${usdtContractAddress})`);
          continue;
        }

        // 3. Check recipient address - use 'to' field (not owner_address)
        const normalizedTo = transfer.to?.toLowerCase();
        const normalizedLedger = ledgerAddress.toLowerCase();
        if (!normalizedTo || normalizedTo !== normalizedLedger) {
          continue;
        }
        
        // 4. Check time window (block_timestamp is in milliseconds)
        if (transfer.block_timestamp && transfer.block_timestamp < cutoffTime) {
          console.log(`[TronGrid] Tx ${transfer.transaction_id} too old: ${new Date(transfer.block_timestamp).toISOString()} < ${new Date(cutoffTime).toISOString()}`);
          continue; // Too old
        }

        // 5. Check amount - accept exact match or overpayment, reject underpayment
        const actualValue = parseInt(transfer.value, 10);
        if (actualValue < expectedAmountSun) {
          console.log(`[TronGrid] Tx ${transfer.transaction_id} skipped: underpayment ${actualValue} < ${expectedAmountSun}`);
          continue; // Reject underpayment
        }
        // Accept: actualValue >= expectedAmountSun (exact match or overpayment)

        console.log(`[TronGrid] ✅ MATCH: ${transfer.transaction_id}, amount=${transfer.value} sun (${(actualValue / 1_000_000).toFixed(6)} USDT), timestamp=${new Date(transfer.block_timestamp).toISOString()}`);
        
        // Store matching transaction
        matchingTransactions.push({
          txId: transfer.transaction_id,
          amount: actualValue,
          timestamp: transfer.block_timestamp || 0,
        });
      }

      if (matchingTransactions.length === 0) {
        console.log(`[TronGrid] No matching transactions found`);
        return null;
      }

      // 6. Pick the EARLIEST matching transaction after order.createdAt
      // This ensures we match the first payment for this order
      matchingTransactions.sort((a, b) => a.timestamp - b.timestamp);
      const earliestMatch = matchingTransactions[0];
      
      // Find and return the full transfer object (we need all the data)
      const matchedTransfer = response.data.data.find(
        (t: TronGridTokenTransfer) => t.transaction_id === earliestMatch.txId
      );
      
      if (!matchedTransfer) {
        console.log(`[TronGrid] ⚠️ Could not find full transfer object for ${earliestMatch.txId}`);
        return null;
      }
      
      console.log(`[TronGrid] ✅ SELECTED EARLIEST MATCH: ${earliestMatch.txId} (${matchingTransactions.length} total matches)`);
      return matchedTransfer;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const axiosError = error as AxiosError;
        if (axiosError.response?.status === 404) {
          return null; // No transactions found
        }
        if (axiosError.code === 'ECONNABORTED' || axiosError.code === 'ETIMEDOUT') {
          throw new Error('TronGrid API request timeout. Please try again.');
        }
        if (axiosError.code === 'ECONNREFUSED' || axiosError.code === 'ENOTFOUND') {
          throw new Error('TronGrid API unavailable. Please try again.');
        }
        throw new Error(`TronGrid API error: ${axiosError.message}`);
      }
      throw new Error(`Failed to find matching transaction: ${error}`);
    }
  }

  /**
   * Verify USDT TRC20 payment using transfer object directly (no re-fetch)
   * This is the correct way for TRC20 transfers - they are contract events, not standalone transactions
   * @param tokenTransfer - TRC20 transfer object from TronGrid
   * @param expectedAmountUSDT - Expected amount in USDT (as string, e.g., "10.500000")
   * @param ledgerAddress - Expected recipient address (ledger address)
   * @param userWalletAddress - Optional user wallet address for additional validation
   * @returns Verification result with confirmations
   * @throws Error if verification fails
   */
  static async verifyTRC20Payment(
    tokenTransfer: TronGridTokenTransfer,
    expectedAmountUSDT: string,
    ledgerAddress: string,
    userWalletAddress?: string
  ): Promise<{
    success: boolean;
    confirmations: number;
    blockTimestamp: number;
    message?: string;
    overpaidAmountUSDT?: string;
  }> {
    // DO NOT re-fetch - use the transfer object directly
    // TRC20 transfers are contract events, not standalone transactions

    // 1. Validate USDT contract address (bulletproof - symbols can be spoofed)
    const usdtContractAddress = this.getUSDTContractAddress();
    const normalizedContractAddress = tokenTransfer.token_info?.address?.toLowerCase();
    const normalizedExpectedContract = usdtContractAddress.toLowerCase();
    
    if (normalizedContractAddress !== normalizedExpectedContract) {
      throw new Error(
        `Invalid USDT contract address: expected ${usdtContractAddress}, got ${tokenTransfer.token_info?.address}`
      );
    }

    // 2. Validate token symbol === "USDT" (secondary check)
    if (tokenTransfer.token_info?.symbol !== 'USDT') {
      throw new Error(`Invalid token symbol: expected USDT, got ${tokenTransfer.token_info?.symbol}`);
    }

    // 3. Validate recipient address (to === ledger address)
    const normalizedTo = tokenTransfer.to.toLowerCase();
    const normalizedLedger = ledgerAddress.toLowerCase();
    if (normalizedTo !== normalizedLedger) {
      throw new Error(
        `Invalid recipient address: expected ${ledgerAddress}, got ${tokenTransfer.to}`
      );
    }

    // 4. Validate amount (value in sun units, USDT has 6 decimals)
    // expectedAmountUSDT is a string like "10.500000"
    // value from TronGrid is in smallest unit (1 USDT = 1,000,000 sun)
    const expectedAmountSun = Math.floor(parseFloat(expectedAmountUSDT) * 1_000_000);
    const actualValue = parseInt(tokenTransfer.value, 10);

    // Accept exact match or overpayment, reject underpayment
    if (actualValue < expectedAmountSun) {
      throw new Error(
        `Insufficient payment: expected at least ${expectedAmountSun} sun (${expectedAmountUSDT} USDT), got ${actualValue} sun`
      );
    }

    // Calculate overpaid amount if applicable
    const overpaidAmountSun = actualValue - expectedAmountSun;
    const overpaidAmountUSDT = overpaidAmountSun > 0 
      ? (overpaidAmountSun / 1_000_000).toFixed(6)
      : undefined;

    // 5. Validate block_timestamp exists
    if (!tokenTransfer.block_timestamp) {
      throw new Error('Block timestamp not found');
    }

    // 6. Calculate confirmations using block_timestamp (no re-fetch needed)
    // TRON block time ≈ 3 seconds, so we can estimate confirmations from time difference
    const now = Date.now();
    const txAgeMs = now - tokenTransfer.block_timestamp;
    const blockTimeMs = 3000; // 3 seconds per block
    const estimatedConfirmations = Math.floor(txAgeMs / blockTimeMs);
    
    // Also try to get actual block number for more accurate count
    let confirmations = estimatedConfirmations;
    try {
      const currentBlock = await this.getCurrentBlockNumber();
      confirmations = currentBlock - tokenTransfer.block + 1;
    } catch (error) {
      // If we can't get current block, use estimated confirmations
      console.warn(`[TronGrid] Could not get current block, using estimated confirmations: ${estimatedConfirmations}`);
    }

    // 7. Check confirmations >= required (configurable)
    const requiredConfirmations = this.getRequiredConfirmations();
    if (confirmations < requiredConfirmations) {
      return {
        success: false,
        confirmations,
        blockTimestamp: tokenTransfer.block_timestamp,
        message: `Awaiting confirmations: ${confirmations}/${requiredConfirmations}`,
      };
    }

    // 8. Optional: Validate sender address if provided
    if (userWalletAddress) {
      const normalizedFrom = tokenTransfer.from.toLowerCase();
      const normalizedUser = userWalletAddress.toLowerCase();
      if (normalizedFrom !== normalizedUser) {
        throw new Error(
          `Sender address mismatch: expected ${userWalletAddress}, got ${tokenTransfer.from}`
        );
      }
    }

    return {
      success: true,
      confirmations,
      blockTimestamp: tokenTransfer.block_timestamp,
      overpaidAmountUSDT: overpaidAmountUSDT,
    };
  }

  /**
   * Verify USDT TRC20 payment transaction (legacy method - kept for backward compatibility)
   * @deprecated Use verifyTRC20Payment instead - TRC20 transfers should not be re-fetched
   */
  static async verifyPayment(
    txHash: string,
    expectedAmountUSDT: string,
    ledgerAddress: string,
    userWalletAddress?: string
  ): Promise<{
    success: boolean;
    confirmations: number;
    blockTimestamp: number;
    message?: string;
    overpaidAmountUSDT?: string;
  }> {
    // For TRC20, we should use verifyTRC20Payment with the transfer object
    // This method is kept for backward compatibility but will try to fetch token transfer
    const tokenTransfer = await this.fetchTokenTransfer(txHash, ledgerAddress);
    return this.verifyTRC20Payment(tokenTransfer, expectedAmountUSDT, ledgerAddress, userWalletAddress);
  }

  /**
   * Verify and finalize order - ONE atomic function that owns the entire flow
   * This is the single source of truth for payment verification and order finalization
   * @param orderId - Order ID to verify and finalize
   * @returns Verification result
   * @throws Error if verification fails or order cannot be finalized
   */
  static async verifyAndFinalizeOrder(
    orderId: string
  ): Promise<{
    success: boolean;
    status: string;
    message: string;
    confirmations?: number;
  }> {
    // Import models here to avoid circular dependencies
    const Order = (await import('../models/Order.model')).default;
    const PaymentTransaction = (await import('../models/PaymentTransaction.model')).default;
    const LandSlot = (await import('../models/LandSlot.model')).default;
    const UserLand = (await import('../models/UserLand.model')).default;
    const ReferralEarning = (await import('../models/ReferralEarning.model')).default;
    const User = (await import('../models/User.model')).default;
    const Area = (await import('../models/Area.model')).default;
    const Deed = (await import('../models/Deed.model')).default;
    const { UserService } = await import('./user.service');
    const mongoose = await import('mongoose');

    // 1️⃣ GUARD RAILS - Load order and check status
    const order = await Order.findById(orderId);
    if (!order) {
      throw new Error('Order not found');
    }

    // If already PAID, return success
    if (order.status === 'PAID') {
      return {
        success: true,
        status: 'PAID',
        message: 'Order already verified and paid',
      };
    }

    // If already EXPIRED, return expired
    if (order.status === 'EXPIRED') {
      return {
        success: false,
        status: 'EXPIRED',
        message: 'Order has expired',
      };
    }

    // Lazy expiry check - expire order if it has passed expiresAt
    const now = new Date();
    const expiresAt = order.expiry?.expiresAt || order.expiresAt;
    if (order.status === 'PENDING' && expiresAt && now > expiresAt) {
      // Expire order and unlock slots
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

      return {
        success: false,
        status: 'EXPIRED',
        message: 'Order expired. Payment window has closed. Slots have been released.',
      };
    }

    // Must be PENDING to proceed
    if (order.status !== 'PENDING') {
      throw new Error(`Cannot verify order with status: ${order.status}`);
    }

    // 2️⃣ DETECT TRC20 TRANSFER - Use /transactions/trc20, NO tx re-fetch by hash
    // Use event data only
    const expectedAmountUSDT = order.payment?.expectedAmountUSDT || order.expectedAmountUSDT;
    const ledgerAddress = order.usdtAddress;

    if (!expectedAmountUSDT || !ledgerAddress) {
      throw new Error('Order missing expectedAmountUSDT or usdtAddress');
    }

    let matchingTransfer: TronGridTokenTransfer | null;
    try {
      matchingTransfer = await this.findMatchingTransaction(
        expectedAmountUSDT,
        ledgerAddress,
        orderId,
        order.createdAt
      );
    } catch (error: any) {
      // If TronGrid is down or timeout, return pending status
      if (error.message?.includes('timeout') || error.message?.includes('unavailable')) {
        return {
          success: false,
          status: 'AWAITING_CONFIRMATIONS',
          message: 'Payment verification service is temporarily unavailable. Please try again in a few minutes.',
        };
      }
      throw error;
    }

    if (!matchingTransfer) {
      // Payment not detected yet
      return {
        success: false,
        status: 'AWAITING_CONFIRMATIONS',
        message: 'Payment not detected yet. Please wait a few minutes and try again.',
      };
    }

    const matchingTxHash = matchingTransfer.transaction_id;

    // Check if this txHash is already used in another PAID order (double-spend protection)
    const existingPaidOrder = await Order.findOne({
      $or: [
        { 'payment.txHash': matchingTxHash.trim() },
        { txHash: matchingTxHash.trim() }, // Legacy field
      ],
      status: 'PAID',
      _id: { $ne: orderId },
    });

    if (existingPaidOrder) {
      // Mark current order as FAILED due to double-spend attempt
      order.status = 'FAILED';
      await order.save();
      throw new Error('Transaction hash has already been used in another paid order (double-spend detected)');
    }

    // 3️⃣ CONFIRMATION CHECK - Verify payment using transfer object
    const verificationResult = await this.verifyTRC20Payment(
      matchingTransfer,
      expectedAmountUSDT,
      ledgerAddress,
      undefined // userWalletAddress - optional
    );

    // If confirmations < threshold, return AWAITING_CONFIRMATIONS
    if (!verificationResult.success) {
      // Update confirmations count but keep status as PENDING
      if (order.payment) {
        order.payment.confirmations = verificationResult.confirmations;
      } else {
        order.confirmations = verificationResult.confirmations;
      }
      await order.save();

      return {
        success: false,
        status: 'AWAITING_CONFIRMATIONS',
        message: verificationResult.message || `Awaiting confirmations: ${verificationResult.confirmations}/${this.getRequiredConfirmations()}`,
        confirmations: verificationResult.confirmations,
      };
    }

    // 4️⃣ FINALIZE (TRANSACTIONAL) - All steps in MongoDB transaction
    const session = await mongoose.default.startSession();
    session.startTransaction();

    try {
      // Calculate paid amount and overpayment
      const paidAmountSun = parseInt(matchingTransfer.value, 10);
      const paidAmountUSDT = (paidAmountSun / 1_000_000).toFixed(6);
      const expectedAmountSun = Math.floor(parseFloat(expectedAmountUSDT) * 1_000_000);
      const overpaidAmountSun = paidAmountSun - expectedAmountSun;
      const overpaidAmountUSDT = overpaidAmountSun > 0 
        ? (overpaidAmountSun / 1_000_000).toFixed(6)
        : null;

      // 4a. Create PaymentTransaction (with userId for direct access)
      const paymentTx = new PaymentTransaction({
        txHash: matchingTxHash.trim(),
        orderId: order._id,
        userId: order.userId, // Direct user reference (no join needed)
        fromAddress: matchingTransfer.from,
        toAddress: ledgerAddress,
        tokenContract: matchingTransfer.token_info.address,
        amountUSDT: paidAmountUSDT,
        blockTimestamp: new Date(verificationResult.blockTimestamp),
        confirmations: verificationResult.confirmations,
        raw: matchingTransfer, // Full TronGrid payload for audits
      });
      await paymentTx.save({ session });

      // 4b. Verify slots are still locked by same user (BULLETPROOF LOCKING)
      const landSlots = await LandSlot.find(
        { landSlotId: { $in: order.landSlotIds } },
        null,
        { session }
      );

      for (const slot of landSlots) {
        // If slot is not locked by this user, abort
        if (slot.status !== 'LOCKED' || slot.lockedBy?.toString() !== order.userId.toString()) {
          throw new Error(`Land slot ${slot.landSlotId} is not locked by order user. Verification aborted.`);
        }
        // If lock has expired, abort
        if (slot.lockExpiresAt && slot.lockExpiresAt < now) {
          throw new Error(`Land slot ${slot.landSlotId} lock has expired. Verification aborted.`);
        }
      }

      // 4c. Update Order (PAID, paidAt, amounts)
      const paidAt = new Date();
      if (order.payment) {
        order.payment.paidAmountUSDT = paidAmountUSDT;
        order.payment.txHash = matchingTxHash.trim();
        order.payment.confirmations = verificationResult.confirmations;
        order.payment.paidAt = paidAt;
        if (overpaidAmountUSDT) {
          order.payment.overpaidAmountUSDT = overpaidAmountUSDT;
        }
      } else {
        // Legacy fields
        order.txHash = matchingTxHash.trim();
        order.confirmations = verificationResult.confirmations;
        order.paidAt = paidAt;
        if (overpaidAmountUSDT) {
          order.overpaidAmountUSDT = overpaidAmountUSDT;
        }
      }
      order.status = 'PAID';
      await order.save({ session });

      // 4d. Mark LandSlot → SOLD
      await LandSlot.updateMany(
        { landSlotId: { $in: order.landSlotIds } },
        {
          $set: {
            status: 'SOLD',
            ownerId: order.userId,
            ownedAt: paidAt,
            lockedBy: null,
            lockExpiresAt: null,
          },
        },
        { session }
      );

      // 4d.1. Update Area soldSlots counter
      const normalizedAreaKey = order.place.toLowerCase().trim();
      await Area.updateOne(
        { areaKey: normalizedAreaKey },
        { $inc: { soldSlots: order.quantity } },
        { session }
      );

      // 4e. Create UserLand records (with new schema fields)
      const pricePerSlot = parseFloat(paidAmountUSDT) / order.quantity;
      const userLandRecords = order.landSlotIds.map((landSlotId) => ({
        userId: order.userId,
        landSlotId: landSlotId,
        state: order.state, // New field
        place: order.place, // New field
        orderId: order._id,
        paymentTxHash: matchingTxHash.trim(), // New field
        acquiredAt: paidAt, // New field name
        // Legacy fields for backward compatibility
        stateKey: order.state,
        areaKey: order.place,
        purchasedAt: paidAt,
        purchasePriceUSDT: pricePerSlot.toFixed(6),
      }));
      await UserLand.insertMany(userLandRecords, { session });

      // 4f. Create ReferralEarning (if applicable) and promote to AGENT
      // Get user to check referredBy
      const user = await User.findById(order.userId, null, { session });
      if (user && user.referredBy) {
        // Hard rule: Cannot refer yourself (double-check)
        if (user.referredBy.toString() === order.userId.toString()) {
          throw new Error('Invalid referral: user cannot refer themselves');
        }

        // Check if ReferralEarning already exists for this order (prevent duplicates)
        const existingEarning = await ReferralEarning.findOne(
          { orderId: order._id },
          null,
          { session }
        );

        if (!existingEarning) {
          // Calculate commission based on paidAmountUSDT (not expected)
          const commissionRate = order.referral?.commissionRate || 0.25; // Default 25%
          const commissionAmount = (parseFloat(paidAmountUSDT) * commissionRate).toFixed(6);

          // Create ReferralEarning (exactly once per order)
          const referralEarning = new ReferralEarning({
            referrerId: user.referredBy,
            referredUserId: order.userId,
            orderId: order._id,
            landSlotIds: order.landSlotIds, // All land slots in this order
            purchaseAmountUSDT: paidAmountUSDT, // Actual paid amount (not expected)
            commissionRate: commissionRate,
            commissionAmountUSDT: commissionAmount,
            txHash: matchingTxHash.trim(),
            status: 'EARNED',
          });
          await referralEarning.save({ session });

          // Update Order.referral if not set (immutable snapshot)
          if (!order.referral) {
            order.referral = {
              referrerId: user.referredBy,
              commissionRate: commissionRate,
              commissionRateAtPurchase: commissionRate, // Immutable snapshot
              commissionAmountUSDT: commissionAmount,
            };
            await order.save({ session });
          }

          // Update User.referralStats.totalEarningsUSDT (cached sum)
          const referrer = await User.findById(user.referredBy, null, { session });
          if (referrer && referrer.referralStats) {
            const currentEarnings = parseFloat(referrer.referralStats.totalEarningsUSDT || '0');
            referrer.referralStats.totalEarningsUSDT = (currentEarnings + parseFloat(commissionAmount)).toFixed(6);
            await referrer.save({ session });
          }

        }
      }

      // 4f.1. AUTO-PROMOTE referrer to AGENT (if order used their referral code)
      // Check if order.referral.referrerId exists (order was placed using referral code)
      // This happens regardless of whether referral earning was created
      if (order.referral?.referrerId) {
        try {
          await UserService.promoteUserToAgent(order.referral.referrerId);
        } catch (error: any) {
          // Log but don't fail the transaction if promotion fails
          console.error(`Failed to promote user ${order.referral.referrerId} to AGENT:`, error.message);
        }
      }

      // 4g. Create Deeds (one per landSlotId) with NFT minting
      // Get land slots for deed creation
      const landSlotsForDeeds = await LandSlot.find(
        { landSlotId: { $in: order.landSlotIds } },
        null,
        { session }
      );

      // Get user for owner name and Polygon wallet address
      const userForDeed = await User.findById(order.userId, null, { session });
      const ownerName = userForDeed?.name || 'Unknown';
      
      // Get user's Polygon wallet address (EVM address from thirdweb)
      const polygonWalletAddress = userForDeed?.walletAddress;
      if (!polygonWalletAddress) {
        throw new Error('User does not have a wallet address. Cannot mint NFT.');
      }

      // Import NFT minting service
      const { NFTMintingService } = await import('./nftMinting.service');
      const nftContractAddress = process.env.NFT_CONTRACT_ADDRESS || '';

      for (const landSlot of landSlotsForDeeds) {
        // Check if deed already exists (idempotent)
        const existingDeed = await Deed.findOne(
          { landSlotId: landSlot.landSlotId },
          null,
          { session }
        );

        if (!existingDeed) {
          // Generate seal number (unique identifier for deed)
          const sealNo = `DEED-${landSlot.landSlotId.toUpperCase()}-${Date.now()}`;

          // Mint NFT on Polygon for this land slot
          let nftData: {
            tokenId: string;
            contractAddress: string;
            blockchain: string;
            standard: string;
            mintTxHash?: string;
            openSeaUrl?: string;
          } = {
            tokenId: `NFT-${landSlot.landSlotId}`, // Placeholder
            contractAddress: nftContractAddress || 'TBD',
            blockchain: 'POLYGON',
            standard: 'ERC721',
          };

          // Attempt to mint NFT
          try {
            console.log(`🎨 Minting NFT for land slot: ${landSlot.landSlotId}`);
            const mintResult = await NFTMintingService.mintNFT(polygonWalletAddress, {
              name: `WorldTile Deed - ${landSlot.landSlotId}`,
              description: `Virtual land deed for ${landSlot.areaName || landSlot.areaKey}, Plot ID: ${landSlot.landSlotId}`,
              attributes: [
                { trait_type: 'Plot ID', value: landSlot.landSlotId },
                { trait_type: 'City', value: landSlot.areaName || landSlot.areaKey },
                { trait_type: 'State', value: landSlot.stateKey || 'Unknown' },
                { trait_type: 'Owner', value: ownerName },
                { trait_type: 'Seal Number', value: sealNo },
              ],
            });

            // Update NFT data with minted information
            nftData = {
              tokenId: mintResult.tokenId,
              contractAddress: nftContractAddress,
              blockchain: 'POLYGON',
              standard: 'ERC721',
              mintTxHash: mintResult.transactionHash,
              openSeaUrl: NFTMintingService.generateOpenSeaUrl(nftContractAddress, mintResult.tokenId),
            };

            console.log(`✅ NFT minted successfully! TokenId: ${mintResult.tokenId}, OpenSea: ${nftData.openSeaUrl}`);
          } catch (mintError: any) {
            console.error(`❌ Failed to mint NFT for ${landSlot.landSlotId}:`, mintError.message);
            // Continue with placeholder NFT data - deed will be created but NFT minting failed
            // This allows the payment to complete even if NFT minting fails
            // The NFT can be minted later via a retry mechanism
          }

          // Create deed with NFT data
          const deed = new Deed({
            userId: order.userId,
            propertyId: landSlot._id,
            landSlotId: landSlot.landSlotId,
            orderId: order._id,
            paymentTxHash: matchingTxHash.trim(),
            ownerName: ownerName,
            plotId: landSlot.landSlotId, // Use landSlotId as plotId
            city: landSlot.areaName || landSlot.areaKey, // Use area name as city
            latitude: 0, // TODO: Get from LandSlot or Area model if available
            longitude: 0, // TODO: Get from LandSlot or Area model if available
            nft: nftData,
            payment: {
              transactionId: matchingTxHash.trim(),
              receiver: ledgerAddress,
            },
            issuedAt: paidAt,
            sealNo: sealNo,
          });

          await deed.save({ session });
        }
      }

      // Commit transaction
      await session.commitTransaction();
      session.endSession();

      return {
        success: true,
        status: 'PAID',
        message: 'Payment verified and order finalized successfully',
        confirmations: verificationResult.confirmations,
      };
    } catch (error: any) {
      // Abort transaction on any error
      await session.abortTransaction();
      session.endSession();

      // Re-throw error
      throw new Error(`Failed to finalize order: ${error.message}`);
    }
  }
}

