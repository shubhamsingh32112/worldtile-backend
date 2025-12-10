import express from 'express';
import { authenticate, AuthRequest } from '../middleware/auth.middleware';
import LandTile from '../models/LandTile.model';
import { getSequelize } from '../config/postgis';
import { QueryTypes, Op } from 'sequelize';

const router = express.Router();

// @route   GET /api/land/tiles
// @desc    Get all land tiles
// @access  Public
router.get('/tiles', async (req, res) => {
  try {
    const { region, status, minPrice, maxPrice } = req.query;

    let whereClause: any = {};

    if (region) {
      whereClause.region = region;
    }

    if (status) {
      whereClause.status = status;
    }

    if (minPrice || maxPrice) {
      whereClause.price = {};
      if (minPrice) {
        whereClause.price[Op.gte] = parseFloat(minPrice as string);
      }
      if (maxPrice) {
        whereClause.price[Op.lte] = parseFloat(maxPrice as string);
      }
    }

    const tiles = await LandTile.findAll({
      where: whereClause,
      order: [['createdAt', 'DESC']],
    });

    res.status(200).json({
      success: true,
      count: tiles.length,
      tiles: tiles.map((tile) => ({
        id: tile.id,
        tileId: tile.tileId,
        coordinates: tile.coordinates,
        price: parseFloat(tile.price.toString()),
        region: tile.region,
        status: tile.status,
        ownerId: tile.ownerId,
        metadata: tile.metadata,
      })),
    });
  } catch (error: any) {
    console.error('Get tiles error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
});

// @route   GET /api/land/tiles/:tileId
// @desc    Get a specific land tile
// @access  Public
router.get('/tiles/:tileId', async (req, res) => {
  try {
    const { tileId } = req.params;

    const tile = await LandTile.findOne({
      where: { tileId },
    });

    if (!tile) {
      return res.status(404).json({
        success: false,
        message: 'Land tile not found',
      });
    }

    res.status(200).json({
      success: true,
      tile: {
        id: tile.id,
        tileId: tile.tileId,
        coordinates: tile.coordinates,
        price: parseFloat(tile.price.toString()),
        region: tile.region,
        status: tile.status,
        ownerId: tile.ownerId,
        metadata: tile.metadata,
      },
    });
  } catch (error: any) {
    console.error('Get tile error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
});

// @route   GET /api/land/my-tiles
// @desc    Get user's owned land tiles
// @access  Private
router.get('/my-tiles', authenticate, async (req: AuthRequest, res) => {
  try {
    const tiles = await LandTile.findAll({
      where: { ownerId: req.user!.id },
      order: [['createdAt', 'DESC']],
    });

    res.status(200).json({
      success: true,
      count: tiles.length,
      tiles: tiles.map((tile) => ({
        id: tile.id,
        tileId: tile.tileId,
        coordinates: tile.coordinates,
        price: parseFloat(tile.price.toString()),
        region: tile.region,
        status: tile.status,
        metadata: tile.metadata,
      })),
    });
  } catch (error: any) {
    console.error('Get my tiles error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
});

// @route   POST /api/land/tiles/:tileId/purchase
// @desc    Purchase a land tile
// @access  Private
router.post(
  '/tiles/:tileId/purchase',
  authenticate,
  async (req: AuthRequest, res) => {
    try {
      const { tileId } = req.params;
      const userId = req.user!.id;

      const tile = await LandTile.findOne({
        where: { tileId },
      });

      if (!tile) {
        return res.status(404).json({
          success: false,
          message: 'Land tile not found',
        });
      }

      if (tile.status !== 'available') {
        return res.status(400).json({
          success: false,
          message: 'This land tile is not available for purchase',
        });
      }

      // Update tile ownership
      await tile.update({
        ownerId: userId,
        status: 'owned',
      });

      res.status(200).json({
        success: true,
        message: 'Land tile purchased successfully',
        tile: {
          id: tile.id,
          tileId: tile.tileId,
          coordinates: tile.coordinates,
          price: parseFloat(tile.price.toString()),
          region: tile.region,
          status: tile.status,
        },
      });
    } catch (error: any) {
      console.error('Purchase tile error:', error);
      res.status(500).json({
        success: false,
        message: 'Server error',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined,
      });
    }
  }
);

// @route   GET /api/land/nearby
// @desc    Get land tiles near a location (using PostGIS)
// @access  Public
router.get('/nearby', async (req, res) => {
  try {
    const { lat, lng, radius = 1000 } = req.query;

    if (!lat || !lng) {
      return res.status(400).json({
        success: false,
        message: 'Latitude and longitude are required',
      });
    }

    const sequelize = getSequelize();
    const query = `
      SELECT 
        id,
        "tileId",
        coordinates,
        price,
        region,
        status,
        "ownerId",
        metadata,
        ST_AsGeoJSON(location) as location
      FROM land_tiles
      WHERE ST_DWithin(
        location::geography,
        ST_SetSRID(ST_MakePoint(:lng, :lat), 4326)::geography,
        :radius
      )
      ORDER BY ST_Distance(
        location::geography,
        ST_SetSRID(ST_MakePoint(:lng, :lat), 4326)::geography
      )
      LIMIT 50
    `;

    const tiles = await sequelize.query(query, {
      replacements: {
        lat: parseFloat(lat as string),
        lng: parseFloat(lng as string),
        radius: parseInt(radius as string),
      },
      type: QueryTypes.SELECT,
    });

    res.status(200).json({
      success: true,
      count: tiles.length,
      tiles,
    });
  } catch (error: any) {
    console.error('Get nearby tiles error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
});

export default router;

