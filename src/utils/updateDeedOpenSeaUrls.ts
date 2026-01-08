import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Deed from '../models/Deed.model';
import { NFTMintingService } from '../services/nftMinting.service';

// Load environment variables
dotenv.config();

/**
 * Update OpenSea URLs for deeds that have real tokenIds but are missing openSeaUrl
 * 
 * This is useful for deeds where NFT was minted but openSeaUrl wasn't saved.
 * 
 * Required Environment Variables:
 * - NFT_CONTRACT_ADDRESS: Polygon ERC721 contract address
 * - MONGODB_URI: MongoDB connection string
 * 
 * Usage: 
 *   npm run update:opensea [landSlotId]
 * 
 * Examples:
 *   npm run update:opensea                              # Update all deeds missing OpenSea URLs
 *   npm run update:opensea karnataka_jp_nagar_002       # Update specific deed
 */
const updateDeedOpenSeaUrls = async () => {
  try {
    // Validate required environment variables
    if (!process.env.NFT_CONTRACT_ADDRESS) {
      throw new Error('NFT_CONTRACT_ADDRESS is not configured in environment variables');
    }

    // Connect to MongoDB
    const mongoUri = process.env.MONGODB_URI;
    if (!mongoUri) {
      throw new Error('MONGODB_URI is not configured');
    }

    await mongoose.connect(mongoUri);
    console.log('✅ Connected to MongoDB');

    // Get landSlotId from command line args if provided
    const landSlotId = process.argv[2];

    // Find deeds that need OpenSea URL update
    // Look for deeds with real tokenIds (not placeholder) but missing openSeaUrl
    const query: any = {
      'nft.tokenId': { $not: { $regex: /^NFT-/ } }, // Real tokenId (not placeholder)
      $or: [
        { 'nft.openSeaUrl': { $exists: false } }, // Missing openSeaUrl
        { 'nft.openSeaUrl': null }, // null openSeaUrl
        { 'nft.openSeaUrl': '' }, // Empty openSeaUrl
      ],
    };

    if (landSlotId) {
      query.landSlotId = landSlotId;
      console.log(`🔍 Updating OpenSea URL for specific deed: ${landSlotId}`);
    } else {
      console.log('🔍 Finding all deeds missing OpenSea URLs...');
    }

    const deedsToUpdate = await Deed.find(query);

    if (deedsToUpdate.length === 0) {
      console.log('✅ No deeds found that need OpenSea URL update');
      await mongoose.disconnect();
      return;
    }

    console.log(`📋 Found ${deedsToUpdate.length} deed(s) to update`);

    const nftContractAddress = process.env.NFT_CONTRACT_ADDRESS;
    let successCount = 0;
    let failCount = 0;

    for (const deed of deedsToUpdate) {
      try {
        console.log(`\n📝 Processing deed for land slot: ${deed.landSlotId}`);
        console.log(`   Current TokenId: ${deed.nft.tokenId}`);

        // Generate OpenSea URL from existing tokenId and contractAddress
        const contractAddress = deed.nft.contractAddress || nftContractAddress;
        if (!contractAddress || contractAddress === 'TBD') {
          console.error(`   ❌ Invalid contract address for ${deed.landSlotId}`);
          failCount++;
          continue;
        }

        const openSeaUrl = NFTMintingService.generateOpenSeaUrl(
          contractAddress,
          deed.nft.tokenId
        );

        // Update deed with OpenSea URL
        await Deed.updateOne(
          { _id: deed._id },
          {
            $set: {
              'nft.openSeaUrl': openSeaUrl,
              'nft.contractAddress': contractAddress, // Ensure contract address is set
            },
          }
        );

        console.log(`   ✅ Updated OpenSea URL: ${openSeaUrl}`);
        successCount++;
      } catch (error: any) {
        console.error(`   ❌ Failed to update ${deed.landSlotId}:`, error.message);
        failCount++;
      }
    }

    console.log(`\n📊 Summary:`);
    console.log(`   ✅ Success: ${successCount}`);
    console.log(`   ❌ Failed: ${failCount}`);

    await mongoose.disconnect();
    console.log('\n✅ Disconnected from MongoDB');
  } catch (error: any) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
};

// Run the script
updateDeedOpenSeaUrls();

