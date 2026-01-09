  import mongoose, { Document, Schema } from 'mongoose';

  export interface INFT {
    tokenId: string;
    contractAddress: string;
    blockchain: string;
    standard: string;
    mintTxHash?: string; // Transaction hash of the NFT mint
    openSeaUrl?: string; // OpenSea URL for viewing the NFT
  }

  export interface IPayment {
    transactionId: string;
    receiver: string;
  }

  export interface IDeed extends Document {
    userId: mongoose.Types.ObjectId; // Reference to User
    propertyId: mongoose.Types.ObjectId; // Reference to LandSlot (using _id)
    landSlotId: string; // Denormalized for quick lookup
    orderId: mongoose.Types.ObjectId; // Reference to Order (direct access, no join needed)
    paymentTxHash: string; // Payment transaction hash (direct access, no join needed)
    
    ownerName: string;
    plotId: string;
    city: string;
    
    latitude: number;
    longitude: number;
    
    nft: INFT;
    payment: IPayment;
    
    issuedAt: Date;
    sealNo: string;
    
    createdAt: Date;
    updatedAt: Date;
  }

  const DeedSchema = new Schema<IDeed>(
    {
      userId: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: [true, 'User ID is required'],
        index: true,
      },
      propertyId: {
        type: Schema.Types.ObjectId,
        ref: 'LandSlot',
        required: [true, 'Property ID is required'],
        unique: true, // One deed per property
        index: true,
      },
      landSlotId: {
        type: String,
        required: [true, 'Land slot ID is required'],
        trim: true,
        index: true,
      },
      orderId: {
        type: Schema.Types.ObjectId,
        ref: 'Order',
        required: [true, 'Order ID is required'],
        index: true,
      },
      paymentTxHash: {
        type: String,
        required: [true, 'Payment transaction hash is required'],
        trim: true,
        index: true,
      },
      ownerName: {
        type: String,
        required: [true, 'Owner name is required'],
        trim: true,
      },
      plotId: {
        type: String,
        required: [true, 'Plot ID is required'],
        trim: true,
      },
      city: {
        type: String,
        required: [true, 'City is required'],
        trim: true,
      },
      latitude: {
        type: Number,
        required: [true, 'Latitude is required'],
      },
      longitude: {
        type: Number,
        required: [true, 'Longitude is required'],
      },
      nft: {
        tokenId: {
          type: String,
          required: [true, 'NFT token ID is required'],
          trim: true,
        },
        contractAddress: {
          type: String,
          required: [true, 'NFT contract address is required'],
          trim: true,
        },
        blockchain: {
          type: String,
          required: [true, 'Blockchain is required'],
          trim: true,
        },
        standard: {
          type: String,
          required: [true, 'NFT standard is required'],
          trim: true,
        },
        mintTxHash: {
          type: String,
          trim: true,
        },
        openSeaUrl: {
          type: String,
          trim: true,
        },
      },
      payment: {
        transactionId: {
          type: String,
          required: [true, 'Payment transaction ID is required'],
          trim: true,
        },
        receiver: {
          type: String,
          required: [true, 'Payment receiver address is required'],
          trim: true,
        },
      },
      issuedAt: {
        type: Date,
        required: [true, 'Issued date is required'],
        default: Date.now,
      },
      sealNo: {
        type: String,
        required: [true, 'Seal number is required'],
        trim: true,
        unique: true,
        index: true,
      },
    },
    {
      timestamps: true,
    }
  );

  // Indexes for common queries
  DeedSchema.index({ userId: 1, issuedAt: -1 }); // User's deeds sorted by issue date
  DeedSchema.index({ landSlotId: 1 }, { unique: true }); // CRITICAL: One deed per landSlotId (prevents duplicate deeds on retry)
  DeedSchema.index({ propertyId: 1 }); // Quick lookup by propertyId
  DeedSchema.index({ orderId: 1 }); // Quick lookup by orderId
  DeedSchema.index({ paymentTxHash: 1 }); // Quick lookup by payment transaction hash
  DeedSchema.index({ landSlotId: 1, userId: 1 }); // Secure deed lookup (landSlotId + userId)

  // Prevent updates after creation (immutable)
  // Exception: Allow system-level updates to NFT fields (tokenId, mintTxHash, openSeaUrl, etc.)
  DeedSchema.pre(['updateOne', 'findOneAndUpdate', 'updateMany'], function (next) {
    const update = this.getUpdate() as any;
    
    // Allow NFT system updates (for minting retries and initial mint completion)
    // Check if update only contains NFT-related fields in $set
    if (update?.$set) {
      const allowedNFTFields = [
        'nft.tokenId',
        'nft.contractAddress',
        'nft.blockchain',
        'nft.standard',
        'nft.mintTxHash',
        'nft.openSeaUrl',
      ];
      
      const updateKeys = Object.keys(update.$set);
      const isOnlyNFTUpdate = updateKeys.every(key => 
        allowedNFTFields.includes(key) || key.startsWith('nft.')
      );
      
      // Check for other update operators that might modify non-NFT fields
      const hasOtherOperators = Object.keys(update).some(key => 
        key !== '$set' && key !== '$inc' && !key.startsWith('$')
      );
      
      // If update only contains NFT fields and no other operators, allow it
      if (isOnlyNFTUpdate && updateKeys.length > 0 && !hasOtherOperators) {
        return next();
      }
      
      // If we have other operators or non-NFT fields, block the update
      if (hasOtherOperators || !isOnlyNFTUpdate) {
        return next(new Error('Deeds are immutable and cannot be updated. Only NFT fields can be updated by the system.'));
      }
    }
    
    // Block all other updates
    return next(new Error('Deeds are immutable and cannot be updated'));
  });

  export default mongoose.model<IDeed>('Deed', DeedSchema);

