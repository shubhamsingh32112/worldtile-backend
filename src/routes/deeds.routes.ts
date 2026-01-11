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
    const userIdObj = new mongoose.Types.ObjectId(userId);

    // Validate user owns the property by checking UserLand first
    const userLand = await UserLand.findOne({
      userId: userIdObj,
      landSlotId: propertyId,
    });

    if (!userLand) {
      console.error(`[GET /api/deeds/:propertyId] UserLand not found for propertyId: ${propertyId}, userId: ${userId}`);
      res.status(403).json({
        success: false,
        message: 'You do not own this property',
      });
      return;
    }

    // Find the deed by userId and landSlotId (propertyId)
    // Try multiple approaches to find the deed
    let deed = await Deed.findOne({
      userId: userIdObj,
      landSlotId: propertyId,
    });

    // Fallback: if not found, try using the UserLand's landSlotId (in case of mismatch)
    if (!deed && userLand.landSlotId !== propertyId) {
      deed = await Deed.findOne({
        userId: userIdObj,
        landSlotId: userLand.landSlotId,
      });
    }

    // Additional fallback: try finding by propertyId reference (via LandSlot)
    if (!deed) {
      const landSlot = await LandSlot.findOne({ landSlotId: propertyId });
      if (landSlot) {
        deed = await Deed.findOne({
          userId: userIdObj,
          propertyId: landSlot._id,
        });
      }
    }

    if (!deed) {
      console.error(`[GET /api/deeds/:propertyId] Deed not found for propertyId: ${propertyId}, userId: ${userId}`);
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
          mintTxHash: deed.nft.mintTxHash || null,
          openSeaUrl: deed.nft.openSeaUrl || null,
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

