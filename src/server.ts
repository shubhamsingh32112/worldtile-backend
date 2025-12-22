import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import dotenv from 'dotenv';
import { connectMongoDB } from './config/mongodb';
import authRoutes from './routes/auth.routes';
import polygonRoutes from './routes/polygon.routes';
import statesRoutes from './routes/states.routes';
import areasRoutes from './routes/areas.routes';
import ordersRoutes from './routes/orders.routes';
import userRoutes from './routes/user.routes';
import referralsRoutes from './routes/referrals.routes';
import deedsRoutes from './routes/deeds.routes';

// Load environment variables
dotenv.config();

const app = express();
const PORT = Number(process.env.PORT) || 3000;

// Middleware
app.use(helmet());
// CORS configuration - allow all origins in development for mobile device testing
const allowedOrigins = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(',').map((origin) => origin.trim())
  : ['http://localhost:5173', 'http://localhost:3000', '*']; // Default: allow Vite dev server and all origins

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps or Postman)
    if (!origin) return callback(null, true);
    
    // In development, allow all origins if CORS_ORIGIN is not set
    if (!process.env.CORS_ORIGIN && process.env.NODE_ENV !== 'production') {
      return callback(null, true);
    }
    
    // Check if origin is in allowed list
    if (allowedOrigins.includes(origin) || allowedOrigins.includes('*')) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.use(morgan('dev'));
// Custom logging middleware to track all incoming requests
app.use((req, _res, next) => {
  const clientIp = req.ip || req.socket.remoteAddress || req.headers['x-forwarded-for'] || 'unknown';
  console.log(`[REQUEST] ${req.method} ${req.path} from ${clientIp}`);
  next();
});
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health check endpoint
app.get('/health', (req, res) => {
  const clientIp = req.ip || req.socket.remoteAddress || 'unknown';
  console.log(`[HEALTH] Request from: ${clientIp} (${req.headers['user-agent'] || 'unknown'})`);
  res.status(200).json({
    status: 'OK',
    message: 'WorldTile API is running',
    timestamp: new Date().toISOString(),
    serverIp: req.socket.localAddress,
    clientIp: clientIp,
  });
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/polygons', polygonRoutes);
app.use('/api/states', statesRoutes);
app.use('/api/areas', areasRoutes);
app.use('/api/orders', ordersRoutes);
app.use('/api/user', userRoutes);
app.use('/api/users', userRoutes); // Also mount at /api/users for /me and /add-referral endpoints
app.use('/api/referrals', referralsRoutes);
app.use('/api/deeds', deedsRoutes);

// 404 handler
app.use((_req, res) => {
  res.status(404).json({
    success: false,
    message: 'Route not found',
  });
});

// Error handler
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('Error:', err);
  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Internal server error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
});

// Start server
const startServer = async () => {
  try {
    // Connect to MongoDB
    await connectMongoDB();

    // Listen on 0.0.0.0 to accept connections from other devices on the network
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`🚀 Server running on port ${PORT}`);
      console.log(`📡 Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log(`🌐 Server accessible at:`);
      console.log(`   - http://localhost:${PORT}`);
      console.log(`   - http://0.0.0.0:${PORT}`);
      console.log(`   - Use your computer's IP address for mobile devices`);
      console.log(`   - Example: http://192.168.1.XXX:${PORT}`);
      console.log(`✅ Lazy order expiry enabled (orders expire on access)`);
    });

    // Graceful shutdown
    process.on('SIGTERM', () => {
      console.log('SIGTERM received, shutting down gracefully...');
      process.exit(0);
    });

    process.on('SIGINT', () => {
      console.log('SIGINT received, shutting down gracefully...');
      process.exit(0);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

startServer();

export default app;

