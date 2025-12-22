import mongoose from 'mongoose';

// Cache the connection promise to avoid multiple connection attempts in serverless
let cachedConnection: Promise<typeof mongoose> | null = null;

export const connectMongoDB = async (): Promise<void> => {
  try {
    // If already connected, return early
    if (mongoose.connection.readyState === 1) {
      return;
    }

    // If connection is in progress, wait for it
    if (cachedConnection) {
      await cachedConnection;
      return;
    }

    const mongoUri = process.env.MONGODB_URI;
    
    if (!mongoUri) {
      throw new Error('MONGODB_URI is not defined in environment variables');
    }
    
    // Cache the connection promise
    cachedConnection = mongoose.connect(mongoUri);
    await cachedConnection;
    
    console.log('✅ MongoDB connected successfully');
    
    mongoose.connection.on('error', (err) => {
      console.error('MongoDB connection error:', err);
    });
    
    mongoose.connection.on('disconnected', () => {
      console.warn('MongoDB disconnected');
      cachedConnection = null; // Reset cache on disconnect
    });
  } catch (error) {
    cachedConnection = null; // Reset cache on error
    console.error('MongoDB connection failed:', error);
    throw error;
  }
};

export default connectMongoDB;

