import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Deed from '../models/Deed.model';

// Load environment variables
dotenv.config();

/**
 * Check deed status and NFT information
 * Useful for debugging missing OpenSea URLs
 * 
 * Usage: 
 *   npm run check:deed [landSlotId]
 */
const checkDeedStatus = async () => {
  try {
    // Connect to MongoDB
    const mongoUri = process.env.MONGODB_URI;
    if (!mongoUri) {
      throw new Error('MONGODB_URI is not configured');
    }

    await mongoose.connect(mongoUri);
    console.log('✅ Connected to MongoDB');

    // Get landSlotId from command line args
    const landSlotId = process.argv[2];
    if (!landSlotId) {
      console.error('❌ Please provide a landSlotId as argument');
      console.log('Usage: npm run check:deed karnataka_jp_nagar_002');
      await mongoose.disconnect();
      process.exit(1);
    }

    const deed = await Deed.findOne({ landSlotId });

    if (!deed) {
      console.log(`❌ Deed not found for landSlotId: ${landSlotId}`);
      await mongoose.disconnect();
      return;
    }

    console.log('\n📄 Deed Information:');
    console.log('=' .repeat(50));
    console.log(`Land Slot ID: ${deed.landSlotId}`);
    console.log(`Owner Name: ${deed.ownerName}`);
    console.log(`City: ${deed.city}`);
    console.log(`Seal No: ${deed.sealNo}`);
    console.log('\n🎨 NFT Information:');
    console.log(`Token ID: ${deed.nft.tokenId}`);
    console.log(`Contract Address: ${deed.nft.contractAddress}`);
    console.log(`Blockchain: ${deed.nft.blockchain}`);
    console.log(`Standard: ${deed.nft.standard}`);
    console.log(`Mint Tx Hash: ${deed.nft.mintTxHash || 'NOT SET'}`);
    console.log(`OpenSea URL: ${deed.nft.openSeaUrl || 'NOT SET'}`);
    
    // Analysis
    console.log('\n🔍 Analysis:');
    const hasPlaceholderTokenId = deed.nft.tokenId.startsWith('NFT-');
    const hasMintTxHash = !!deed.nft.mintTxHash;
    const hasOpenSeaUrl = !!deed.nft.openSeaUrl;
    
    if (hasPlaceholderTokenId) {
      console.log('⚠️  Token ID is a PLACEHOLDER (starts with "NFT-")');
      if (!hasMintTxHash) {
        console.log('   → NFT has NOT been minted yet');
        console.log('   → Action: Run "npm run retry:nft" to mint the NFT');
      } else {
        console.log('   → NFT WAS minted (mintTxHash exists), but deed was not updated');
        console.log('   → Action: You may need to manually update the deed with the real tokenId');
      }
    } else {
      console.log('✅ Token ID is REAL (not a placeholder)');
      if (!hasOpenSeaUrl) {
        console.log('   → OpenSea URL is missing');
        console.log('   → Action: Run "npm run update:opensea" to generate it');
      } else {
        console.log('   → OpenSea URL is set');
        console.log(`   → URL: ${deed.nft.openSeaUrl}`);
      }
    }
    
    console.log('=' .repeat(50));

    await mongoose.disconnect();
    console.log('\n✅ Disconnected from MongoDB');
  } catch (error: any) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
};

// Run the script
checkDeedStatus();

