import express from 'express';
import mongoose from 'mongoose';
import { authenticate, AuthRequest } from '../middleware/auth.middleware';
import Deed from '../models/Deed.model';
import LandSlot from '../models/LandSlot.model';
import UserLand from '../models/UserLand.model';

const router = express.Router();

// @route   GET /api/deeds/:propertyId
// @desc    Get deed by property ID (landSlotId)
// @access  Private (requires authentication)
router.get('/:propertyId', authenticate, async (req: AuthRequest, res: express.Response): Promise<void> => {
  try {
    const { propertyId } = req.params;
    const userId = req.user!.id;

    // First, find the LandSlot by landSlotId (propertyId is the landSlotId)
    const landSlot = await LandSlot.findOne({ landSlotId: propertyId });

    if (!landSlot) {
      res.status(404).json({
        success: false,
        message: 'Property not found',
      });
      return;
    }

    // Validate user owns the property
    const userLand = await UserLand.findOne({
      userId: new mongoose.Types.ObjectId(userId),
      landSlotId: propertyId,
    });

    if (!userLand) {
      res.status(403).json({
        success: false,
        message: 'You do not own this property',
      });
      return;
    }

    // Find the deed by propertyId (using LandSlot _id)
    const deed = await Deed.findOne({ propertyId: landSlot._id });

    if (!deed) {
      res.status(404).json({
        success: false,
        message: 'Deed not found for this property',
      });
      return;
    }

    // Return the deed document with success wrapper (standardized response format)
    res.status(200).json({
      success: true,
      deed: {
        _id: deed._id.toString(),
        userId: deed.userId.toString(),
        propertyId: deed.propertyId.toString(),
        landSlotId: deed.landSlotId,
        ownerName: deed.ownerName,
        plotId: deed.plotId,
        city: deed.city,
        latitude: deed.latitude,
        longitude: deed.longitude,
        nft: {
          tokenId: deed.nft.tokenId,
          contractAddress: deed.nft.contractAddress,
          blockchain: deed.nft.blockchain,
          standard: deed.nft.standard,
        },
        payment: {
          transactionId: deed.payment.transactionId,
          receiver: deed.payment.receiver,
        },
        issuedAt: deed.issuedAt.toISOString(),
        sealNo: deed.sealNo,
      },
    });
  } catch (error: any) {
    console.error('Get deed error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
});

export default router;

