import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import morgan from 'morgan'
import cookieParser from 'cookie-parser'
import dotenv from 'dotenv'
dotenv.config()
import { connectMongoDB } from './config/mongodb'
import polygonRoutes from './routes/polygon.routes'
import statesRoutes from './routes/states.routes'
import areasRoutes from './routes/areas.routes'
import ordersRoutes from './routes/orders.routes'
import userRoutes from './routes/user.routes'
import authRoutes from './routes/auth.routes'
import referralsRoutes from './routes/referrals.routes'
import deedsRoutes from './routes/deeds.routes'
import subscriptionsRoutes from './routes/subscriptions.routes'
import adminRoutes from './routes/admin.routes'
import supportRoutes from './routes/support.routes'

// Load environment variables


const app = express()

// Middleware
app.use(helmet())
// CORS configuration
const isDevelopment = process.env.NODE_ENV !== 'production'
const corsOriginEnv = process.env.CORS_ORIGIN

let allowedOrigins: string[] = []

if (corsOriginEnv) {
  // Use environment variable if set
  allowedOrigins = corsOriginEnv.split(',').map((origin) => origin.trim())
} else {
  // Default origins for development
  allowedOrigins = ['http://localhost:5173', 'http://localhost:3000']
}

// Always ensure localhost:5173 is allowed in development
if (isDevelopment && !allowedOrigins.includes('http://localhost:5173')) {
  allowedOrigins.push('http://localhost:5173')
}

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps or Postman)
      if (!origin) {
        return callback(null, true)
      }

      // In development without CORS_ORIGIN set, allow all origins
      if (isDevelopment && !corsOriginEnv) {
        return callback(null, true)
      }

      // Check if origin is in allowed list
      if (allowedOrigins.includes(origin)) {
        callback(null, true)
      } else {
        console.warn(`[CORS] Blocked origin: ${origin}. Allowed origins:`, allowedOrigins)
        callback(new Error('Not allowed by CORS'))
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  }),
)
app.use(morgan('dev'))
app.use(cookieParser())
// Custom logging middleware to track all incoming requests
app.use((req, _res, next) => {
  const clientIp =
    req.ip ||
    req.socket.remoteAddress ||
    req.headers['x-forwarded-for'] ||
    'unknown'
  console.log(`[REQUEST] ${req.method} ${req.path} from ${clientIp}`)
  next()
})
app.use(express.json())
app.use(express.urlencoded({ extended: true }))

// Middleware to ensure MongoDB connection (for serverless environments)
app.use(async (_req, _res, next) => {
  try {
    await connectMongoDB()
    next()
  } catch (error) {
    console.error('MongoDB connection error in middleware:', error)
    next(error)
  }
})

// Health check endpoint
app.get('/health', (req, res) => {
  const clientIp = req.ip || req.socket.remoteAddress || 'unknown'
  console.log(
    `[HEALTH] Request from: ${clientIp} (${
      req.headers['user-agent'] || 'unknown'
    })`,
  )
  res.status(200).json({
    status: 'OK',
    message: 'WorldTile API is running',
    timestamp: new Date().toISOString(),
    serverIp: req.socket.localAddress,
    clientIp: clientIp,
  })
})

// API health check endpoint (for Vercel/monitoring)
app.get('/api/health', (_req, res) => {
  res.status(200).json({
    status: 'ok',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  })
})

// API Routes
app.use('/api/auth', authRoutes)
app.use('/api/polygons', polygonRoutes)
app.use('/api/states', statesRoutes)
app.use('/api/areas', areasRoutes)
app.use('/api/orders', ordersRoutes)
app.use('/api/user', userRoutes)
app.use('/api/users', userRoutes) // Also mount at /api/users for /me and /add-referral endpoints
app.use('/api/referrals', referralsRoutes)
app.use('/api/deeds', deedsRoutes)
app.use('/api/subscriptions', subscriptionsRoutes)
app.use('/api/admin', adminRoutes)
app.use('/api/support', supportRoutes)

// 404 handler
app.use((_req, res) => {
  res.status(404).json({
    success: false,
    message: 'Route not found',
  })
})

const PORT = process.env.PORT || 3000

app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`)
})

// Error handler
app.use(
  (
    err: any,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
  ) => {
    const statusCode = err.statusCode || err.status || 500;
    
    // Treat 409 Conflict as a warning (normal occurrence, not an error)
    if (statusCode === 409) {
      console.warn(`[409] Slot conflict: ${err.message}`);
      const responseBody: any = {
        success: false,
        message: err.message || 'Conflict occurred',
      };
      
      if (err.meta) {
        responseBody.meta = err.meta;
      }
      
      return res.status(409).json(responseBody);
    }
    
    // Log other errors normally
    console.error('Error:', err);
    const responseBody: any = {
      success: false,
      message: err.message || 'Internal server error',
    };
    
    if (err.meta) {
      responseBody.meta = err.meta;
    }
    
    if (process.env.NODE_ENV === 'development') {
      responseBody.stack = err.stack;
    }
    
    return res.status(statusCode).json(responseBody);
  },
)

export default app
