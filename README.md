# WorldTile Backend API

Node.js TypeScript backend for the WorldTile Metaverse application.

## Features

- User authentication (signup/login) with JWT tokens
- MongoDB for user data storage
- PostgreSQL + PostGIS for geospatial land tile data
- RESTful API endpoints
- Secure password hashing with bcrypt
- Input validation with express-validator

## Prerequisites

- Node.js (v18 or higher)
- MongoDB (running locally or connection string)
- Supabase PostgreSQL database (recommended) or PostgreSQL with PostGIS extension

## Installation

1. Install dependencies:
```bash
npm install
```

2. Create a `.env` file in the root directory:

**Option A: Using Supabase (Recommended)**
```env
PORT=3000
NODE_ENV=development
MONGODB_URI=mongodb://localhost:27017/worldtile
SUPABASE_DB_URL=postgresql://postgres:[YOUR-PASSWORD]@[PROJECT-REF].supabase.co:5432/postgres
SUPABASE_SSL=true
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production
JWT_EXPIRE=7d
CORS_ORIGIN=http://localhost:3000
```

**Option B: Using Local PostgreSQL**
```env
PORT=3000
NODE_ENV=development
MONGODB_URI=mongodb://localhost:27017/worldtile
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_DB=worldtile
POSTGRES_USER=postgres
POSTGRES_PASSWORD=postgres
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production
JWT_EXPIRE=7d
CORS_ORIGIN=http://localhost:3000

# Gmail OAuth2 Configuration (Optional - for sending deed emails)
# See EMAIL_SETUP.md for detailed setup instructions
GMAIL_USER=your-email@yourdomain.com
GMAIL_CLIENT_ID=your-client-id.apps.googleusercontent.com
GMAIL_CLIENT_SECRET=your-client-secret
GMAIL_REFRESH_TOKEN=your-refresh-token
```

3. **For Supabase Setup:**
   - Create a project at [supabase.com](https://supabase.com)
   - Go to Project Settings > Database > Connection String
   - Copy the connection string and replace `[YOUR-PASSWORD]` with your database password
   - PostGIS is enabled by default in Supabase

   **For Local PostgreSQL Setup:**
   ```sql
   -- Connect to PostgreSQL and create database
   CREATE DATABASE worldtile;

   -- Connect to the database and enable PostGIS
   \c worldtile
   CREATE EXTENSION IF NOT EXISTS postgis;
   ```

## Running the Server

### Development Mode
```bash
npm run dev
```

### Production Mode
```bash
npm run build
npm start
```

## API Endpoints

### Authentication

- `POST /api/auth/signup` - Register a new user
- `POST /api/auth/login` - Login user
- `GET /api/auth/me` - Get current user (requires authentication)

### Land Tiles

- `GET /api/land/tiles` - Get all land tiles
- `GET /api/land/tiles/:tileId` - Get a specific land tile
- `GET /api/land/my-tiles` - Get user's owned tiles (requires authentication)
- `POST /api/land/tiles/:tileId/purchase` - Purchase a land tile (requires authentication)
- `GET /api/land/nearby` - Get land tiles near a location (PostGIS query)

## Project Structure

```
backend/
├── src/
│   ├── config/          # Database configurations
│   ├── models/          # Data models (MongoDB & Sequelize)
│   ├── routes/          # API routes
│   ├── middleware/      # Custom middleware
│   └── server.ts        # Main server file
├── dist/                # Compiled JavaScript (generated)
├── package.json
├── tsconfig.json
└── README.md
```

## Email Service

The backend can automatically send email notifications with deed PDFs after successful NFT purchases. To enable this feature:

1. Follow the setup guide in [EMAIL_SETUP.md](./EMAIL_SETUP.md)
2. Configure the Gmail OAuth2 credentials in your `.env` file
3. Emails will be sent automatically when deeds are created

**Note**: Email sending is non-blocking - if email fails, it won't affect the payment processing flow.

## Technologies Used

- Express.js - Web framework
- TypeScript - Type safety
- MongoDB + Mongoose - User data
- Supabase PostgreSQL (or local PostgreSQL) + PostGIS + Sequelize - Geospatial land data
- JWT - Authentication
- bcryptjs - Password hashing
- express-validator - Input validation
- Puppeteer - PDF generation from HTML
- Nodemailer - Email sending via Gmail OAuth2

