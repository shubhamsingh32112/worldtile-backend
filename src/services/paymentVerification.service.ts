import axios, { AxiosError } from 'axios';

/**
 * TronGrid API Response Types
 */
interface TronGridTransactionResponse {
  ret: Array<{
    contractRet: string;
  }>;
  block_timestamp?: number;
  blockNumber?: number;
  contract_address?: string;
  receipt?: {
    result?: string;
  };
  raw_data?: {
    contract?: Array<{
      parameter?: {
        value?: {
          to_address?: string;
          amount?: number;
          owner_address?: string;
        };
      };
    }>;
  };
}

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

interface TronGridTransactionDetailResponse {
  ret: Array<{
    contractRet: string;
  }>;
  block_timestamp: number;
  blockNumber: number;
  contract_address?: string;
  receipt?: {
    result?: string;
  };
  raw_data?: {
    contract?: Array<{
      parameter?: {
        value?: {
          to_address?: string;
          amount?: number;
          owner_address?: string;
        };
      };
    }>;
  };
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
   * Get ledger USDT address from environment
   */
  private static getLedgerAddress(): string {
    const address = process.env.LEDGER_USDT_ADDRESS;
    if (!address) {
      throw new Error('LEDGER_USDT_ADDRESS not configured in environment variables');
    }
    return address;
  }

  /**
   * Get USDT TRC20 contract address from environment
   */
  private static getUSDTContractAddress(): string {
    const contractAddress = process.env.USDT_TRC20_CONTRACT;
    if (!contractAddress) {
      throw new Error('USDT_TRC20_CONTRACT not configured in environment variables');
    }
    return contractAddress.trim();
  }

  /**
   * Call TronGrid API to get transaction details
   * @param txHash - Transaction hash
   * @returns Transaction details from TronGrid
   * @throws Error if API call fails or transaction not found
   */
  private static async fetchTransactionFromTronGrid(
    txHash: string
  ): Promise<TronGridTransactionDetailResponse> {
    const apiKey = this.getApiKey();
    const timeout = this.getTimeout();
    const url = `${this.TRONGRID_BASE_URL}/transactions/${txHash}`;

    try {
      const response = await axios.get<TronGridTransactionDetailResponse>(url, {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        timeout: timeout,
      });

      if (!response.data) {
        throw new Error('TronGrid API returned empty response');
      }

      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const axiosError = error as AxiosError;
        if (axiosError.response?.status === 404) {
          throw new Error('Transaction not found on blockchain');
        }
        if (axiosError.response?.status === 429) {
          throw new Error('TronGrid API rate limit exceeded. Please try again later.');
        }
        if (axiosError.code === 'ECONNABORTED' || axiosError.code === 'ETIMEDOUT') {
          throw new Error('TronGrid API request timeout. Verification pending.');
        }
        if (axiosError.code === 'ECONNREFUSED' || axiosError.code === 'ENOTFOUND') {
          throw new Error('TronGrid API unavailable. Verification pending.');
        }
        throw new Error(`TronGrid API error: ${axiosError.message}`);
      }
      throw new Error(`Failed to fetch transaction from TronGrid: ${error}`);
    }
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
   * Verify USDT TRC20 payment transaction
   * @param txHash - Transaction hash
   * @param expectedAmountUSDT - Expected amount in USDT (as string, e.g., "10.500000")
   * @param ledgerAddress - Expected recipient address (ledger address)
   * @param userWalletAddress - Optional user wallet address for additional validation
   * @returns Verification result with confirmations
   * @throws Error if verification fails
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
  }> {
    // Fetch transaction details
    const transaction = await this.fetchTransactionFromTronGrid(txHash);

    // 1. Check contractRet === "SUCCESS"
    if (!transaction.ret || transaction.ret.length === 0) {
      throw new Error('Transaction result not found');
    }

    if (transaction.ret[0].contractRet !== 'SUCCESS') {
      throw new Error(`Transaction failed: ${transaction.ret[0].contractRet}`);
    }

    // 2. Fetch token transfer to get USDT details
    const tokenTransfer = await this.fetchTokenTransfer(txHash, ledgerAddress);

    // 3. Validate USDT contract address (bulletproof - symbols can be spoofed)
    const usdtContractAddress = this.getUSDTContractAddress();
    const normalizedContractAddress = tokenTransfer.token_info?.address?.toLowerCase();
    const normalizedExpectedContract = usdtContractAddress.toLowerCase();
    
    if (normalizedContractAddress !== normalizedExpectedContract) {
      throw new Error(
        `Invalid USDT contract address: expected ${usdtContractAddress}, got ${tokenTransfer.token_info?.address}`
      );
    }

    // 4. Validate token symbol === "USDT" (secondary check)
    if (tokenTransfer.token_info?.symbol !== 'USDT') {
      throw new Error(`Invalid token symbol: expected USDT, got ${tokenTransfer.token_info?.symbol}`);
    }

    // 5. Validate recipient address (to === ledger address)
    const normalizedTo = tokenTransfer.to.toLowerCase();
    const normalizedLedger = ledgerAddress.toLowerCase();
    if (normalizedTo !== normalizedLedger) {
      throw new Error(
        `Invalid recipient address: expected ${ledgerAddress}, got ${tokenTransfer.to}`
      );
    }

    // 6. Validate amount (value in sun units, USDT has 6 decimals)
    // expectedAmountUSDT is a string like "10.500000"
    // value from TronGrid is in smallest unit (1 USDT = 1,000,000 sun)
    const expectedAmountSun = Math.floor(parseFloat(expectedAmountUSDT) * 1_000_000);
    const actualValue = parseInt(tokenTransfer.value, 10);

    if (actualValue !== expectedAmountSun) {
      throw new Error(
        `Amount mismatch: expected ${expectedAmountSun} sun (${expectedAmountUSDT} USDT), got ${actualValue} sun`
      );
    }

    // 7. Validate block_timestamp exists
    if (!tokenTransfer.block_timestamp) {
      throw new Error('Block timestamp not found');
    }

    // 8. Calculate confirmations
    let confirmations = 0;
    try {
      const currentBlock = await this.getCurrentBlockNumber();
      confirmations = currentBlock - tokenTransfer.block + 1;
    } catch (error) {
      // If we can't get current block, we can't calculate confirmations accurately
      // But we still have the transaction, so we'll use a conservative approach
      // This should be rare, but we handle it gracefully
      throw new Error('Unable to calculate confirmations. Verification pending.');
    }

    // 9. Check confirmations >= required (configurable)
    const requiredConfirmations = this.getRequiredConfirmations();
    if (confirmations < requiredConfirmations) {
      return {
        success: false,
        confirmations,
        blockTimestamp: tokenTransfer.block_timestamp,
        message: `Awaiting confirmations: ${confirmations}/${requiredConfirmations}`,
      };
    }

    // 10. Optional: Validate sender address if provided
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
    };
  }
}

