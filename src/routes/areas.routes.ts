import express from 'express';
import { body, validationResult } from 'express-validator';
import Area from '../models/Area.model';
import LandSlot from '../models/LandSlot.model';
import { authenticate, AuthRequest } from '../middleware/auth.middleware';

const router = express.Router();

// @route   GET /api/areas/:areaKey
// @desc    Get area details by areaKey
// @access  Public
router.get('/:areaKey', async (req, res) => {
  try {
    const { areaKey } = req.params;
    
    // Normalize areaKey to lowercase
    const normalizedAreaKey = areaKey.toLowerCase().trim();
    
    const area = await Area.findOne({
      areaKey: normalizedAreaKey,
      enabled: true,
    });
    
    if (!area) {
      return res.status(404).json({
        success: false,
        message: 'Area not found or not enabled',
      });
    }
    
    // Calculate remaining slots
    const remainingSlots = area.totalSlots - area.soldSlots;
    
    res.status(200).json({
      areaKey: area.areaKey,
      areaName: area.areaName,
      stateKey: area.stateKey,
      stateName: area.stateName,
      totalSlots: area.totalSlots,
      soldSlots: area.soldSlots,
      remainingSlots: remainingSlots,
      pricePerTile: area.pricePerTile,
      highlights: area.highlights,
      enabled: area.enabled,
      createdAt: area.createdAt,
      updatedAt: area.updatedAt,
    });
    return;
  } catch (error: any) {
    console.error('Get area error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
    return;
  }
});

// @route   POST /api/areas/:areaKey/buy
// @desc    Buy a tile for an area (atomically increment soldSlots)
// @access  Private (requires authentication)
router.post(
  '/:areaKey/buy',
  authenticate,
  [
    body('quantity')
      .optional()
      .isInt({ min: 1 })
      .withMessage('Quantity must be a positive integer'),
  ],
  async (req: AuthRequest, res: express.Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors: errors.array(),
        });
      }
      
      const { areaKey } = req.params;
      const quantity = req.body.quantity || 1; // Default to 1 tile
      
      // Normalize areaKey to lowercase
      const normalizedAreaKey = areaKey.toLowerCase().trim();
      
      // Find area and check availability
      const area = await Area.findOne({
        areaKey: normalizedAreaKey,
        enabled: true,
      });
      
      if (!area) {
        return res.status(404).json({
          success: false,
          message: 'Area not found or not enabled',
        });
      }
      
      // Check if enough slots are available
      const remainingSlots = area.totalSlots - area.soldSlots;
      
      if (remainingSlots < quantity) {
        return res.status(400).json({
          success: false,
          message: `Insufficient slots. Only ${remainingSlots} slot(s) remaining.`,
        });
      }
      
      if (remainingSlots === 0) {
        return res.status(400).json({
          success: false,
          message: 'No slots available for this area',
        });
      }
      
      // Atomically increment soldSlots
      const updatedArea = await Area.findOneAndUpdate(
        {
          areaKey: normalizedAreaKey,
          enabled: true,
          // Ensure we don't exceed total slots
          $expr: { $lt: ['$soldSlots', '$totalSlots'] },
        },
        {
          $inc: { soldSlots: quantity },
        },
        {
          new: true,
          runValidators: true,
        }
      );
      
      if (!updatedArea) {
        return res.status(400).json({
          success: false,
          message: 'Failed to purchase tile. Please try again.',
        });
      }
      
      // Calculate new remaining slots
      const newRemainingSlots = updatedArea.totalSlots - updatedArea.soldSlots;
      
      res.status(200).json({
        success: true,
        message: `Successfully purchased ${quantity} tile(s)`,
        area: {
          areaKey: updatedArea.areaKey,
          areaName: updatedArea.areaName,
          stateKey: updatedArea.stateKey,
          stateName: updatedArea.stateName,
          totalSlots: updatedArea.totalSlots,
          soldSlots: updatedArea.soldSlots,
          remainingSlots: newRemainingSlots,
          pricePerTile: updatedArea.pricePerTile,
        },
        purchase: {
          quantity: quantity,
          totalPrice: quantity * updatedArea.pricePerTile,
        },
      });
      return;
    } catch (error: any) {
      console.error('Buy tile error:', error);
      res.status(500).json({
        success: false,
        message: 'Server error',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined,
      });
      return;
    }
  }
);

