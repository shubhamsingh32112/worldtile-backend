import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Deed from '../models/Deed.model';
import User from '../models/User.model';

// Load environment variables
dotenv.config();

/**
 * List deeds script
 * 
 * This script lists all deeds in the database with their IDs, landSlotIds, and user emails.
 * Useful for finding deed identifiers before sending emails.
 * 
 * Usage:
 *   npm run list:deeds
 *   npm run list:deeds [limit]  (default: 50)
 * 
 * Examples:
 *   npm run list:deeds
 *   npm run list:deeds 100
 */

const listDeeds = async () => {
  try {
    // Connect to MongoDB
    const mongoUri = process.env.MONGODB_URI;
    if (!mongoUri) {
      throw new Error('MONGODB_URI is not configured in environment variables');
    }

    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(mongoUri);
    console.log('✅ Connected to MongoDB\n');

    // Get limit from command line args (default: 50)
    const limitArg = process.argv[2];
    const limit = limitArg ? parseInt(limitArg, 10) : 50;

    if (isNaN(limit) || limit < 1) {
      console.error('❌ Error: Limit must be a positive number\n');
      await mongoose.disconnect();
      process.exit(1);
    }

    console.log(`📋 Fetching deeds (limit: ${limit})...\n`);

    // Find deeds with user email populated
    const deeds = await Deed.find({})
      .limit(limit)
      .sort({ createdAt: -1 })
      .lean();

    if (deeds.length === 0) {
      console.log('❌ No deeds found in database');
      await mongoose.disconnect();
      process.exit(0);
    }

    // Get user emails for all deeds
    const userIds = [...new Set(deeds.map((d) => d.userId.toString()))];
    const users = await User.find({ _id: { $in: userIds } })
      .select('_id email name fullName')
      .lean();

    const userMap = new Map(users.map((u) => [u._id.toString(), u]));

    console.log(`✅ Found ${deeds.length} deed(s)\n`);
    console.log('═'.repeat(120));
    console.log(
      `${'ID'.padEnd(26)} | ${'Land Slot ID'.padEnd(30)} | ${'City'.padEnd(20)} | ${'Owner'.padEnd(20)} | Email`
    );
    console.log('═'.repeat(120));

    for (const deed of deeds) {
      const user = userMap.get(deed.userId.toString());
      const email = user?.email || '❌ No email';
      const ownerName = deed.ownerName || 'N/A';
      const city = (deed.city || 'N/A').substring(0, 20);
      const landSlotId = deed.landSlotId.substring(0, 30);
      const id = deed._id.toString();

      console.log(
        `${id.padEnd(26)} | ${landSlotId.padEnd(30)} | ${city.padEnd(20)} | ${ownerName.padEnd(20)} | ${email}`
      );
    }

    console.log('═'.repeat(120));
    console.log(`\n📊 Summary: ${deeds.length} deed(s) listed`);
    
    const deedsWithEmail = deeds.filter((d) => {
      const user = userMap.get(d.userId.toString());
      return user?.email;
    });
    const deedsWithoutEmail = deeds.length - deedsWithEmail.length;

    console.log(`   ✅ ${deedsWithEmail.length} deed(s) with user email`);
    if (deedsWithoutEmail > 0) {
      console.log(`   ⚠️  ${deedsWithoutEmail} deed(s) without user email`);
    }

    console.log('\n💡 To send an email for a deed, use:');
    console.log('   npm run send:deed-email <deedId or landSlotId>');
    console.log('\nExamples:');
    if (deeds.length > 0) {
      console.log(`   npm run send:deed-email ${deeds[0]._id}`);
      console.log(`   npm run send:deed-email ${deeds[0].landSlotId}`);
    }

    // Disconnect
    await mongoose.disconnect();
    process.exit(0);
  } catch (error: any) {
    console.error('');
    console.error('❌ Script failed:', error.message);
    if (error.stack) {
      console.error('\nStack trace:');
      console.error(error.stack);
    }
    await mongoose.disconnect().catch(() => {
      // Ignore disconnect errors
    });
    process.exit(1);
  }
};

// Run script if called directly
if (require.main === module) {
  listDeeds();
}

export default listDeeds;

