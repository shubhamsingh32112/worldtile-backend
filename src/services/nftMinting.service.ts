import { createThirdwebClient, getContract, readContract, Engine } from 'thirdweb';
import { mintTo } from 'thirdweb/extensions/erc721';
import { sendTransaction, waitForReceipt } from 'thirdweb';
import { polygon } from 'thirdweb/chains';

/**
 * NFT Minting Service
 * Handles minting NFTs on Polygon using thirdweb SDK
 * Uses ERC721 NFT Collection contract with mintTo (server wallet needs MINTER_ROLE)
 */
  export class NFTMintingService {
    private static client: ReturnType<typeof createThirdwebClient> | null = null;

    /**
     * Get or create thirdweb client
     */
    private static getClient() {
      if (!this.client) {
        const secretKey = process.env.THIRDWEB_SECRET_KEY;
        if (!secretKey) {
          throw new Error('THIRDWEB_SECRET_KEY is not configured in environment variables');
        }
        this.client = createThirdwebClient({ secretKey });
      }
      return this.client;
    }

    /**
     * Get NFT contract address from environment
     */
    private static getContractAddress(): string {
      const address = process.env.NFT_CONTRACT_ADDRESS;
      if (!address) {
        throw new Error('NFT_CONTRACT_ADDRESS is not configured in environment variables');
      }
      
      // Validate Ethereum/Polygon address format (42 characters: 0x + 40 hex chars)
      const addressRegex = /^0x[a-fA-F0-9]{40}$/;
      if (!addressRegex.test(address)) {
        throw new Error(`Invalid NFT_CONTRACT_ADDRESS format. Expected Ethereum/Polygon address (0x + 40 hex characters), got: ${address}`);
      }
      
      return address;
    }



    /**
     * Mint NFT to user's wallet address on Polygon (ERC721 NFT Collection)
     * @param toAddress - User's Polygon wallet address (EVM address)
     * @param metadata - NFT metadata (name, description, image, attributes)
     * @returns Object containing tokenId and transactionHash
     * 
     * Note: Server wallet must have MINTER_ROLE on the ERC721 contract
     */
    static async mintNFT(
      toAddress: string,
      metadata: {
        name: string;
        description?: string;
        attributes?: Array<{ trait_type: string; value: string | number }>;
      }
    ): Promise<{ tokenId: string; transactionHash: string; imageUrl: string }> {
      try {
        const client = this.getClient();
        const contractAddress = this.getContractAddress();
        
        // Get IPFS image URL from environment
        const imageUrl = process.env.NFT_IMAGE_IPFS_URL;
        if (!imageUrl) {
          throw new Error('NFT_IMAGE_IPFS_URL is not configured in environment variables');
        }

        // Get contract instance (ERC721 NFT Collection)
        const contract = getContract({
          client,
          chain: polygon,
          address: contractAddress,
        });

        // Prepare metadata with image
        const nftMetadata = {
          name: metadata.name,
          description: metadata.description || `Virtual Land Deed for ${metadata.name}`,
          image: imageUrl,
          ...(metadata.attributes && metadata.attributes.length > 0 && {
            attributes: metadata.attributes,
          }),
        };

        // Prepare mint transaction for ERC721 NFT Collection
        // Server wallet must have MINTER_ROLE on the contract
        console.log(`🎨 Minting NFT to ${toAddress} (${metadata.name})...`);
        const transaction = mintTo({
          contract,
          to: toAddress,
          nft: nftMetadata,
        });

        // Get server wallet account (project wallet managed by thirdweb)
        // Uses the secret key from THIRDWEB_SECRET_KEY to authenticate
        // First, try to get server wallet address from env, otherwise list/create one
        let serverWalletAddress = process.env.SERVER_WALLET_ADDRESS;
        
        if (!serverWalletAddress) {
          // List existing server wallets for the project
          const serverWalletsResult = await Engine.getServerWallets({ client });
          
          if (serverWalletsResult.accounts && serverWalletsResult.accounts.length > 0) {
            // Use the first server wallet
            serverWalletAddress = serverWalletsResult.accounts[0].address;
            console.log(`📌 Using existing server wallet: ${serverWalletAddress}`);
          } else {
            // Create a new server wallet if none exist
            const newWallet = await Engine.createServerWallet({
              client,
              label: 'NFT Minting Wallet',
            });
            serverWalletAddress = newWallet.address;
            console.log(`✅ Created new server wallet: ${serverWalletAddress}`);
          }
        }
        
        if (!serverWalletAddress) {
          throw new Error('Failed to get or create server wallet. Please set SERVER_WALLET_ADDRESS in environment variables.');
        }
        
        const account = Engine.serverWallet({
          client,
          address: serverWalletAddress,
        });

        // Send transaction
        const result = await sendTransaction({
          transaction,
          account,
        });

        // Extract transaction hash from result
        const transactionHash = typeof result === 'string' 
          ? result 
          : (result as any).transactionHash || result;

        // Wait for transaction to be confirmed
        console.log(`⏳ Waiting for transaction confirmation...`);
        const receipt = await waitForReceipt({
          client,
          chain: polygon,
          transactionHash: transactionHash as `0x${string}`,
        });

        console.log(`✅ Transaction confirmed! Hash: ${receipt.transactionHash}`);
        
        // Extract tokenId from Transfer event logs
        // ERC721 Transfer event: Transfer(address indexed from, address indexed to, uint256 indexed tokenId)
        // Mint events have 'from' = zero address (0x0000000000000000000000000000000000000000)
        let tokenId: string | null = null;
        const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
        
        if (receipt.logs && receipt.logs.length > 0) {
          // Find Transfer event with from = zero address
          for (const log of receipt.logs) {
            try {
              // Transfer event signature: 0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef
              // Topics: [eventSignature, from, to, tokenId]
              if (
                log.topics?.length >= 4 &&
                log.topics[1] &&
                log.topics[3]
              ) {
                const fromAddress = `0x${log.topics[1].slice(-40)}`.toLowerCase();
                if (fromAddress === ZERO_ADDRESS.toLowerCase()) {
                  // This is a mint event, extract tokenId from topics[3]
                  tokenId = BigInt(log.topics[3]).toString();
                  console.log(`🎯 Found minted tokenId: ${tokenId}`);
                  break;
                }
              }
            } catch (e) {
              console.warn('Error parsing log:', e);
            }
          }
        }

        // If tokenId not found in logs, query totalSupply and subtract 1
        // (assuming sequential minting)
        if (!tokenId) {
          try {
            console.log('⚠️ TokenId not found in logs, querying contract...');
            const totalSupply = await readContract({
              contract,
              method: 'function totalSupply() view returns (uint256)',
              params: [],
            });
            // New tokenId = totalSupply - 1 (0-indexed)
            tokenId = (BigInt(totalSupply.toString()) - BigInt(1)).toString();
            console.log(`✅ Retrieved tokenId from contract: ${tokenId}`);
          } catch (e) {
            console.error('❌ Failed to get tokenId from contract:', e);
            // Fallback: use transaction hash as temporary identifier
            tokenId = receipt.transactionHash;
          }
        }
        
        return {
          tokenId,
          transactionHash: receipt.transactionHash,
          imageUrl,
        };
      } catch (error: any) {
        console.error('❌ NFT minting failed:', error);
        throw new Error(`NFT minting failed: ${error.message}`);
      }
    }

    /**
     * Generate OpenSea URL for Polygon NFT
     * @param contractAddress - NFT contract address
     * @param tokenId - Token ID
     * @returns OpenSea URL
     */
    static generateOpenSeaUrl(contractAddress: string, tokenId: string): string {
      // OpenSea uses 'matic' for Polygon mainnet
      return `https://opensea.io/assets/matic/${contractAddress}/${tokenId}`;
    }

    /**
     * Generate OpenSea testnet URL (Polygon Mumbai)
     * @param contractAddress - NFT contract address
     * @param tokenId - Token ID
     * @returns OpenSea testnet URL
     */
    static generateOpenSeaTestnetUrl(contractAddress: string, tokenId: string): string {
      return `https://testnets.opensea.io/assets/mumbai/${contractAddress}/${tokenId}`;
    }
  }

