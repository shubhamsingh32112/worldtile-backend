import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Deed from '../models/Deed.model';
import User from '../models/User.model';
import { NFTMintingService } from '../services/nftMinting.service';

// Load environment variables
dotenv.config();

/**
 * Retry NFT minting for deeds that failed to mint
 * 
 * This script uses thirdweb's server wallet (managed by THIRDWEB_SECRET_KEY)
 * to securely mint NFTs without requiring a private key.
 * 
 * Required Environment Variables:
 * - THIRDWEB_SECRET_KEY: Your thirdweb project secret key
 * - NFT_CONTRACT_ADDRESS: Polygon ERC721 contract address
 * - NFT_IMAGE_IPFS_URL: IPFS URL of the NFT image
 * - MONGODB_URI: MongoDB connection string
 * 
 * Optional Environment Variables:
 * - SERVER_WALLET_ADDRESS: Specific server wallet address to use
 *   (if not set, will use first available or create new one)
 * 
 * Usage: 
 *   npm run retry:nft [landSlotId]
 * 
 * Examples:
 *   npm run retry:nft                              # Retry all failed mints
 *   npm run retry:nft karnataka_jp_nagar_002       # Retry specific deed
 */
const retryFailedNFTMints = async () => {
  try {
    // Validate required environment variables
    if (!process.env.THIRDWEB_SECRET_KEY) {
      throw new Error('THIRDWEB_SECRET_KEY is not configured in environment variables');
    }
    if (!process.env.NFT_CONTRACT_ADDRESS) {
      throw new Error('NFT_CONTRACT_ADDRESS is not configured in environment variables');
    }
    if (!process.env.NFT_IMAGE_IPFS_URL) {
      throw new Error('NFT_IMAGE_IPFS_URL is not configured in environment variables');
    }

    // Connect to MongoDB
    const mongoUri = process.env.MONGODB_URI;
    if (!mongoUri) {
      throw new Error('MONGODB_URI is not configured');
    }

    await mongoose.connect(mongoUri);
    console.log('✅ Connected to MongoDB');
    console.log('🔐 Using thirdweb server wallet for secure NFT minting');

    // Get landSlotId from command line args if provided
    const landSlotId = process.argv[2];

    // Find deeds that need NFT minting retry
    // Look for deeds with placeholder tokenIds (starting with "NFT-")
    const query: any = {
      'nft.tokenId': { $regex: /^NFT-/ }, // Placeholder tokenId pattern
      'nft.openSeaUrl': { $exists: false }, // No OpenSea URL means minting failed
    };

    if (landSlotId) {
      query.landSlotId = landSlotId;
      console.log(`🔍 Retrying NFT mint for specific deed: ${landSlotId}`);
    } else {
      console.log('🔍 Finding all deeds with failed NFT mints...');
    }

    const deedsToRetry = await Deed.find(query);

    if (deedsToRetry.length === 0) {
      console.log('✅ No deeds found that need NFT minting retry');
      await mongoose.disconnect();
      return;
    }

    console.log(`📋 Found ${deedsToRetry.length} deed(s) to retry NFT minting`);

    let successCount = 0;
    let failCount = 0;

    for (const deed of deedsToRetry) {
      try {
        console.log(`\n🎨 Processing deed for land slot: ${deed.landSlotId}`);

        // Get user for wallet address and owner name
        const user = await User.findById(deed.userId);
        if (!user) {
          console.error(`❌ User not found for deed ${deed.landSlotId}`);
          failCount++;
          continue;
        }

        const polygonWalletAddress = user.walletAddress;
        if (!polygonWalletAddress) {
          console.error(`❌ User ${user._id} does not have a wallet address`);
          failCount++;
          continue;
        }

        // Mint NFT using thirdweb server wallet (secure, no private key required)
        const mintResult = await NFTMintingService.mintNFT(polygonWalletAddress, {
          name: `WorldTile Deed - ${deed.landSlotId}`,
          description: `Virtual land deed for ${deed.city}, Plot ID: ${deed.landSlotId}`,
          attributes: [
            { trait_type: 'Plot ID', value: deed.landSlotId },
            { trait_type: 'City', value: deed.city },
            { trait_type: 'Owner', value: deed.ownerName },
            { trait_type: 'Seal Number', value: deed.sealNo },
          ],
        });

        // Update deed with minted NFT information
        // Use direct MongoDB update to bypass Mongoose hooks (for NFT field updates only)
        const nftContractAddress = process.env.NFT_CONTRACT_ADDRESS || '';
        const openSeaUrl = NFTMintingService.generateOpenSeaUrl(
          nftContractAddress,
          mintResult.tokenId
        );

        // Use direct MongoDB collection update to bypass Mongoose pre-hooks
        // This is safe because we're only updating NFT fields which are allowed
        if (!mongoose.connection.db) {
          throw new Error('MongoDB connection not established');
        }
        
        await mongoose.connection.db.collection('deeds').updateOne(
          { _id: deed._id },
          {
            $set: {
              'nft.tokenId': mintResult.tokenId.toString(),
              'nft.contractAddress': nftContractAddress,
              'nft.blockchain': 'POLYGON',
              'nft.standard': 'ERC721',
              'nft.mintTxHash': mintResult.transactionHash,
              'nft.openSeaUrl': openSeaUrl,
            },
          }
        );

        console.log(`✅ Successfully minted NFT for ${deed.landSlotId}`);
        console.log(`   TokenId: ${mintResult.tokenId}`);
        console.log(`   OpenSea: ${openSeaUrl}`);
        successCount++;
      } catch (error: any) {
        console.error(`❌ Failed to mint NFT for ${deed.landSlotId}:`, error.message);
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
retryFailedNFTMints();

