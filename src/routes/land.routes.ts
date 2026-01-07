import express from 'express';
// TODO: LandTile model and PostGIS config not implemented yet
// import { thirdwebAuth, ThirdwebAuthRequest } from '../middleware/thirdwebAuth.middleware';
// import LandTile from '../models/LandTile.model';
// import { getSequelize } from '../config/postgis';
// import { QueryTypes, Op } from 'sequelize';

const router = express.Router();

// TODO: Land routes not implemented yet - LandTile model and PostGIS config missing
// All routes commented out until implementation is complete

/*
// @route   GET /api/land/tiles
// @desc    Get all land tiles
// @access  Public
router.get('/tiles', async (req, res) => {
  // Implementation commented out - LandTile model not available
});

// @route   GET /api/land/tiles/:tileId
// @desc    Get a specific land tile
// @access  Public
router.get('/tiles/:tileId', async (req, res) => {
  // Implementation commented out - LandTile model not available
});

// @route   GET /api/land/my-tiles
// @desc    Get user's owned land tiles
// @access  Private
router.get('/my-tiles', thirdwebAuth, async (req: ThirdwebAuthRequest, res) => {
  // Implementation commented out - LandTile model not available
});

// @route   POST /api/land/tiles/:tileId/purchase
// @desc    Purchase a land tile
// @access  Private
router.post('/tiles/:tileId/purchase', thirdwebAuth, async (req: ThirdwebAuthRequest, res) => {
  // Implementation commented out - LandTile model not available
});

// @route   GET /api/land/nearby
// @desc    Get land tiles near a location (using PostGIS)
// @access  Public
router.get('/nearby', async (req, res) => {
  // Implementation commented out - PostGIS not available
});
*/

export default router;
