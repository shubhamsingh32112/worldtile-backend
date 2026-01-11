import Deed from '../models/Deed.model';

/**
 * Generate a unique seal number in format: WT-XXXX
 * where XXXX is a random 4-digit number (1000-9999)
 * 
 * @param maxAttempts - Maximum number of attempts to find a unique seal number
 * @returns Unique seal number
 */
export async function generateSealNumber(maxAttempts: number = 100): Promise<string> {
  let attempts = 0;
  let sealNo: string;
  
  do {
    // Generate random 4-digit number
    const randomNum = Math.floor(Math.random() * 9000) + 1000; // 1000-9999
    sealNo = `WT-${randomNum}`;
    
    attempts++;
    
    // Check if this seal number already exists
    const existingDeed = await Deed.findOne({ sealNo });
    
    if (!existingDeed) {
      // Found unique seal number
      return sealNo;
    }
    
    // If we've tried too many times, use timestamp-based fallback
    if (attempts >= maxAttempts) {
      // Use last 4 digits of timestamp as fallback
      const timestampStr = Date.now().toString();
      const lastFour = timestampStr.slice(-4);
      sealNo = `WT-${lastFour}`;
      
      // Double-check this one too
      const fallbackExists = await Deed.findOne({ sealNo });
      if (!fallbackExists) {
        return sealNo;
      }
      
      // Last resort: use timestamp with modulo
      const fallbackNum = (Date.now() % 9000) + 1000;
      return `WT-${Math.floor(fallbackNum)}`;
    }
  } while (attempts < maxAttempts);
  
  // This shouldn't be reached, but TypeScript needs it
  return sealNo;
}
