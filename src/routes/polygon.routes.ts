import express from 'express';
import { body, validationResult } from 'express-validator';
import { thirdwebAuth, ThirdwebAuthRequest } from '../middleware/thirdwebAuth.middleware';
import Polygon from '../models/Polygon.model';

const router = express.Router();

// @route   POST /api/polygons
// @desc    Create a new polygon for the authenticated user
// @access  Private
router.post(
  '/',
  thirdwebAuth,
  [
    body('geometry')
      .isObject()
      .withMessage('Geometry is required')
      .custom((value) => {
        if (value.type !== 'Polygon') {
          throw new Error('Geometry type must be Polygon');
        }
        if (!Array.isArray(value.coordinates) || value.coordinates.length === 0) {
          throw new Error('Invalid coordinates format');
        }
        if (!Array.isArray(value.coordinates[0]) || value.coordinates[0].length < 4) {
          throw new Error('Polygon must have at least 4 points');
        }
        return true;
      }),
    body('areaInAcres')
      .isFloat({ min: 0 })
      .withMessage('Area must be a positive number'),
    body('name')
      .optional()
      .isString()
      .trim()
      .isLength({ max: 100 })
      .withMessage('Name cannot exceed 100 characters'),
    body('description')
      .optional()
      .isString()
      .trim()
      .isLength({ max: 500 })
      .withMessage('Description cannot exceed 500 characters'),
  ],
  async (req: ThirdwebAuthRequest, res: express.Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors: errors.array(),
        });
        return;
      }

      const { geometry, areaInAcres, name, description } = req.body;
      if (!req.user) {
        res.status(401).json({
          success: false,
          message: 'User not found. Please ensure you are logged in.',
        });
        return;
      }
      const userId = req.user.id;

      const polygon = new Polygon({
        userId,
        geometry,
        areaInAcres,
        name,
        description,
      });

      await polygon.save();

      res.status(201).json({
        success: true,
        message: 'Polygon created successfully',
        polygon: {
          id: polygon._id.toString(),
          userId: polygon.userId.toString(),
          name: polygon.name,
          description: polygon.description,
          geometry: polygon.geometry,
          areaInAcres: polygon.areaInAcres,
          createdAt: polygon.createdAt,
          updatedAt: polygon.updatedAt,
        },
      });
    } catch (error: any) {
      console.error('Create polygon error:', error);
      res.status(500).json({
        success: false,
        message: 'Server error',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined,
      });
    }
  }
);