// @route   GET /api/areas/:areaKey/available-slot
// @desc    Get an available land slot for an area
// @access  Private (requires authentication)
router.get('/:areaKey/available-slot', authenticate, async (req: AuthRequest, res: express.Response): Promise<void> => {
  try {
    const { areaKey } = req.params;
    const normalizedAreaKey = areaKey.toLowerCase().trim();

    // Find area to get stateKey
    const area = await Area.findOne({
      areaKey: normalizedAreaKey,
      enabled: true,
    });

    if (!area) {
      res.status(404).json({
        success: false,
        message: 'Area not found or not enabled',
      });
      return;
    }

    // Find an available land slot (not SOLD, and either AVAILABLE or LOCKED with expired lock)
    const availableSlot = await LandSlot.findOne({
      areaKey: normalizedAreaKey,
      stateKey: area.stateKey,
      $or: [
        { status: 'AVAILABLE' },
        {
          status: 'LOCKED',
          lockExpiresAt: { $lt: new Date() }, // Lock expired
        },
      ],
    }).sort({ slotNumber: 1 }); // Get the first available slot by slot number

    if (!availableSlot) {
      res.status(404).json({
        success: false,
        message: 'No available land slots found for this area',
      });
      return;
    }

    res.status(200).json({
      success: true,
      landSlot: {
        landSlotId: availableSlot.landSlotId,
        stateKey: availableSlot.stateKey,
        stateName: availableSlot.stateName,
        areaKey: availableSlot.areaKey,
        areaName: availableSlot.areaName,
        slotNumber: availableSlot.slotNumber,
        status: availableSlot.status,
      },
    });
  } catch (error: any) {
    console.error('Get available slot error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
});

// @route   GET /api/areas/:areaKey/available-slots
// @desc    Get multiple available land slots for an area
// @access  Private (requires authentication)
router.get('/:areaKey/available-slots', authenticate, async (req: AuthRequest, res: express.Response): Promise<void> => {
  try {
    const { areaKey } = req.params;
    const quantity = parseInt(req.query.quantity as string) || 1;
    const normalizedAreaKey = areaKey.toLowerCase().trim();

    if (quantity < 1 || quantity > 100) {
      res.status(400).json({
        success: false,
        message: 'Quantity must be between 1 and 100',
      });
      return;
    }

    // Find area to get stateKey
    const area = await Area.findOne({
      areaKey: normalizedAreaKey,
      enabled: true,
    });

    if (!area) {
      res.status(404).json({
        success: false,
        message: 'Area not found or not enabled',
      });
      return;
    }

    // Find available land slots (not SOLD, and either AVAILABLE or LOCKED with expired lock)
    const availableSlots = await LandSlot.find({
      areaKey: normalizedAreaKey,
      stateKey: area.stateKey,
      $or: [
        { status: 'AVAILABLE' },
        {
          status: 'LOCKED',
          lockExpiresAt: { $lt: new Date() }, // Lock expired
        },
      ],
    })
      .sort({ slotNumber: 1 }) // Get slots in order
      .limit(quantity);

    if (availableSlots.length < quantity) {
      res.status(404).json({
        success: false,
        message: `Only ${availableSlots.length} slot(s) available, but ${quantity} requested`,
      });
      return;
    }

    res.status(200).json({
      success: true,
      landSlots: availableSlots.map((slot) => ({
        landSlotId: slot.landSlotId,
        stateKey: slot.stateKey,
        stateName: slot.stateName,
        areaKey: slot.areaKey,
        areaName: slot.areaName,
        slotNumber: slot.slotNumber,
        status: slot.status,
      })),
      count: availableSlots.length,
    });
  } catch (error: any) {
    console.error('Get available slots error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
});

export default router;

