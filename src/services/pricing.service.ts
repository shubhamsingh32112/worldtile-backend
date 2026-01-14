/**
 * Pricing Service
 * Handles all price-related calculations
 */
export class PricingService {
  /**
   * Calculate USDT amount from area price
   * @returns Expected USDT amount as string (6 decimal places)
   */
  static async calculateUSDTAmount(): Promise<string> {
    // Fixed price: 110 USDT per tile for all areas
    const priceInUSDT = 110;
    
    // Return as string with 6 decimal places for USDT precision
    return priceInUSDT.toFixed(6);
  }

  /**
   * Calculate pricing with discount for referred users
   * @param quantity - Number of tiles
   * @param hasReferral - Whether user has referredBy (user.referredBy != null)
   * @returns Pricing breakdown: { baseAmountUSDT, discountUSDT, finalAmountUSDT }
   */
  static calculatePricing(quantity: number, hasReferral: boolean): {
    baseAmountUSDT: string;
    discountUSDT: string;
    finalAmountUSDT: string;
  } {
    const PRICE_PER_TILE = 110;
    const REFERRAL_DISCOUNT = 5.0; // $5 discount for referred users
    
    const baseAmount = quantity * PRICE_PER_TILE;
    const discount = hasReferral ? REFERRAL_DISCOUNT : 0;
    const finalAmount = Math.max(baseAmount - discount, 0); // Ensure non-negative
    
    return {
      baseAmountUSDT: baseAmount.toFixed(6),
      discountUSDT: discount.toFixed(6),
      finalAmountUSDT: finalAmount.toFixed(6),
    };
  }

  /**
   * Get USDT address from environment
   * @returns Ledger USDT TRC20 address
   * @throws Error if address is not configured
   */
  static getUSDTAddress(): string {
    const address = process.env.LEDGER_USDT_ADDRESS;
    if (!address) {
      throw new Error('LEDGER_USDT_ADDRESS not configured in environment variables');
    }
    return address;
  }
}

