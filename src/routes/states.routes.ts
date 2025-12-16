import express from 'express';
import State from '../models/State.model';
import Area from '../models/Area.model';

const router = express.Router();

// @route   GET /api/states/:stateKey/areas
// @desc    Get all areas for a specific state
// @access  Public
router.get('/:stateKey/areas', async (req, res) => {
  try {
    const { stateKey } = req.params;
    
    // Normalize stateKey to lowercase
    const normalizedStateKey = stateKey.toLowerCase().trim();
    
    // Verify state exists and is enabled
    const state = await State.findOne({ 
      stateKey: normalizedStateKey,
      enabled: true 
    });
    
    if (!state) {
      return res.status(404).json({
        success: false,
        message: 'State not found or not enabled',
      });
    }
    
    // Get all enabled areas for this state
    const areas = await Area.find({
      stateKey: normalizedStateKey,
      enabled: true,
    }).sort({ areaName: 1 });
    
    // Format response
    const areasResponse = areas.map((area) => ({
      areaKey: area.areaKey,
      areaName: area.areaName,
      remainingSlots: area.totalSlots - area.soldSlots,
      totalSlots: area.totalSlots,
      pricePerTile: area.pricePerTile,
    }));
    
    res.status(200).json(areasResponse);
  } catch (error: any) {
    console.error('Get areas error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
});

export default router;