// @route   GET /api/polygons/nearby
// @desc    Get polygons near a location (using MongoDB geospatial query)
// @access  Public
// NOTE: This route must be defined before /:id to avoid route conflicts
router.get('/nearby', async (req: express.Request, res: express.Response): Promise<void> => {
  try {
    const { lat, lng, radius = 1000 } = req.query;

    if (!lat || !lng) {
      res.status(400).json({
        success: false,
        message: 'Latitude and longitude are required',
      });
      return;
    }

    const latitude = parseFloat(lat as string);
    const longitude = parseFloat(lng as string);
    const radiusInMeters = parseInt(radius as string);

    // MongoDB geospatial query using $near
    const polygons = await Polygon.find({
      geometry: {
        $near: {
          $geometry: {
            type: 'Point',
            coordinates: [longitude, latitude], // GeoJSON format: [lng, lat]
          },
          $maxDistance: radiusInMeters,
        },
      },
    })
      .limit(50)
      .sort({ createdAt: -1 })
      .select('-__v');

    res.status(200).json({
      success: true,
      count: polygons.length,
      polygons: polygons.map((polygon) => ({
        id: polygon._id.toString(),
        userId: polygon.userId.toString(),
        name: polygon.name,
        description: polygon.description,
        geometry: polygon.geometry,
        areaInAcres: polygon.areaInAcres,
        createdAt: polygon.createdAt,
        updatedAt: polygon.updatedAt,
      })),
    });
  } catch (error: any) {
    console.error('Get nearby polygons error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
});

// @route   GET /api/polygons
// @desc    Get all polygons for the authenticated user
// @access  Private
router.get('/', thirdwebAuth, async (req: ThirdwebAuthRequest, res: express.Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({
        success: false,
        message: 'User not found. Please ensure you are logged in.',
      });
      return;
    }
    const userId = req.user.id;

    const polygons = await Polygon.find({ userId })
      .sort({ createdAt: -1 })
      .select('-__v');

    res.status(200).json({
      success: true,
      count: polygons.length,
      polygons: polygons.map((polygon) => ({
        id: polygon._id.toString(),
        userId: polygon.userId.toString(),
        name: polygon.name,
        description: polygon.description,
        geometry: polygon.geometry,
        areaInAcres: polygon.areaInAcres,
        createdAt: polygon.createdAt,
        updatedAt: polygon.updatedAt,
      })),
    });
  } catch (error: any) {
    console.error('Get polygons error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
});

// @route   GET /api/polygons/:id
// @desc    Get a specific polygon by ID
// @access  Private
router.get('/:id', thirdwebAuth, async (req: ThirdwebAuthRequest, res: express.Response): Promise<void> => {
  try {
    const { id } = req.params;
    if (!req.user) {
      res.status(401).json({
        success: false,
        message: 'User not found. Please ensure you are logged in.',
      });
      return;
    }
    const userId = req.user.id;

    const polygon = await Polygon.findOne({ _id: id, userId });

    if (!polygon) {
      res.status(404).json({
        success: false,
        message: 'Polygon not found',
      });
      return;
    }

    res.status(200).json({
      success: true,
      polygon: {
        id: polygon._id.toString(),
        userId: polygon.userId.toString(),
        name: polygon.name,
        description: polygon.description,
        geometry: polygon.geometry,
        areaInAcres: polygon.areaInAcres,
        createdAt: polygon.createdAt,
        updatedAt: polygon.updatedAt,
      },
    });
  } catch (error: any) {
    console.error('Get polygon error:', error);
    if (error.name === 'CastError') {
      res.status(400).json({
        success: false,
        message: 'Invalid polygon ID',
      });
      return;
    }
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
});

// @route   PUT /api/polygons/:id
// @desc    Update a polygon
// @access  Private
router.put(
  '/:id',
  thirdwebAuth,
  [
    body('geometry')
      .optional()
      .isObject()
      .custom((value) => {
        if (value.type !== 'Polygon') {
          throw new Error('Geometry type must be Polygon');
        }
        if (!Array.isArray(value.coordinates) || value.coordinates.length === 0) {
          throw new Error('Invalid coordinates format');
        }
        return true;
      }),
    body('areaInAcres')
      .optional()
      .isFloat({ min: 0 })
      .withMessage('Area must be a positive number'),
    body('name')
      .optional()
      .isString()
      .trim()
      .isLength({ max: 100 })
      .withMessage('Name cannot exceed 100 characters'),
    body('description')
      .optional()
      .isString()
      .trim()
      .isLength({ max: 500 })
      .withMessage('Description cannot exceed 500 characters'),
  ],
  async (req: ThirdwebAuthRequest, res: express.Response): Promise<void> => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors: errors.array(),
        });
        return;
      }

      const { id } = req.params;
      if (!req.user) {
      res.status(401).json({
        success: false,
        message: 'User not found. Please ensure you are logged in.',
      });
      return;
    }
    const userId = req.user.id;
      const updateData = req.body;

      const polygon = await Polygon.findOne({ _id: id, userId });

      if (!polygon) {
        res.status(404).json({
          success: false,
          message: 'Polygon not found',
        });
        return;
      }

      // Update fields
      if (updateData.geometry) polygon.geometry = updateData.geometry;
      if (updateData.areaInAcres !== undefined) polygon.areaInAcres = updateData.areaInAcres;
      if (updateData.name !== undefined) polygon.name = updateData.name;
      if (updateData.description !== undefined) polygon.description = updateData.description;

      await polygon.save();

      res.status(200).json({
        success: true,
        message: 'Polygon updated successfully',
        polygon: {
          id: polygon._id.toString(),
          userId: polygon.userId.toString(),
          name: polygon.name,
          description: polygon.description,
          geometry: polygon.geometry,
          areaInAcres: polygon.areaInAcres,
          createdAt: polygon.createdAt,
          updatedAt: polygon.updatedAt,
        },
      });
    } catch (error: any) {
      console.error('Update polygon error:', error);
      if (error.name === 'CastError') {
        res.status(400).json({
          success: false,
          message: 'Invalid polygon ID',
        });
        return;
      }
      res.status(500).json({
        success: false,
        message: 'Server error',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined,
      });
    }
  }
);

// @route   DELETE /api/polygons/:id
// @desc    Delete a polygon
// @access  Private
router.delete('/:id', thirdwebAuth, async (req: ThirdwebAuthRequest, res: express.Response): Promise<void> => {
  try {
    const { id } = req.params;
    if (!req.user) {
      res.status(401).json({
        success: false,
        message: 'User not found. Please ensure you are logged in.',
      });
      return;
    }
    const userId = req.user.id;

    const polygon = await Polygon.findOneAndDelete({ _id: id, userId });

    if (!polygon) {
      res.status(404).json({
        success: false,
        message: 'Polygon not found',
      });
      return;
    }

    res.status(200).json({
      success: true,
      message: 'Polygon deleted successfully',
    });
  } catch (error: any) {
    console.error('Delete polygon error:', error);
    if (error.name === 'CastError') {
      res.status(400).json({
        success: false,
        message: 'Invalid polygon ID',
      });
      return;
    }
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
});

export default router;

