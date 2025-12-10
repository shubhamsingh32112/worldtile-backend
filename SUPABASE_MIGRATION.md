# Supabase PostgreSQL Migration Guide

This document outlines the changes made to migrate from local PostgreSQL to Supabase PostgreSQL.

## What Changed

### 1. Database Configuration (`src/config/postgis.ts`)
- **Added support for Supabase connection string**: The configuration now accepts `SUPABASE_DB_URL` environment variable
- **SSL support**: Automatic SSL configuration for Supabase connections
- **Backward compatibility**: Still supports individual PostgreSQL parameters for local development
- **Better error handling**: Improved error messages and connection status checks

### 2. Model Initialization (`src/models/LandTile.model.ts`)
- **Fixed initialization order**: Model now uses lazy initialization to prevent errors when imported before database connection
- **Proxy pattern**: Ensures model is initialized before use
- **Explicit initialization function**: `initializeLandTileModel()` can be called explicitly after connection

### 3. Server Startup (`src/server.ts`)
- **Explicit model initialization**: Models are now initialized after database connection is established
- **Better startup sequence**: Ensures proper initialization order

### 4. Environment Variables
- **New variable**: `SUPABASE_DB_URL` - Full Supabase connection string
- **New variable**: `SUPABASE_SSL` - SSL configuration (default: true)
- **Backward compatible**: Old PostgreSQL variables still work for local development

## Migration Steps

### Step 1: Get Your Supabase Connection String

1. Go to [supabase.com](https://supabase.com) and create/login to your account
2. Create a new project or select an existing one
3. Navigate to **Project Settings** > **Database**
4. Under **Connection String**, select **URI**
5. Copy the connection string (format: `postgresql://postgres:[YOUR-PASSWORD]@[PROJECT-REF].supabase.co:5432/postgres`)
6. Replace `[YOUR-PASSWORD]` with your actual database password

### Step 2: Update Environment Variables

Update your `.env` file in the `backend/` directory:

```env
# Remove or comment out old PostgreSQL variables:
# POSTGRES_HOST=localhost
# POSTGRES_PORT=5432
# POSTGRES_DB=worldtile
# POSTGRES_USER=postgres
# POSTGRES_PASSWORD=postgres

# Add Supabase connection string:
SUPABASE_DB_URL=postgresql://postgres:your-password@your-project-ref.supabase.co:5432/postgres
SUPABASE_SSL=true
```

### Step 3: Verify PostGIS Extension

Supabase has PostGIS enabled by default, but you can verify:

1. Go to Supabase Dashboard > SQL Editor
2. Run: `SELECT PostGIS_version();`
3. If it returns a version, PostGIS is enabled ✅

### Step 4: Test the Connection

1. Start your backend server: `npm run dev`
2. You should see: `✅ PostgreSQL + PostGIS connected successfully`
3. If you see errors, check:
   - Connection string is correct
   - Password is correct
   - Network allows connections to Supabase

## Benefits of Using Supabase

1. **Managed Service**: No need to manage PostgreSQL server
2. **PostGIS Pre-enabled**: Geographic extensions ready to use
3. **SSL by Default**: Secure connections out of the box
4. **Free Tier**: Generous free tier for development
5. **Easy Scaling**: Upgrade as your project grows
6. **Dashboard**: Visual database management interface
7. **Backups**: Automatic backups included

## Troubleshooting

### Connection Timeout
- Check your firewall settings
- Verify the connection string is correct
- Ensure your IP is not blocked (check Supabase dashboard)

### SSL Errors
- Set `SUPABASE_SSL=false` if you're having SSL issues (not recommended for production)
- Verify SSL certificates are up to date

### PostGIS Not Working
- PostGIS is enabled by default in Supabase
- If you see errors, contact Supabase support

### Model Initialization Errors
- Ensure `connectPostGIS()` is called before using models
- Check that `initializeLandTileModel()` is called in `server.ts`

## Rollback to Local PostgreSQL

If you need to rollback to local PostgreSQL:

1. Update `.env`:
   ```env
   # Remove Supabase variables
   # SUPABASE_DB_URL=...
   # SUPABASE_SSL=...

   # Add local PostgreSQL variables
   POSTGRES_HOST=localhost
   POSTGRES_PORT=5432
   POSTGRES_DB=worldtile
   POSTGRES_USER=postgres
   POSTGRES_PASSWORD=postgres
   ```

2. Ensure local PostgreSQL is running with PostGIS extension enabled

3. Restart the server

## Code Changes Summary

### Files Modified
- `src/config/postgis.ts` - Added Supabase support
- `src/models/LandTile.model.ts` - Fixed initialization order
- `src/server.ts` - Added explicit model initialization
- `src/utils/seed.ts` - Added model initialization

### Files Added
- `SUPABASE_MIGRATION.md` - This guide

### Files Updated (Documentation)
- `README.md` - Updated with Supabase instructions
- `backend/README.md` - Updated with Supabase instructions
- `SETUP.md` - Updated with Supabase setup steps

## Next Steps

1. ✅ Update your `.env` file with Supabase connection string
2. ✅ Test the connection
3. ✅ Run migrations if needed (Supabase will create tables on first use)
4. ✅ Seed initial data: `npm run seed`
5. ✅ Test all API endpoints

## Support

- [Supabase Documentation](https://supabase.com/docs)
- [Supabase Discord](https://discord.supabase.com)
- [PostGIS Documentation](https://postgis.net/documentation/)

