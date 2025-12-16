import Area from '../models/Area.model';

/**
 * Pricing Service
 * Handles all price-related calculations
 */
export class PricingService {
  /**
   * Calculate USDT amount from area price
   * @param area - Area document with pricePerTile
   * @returns Expected USDT amount as string (6 decimal places)
   */
  static async calculateUSDTAmount(area: any): Promise<string> {
    // Price is in rupees from Area model, convert to USDT
    // TODO: Add actual USDT conversion rate if pricePerTile is in rupees
    // For now, assuming pricePerTile is already in USDT or 1:1 conversion
    const priceInRupees = area.pricePerTile;
    const priceInUSDT = priceInRupees; // TODO: Add exchange rate conversion if needed
    
    // Return as string with 6 decimal places for USDT precision
    return priceInUSDT.toFixed(6);
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

