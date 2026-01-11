import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Deed from '../models/Deed.model';

// Load environment variables
dotenv.config();

/**
 * Manually update a specific deed's NFT information
 * Usage: npm run update:deed-nft <landSlotId>
 */

const updateDeedNFT = async () => {
  try {
    const landSlotId = process.argv[2];
    
    if (!landSlotId) {
      console.error('❌ Please provide a landSlotId');
      console.log('Usage: npm run update:deed-nft <landSlotId>');
      process.exit(1);
    }

    const mongoUri = process.env.MONGODB_URI;
    if (!mongoUri) {
      throw new Error('MONGODB_URI is not configured');
    }

    await mongoose.connect(mongoUri);
    console.log('✅ Connected to MongoDB');

    // Find the deed
    const deed = await Deed.findOne({ landSlotId: landSlotId });
    
    if (!deed) {
      console.error(`❌ Deed not found with landSlotId: ${landSlotId}`);
      await mongoose.disconnect();
      process.exit(1);
    }

    console.log(`\n📋 Found deed:`);
    console.log(`   Deed ID: ${deed._id}`);
    console.log(`   LandSlotId: ${deed.landSlotId}`);
    console.log(`   Current tokenId: ${deed.nft.tokenId}`);
    console.log(`   Current contractAddress: ${deed.nft.contractAddress}`);
    console.log(`   Current blockchain: ${deed.nft.blockchain}`);
    console.log(`   Current openSeaUrl: ${deed.nft.openSeaUrl || 'Not set'}`);

    // Get the new values from environment or prompt
    const newTokenId = process.argv[3] || '10';
    const newContractAddress = process.env.NFT_CONTRACT_ADDRESS || '0x049E27eDF1f6f02AB2071C966217D660a62Cec99';
    const newBlockchain = 'POLYGON';
    const newStandard = 'ERC721';
    const newMintTxHash = process.argv[4] || '0xe0e98595aca9d81e12233569ac022451fd3fcf878b44fb4ffb02e5048f8d4a7e';
    const newOpenSeaUrl = `https://opensea.io/assets/matic/${newContractAddress}/${newTokenId}`;

    console.log(`\n🔄 Updating to:`);
    console.log(`   TokenId: ${newTokenId}`);
    console.log(`   ContractAddress: ${newContractAddress}`);
    console.log(`   Blockchain: ${newBlockchain}`);
    console.log(`   Standard: ${newStandard}`);
    console.log(`   MintTxHash: ${newMintTxHash}`);
    console.log(`   OpenSeaUrl: ${newOpenSeaUrl}`);

    if (!mongoose.connection.db) {
      throw new Error('MongoDB connection not established');
    }

    const deedObjectId = typeof deed._id === 'string' 
      ? new mongoose.Types.ObjectId(deed._id)
      : deed._id;

    // Update using direct MongoDB collection update
    const updateResult = await mongoose.connection.db.collection('deeds').updateOne(
      { _id: deedObjectId },
      {
        $set: {
          'nft.tokenId': newTokenId,
          'nft.contractAddress': newContractAddress,
          'nft.blockchain': newBlockchain,
          'nft.standard': newStandard,
          'nft.mintTxHash': newMintTxHash,
          'nft.openSeaUrl': newOpenSeaUrl,
          updatedAt: new Date(),
        },
      }
    );

    console.log(`\n📊 Update result:`);
    console.log(`   Matched: ${updateResult.matchedCount}`);
    console.log(`   Modified: ${updateResult.modifiedCount}`);

    if (updateResult.matchedCount === 0) {
      console.error('❌ Deed not found in database');
      await mongoose.disconnect();
      process.exit(1);
    }

    if (updateResult.modifiedCount === 0) {
      console.warn('⚠️  No changes made (deed might already be updated)');
    }

    // Verify the update
    const updatedDeed = await mongoose.connection.db.collection('deeds').findOne({ _id: deedObjectId });
    
    if (updatedDeed) {
      console.log(`\n✅ Verification - Updated deed:`);
      console.log(`   TokenId: ${updatedDeed.nft.tokenId}`);
      console.log(`   ContractAddress: ${updatedDeed.nft.contractAddress}`);
      console.log(`   Blockchain: ${updatedDeed.nft.blockchain}`);
      console.log(`   Standard: ${updatedDeed.nft.standard}`);
      console.log(`   MintTxHash: ${updatedDeed.nft.mintTxHash || 'Not set'}`);
      console.log(`   OpenSeaUrl: ${updatedDeed.nft.openSeaUrl || 'Not set'}`);
      console.log(`   UpdatedAt: ${updatedDeed.updatedAt}`);
    }

    await mongoose.disconnect();
    console.log('\n✅ Disconnected from MongoDB');
  } catch (error: any) {
    console.error('❌ Error:', error.message);
    if (error.stack) {
      console.error(error.stack);
    }
    await mongoose.disconnect().catch(() => {});
    process.exit(1);
  }
};

if (require.main === module) {
  updateDeedNFT();
}

export default updateDeedNFT;
