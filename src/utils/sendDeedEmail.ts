import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Deed from '../models/Deed.model';
import User from '../models/User.model';
import { EmailService } from '../services/email.service';

// Load environment variables
dotenv.config();

/**
 * Send deed email script
 * 
 * This script sends deed PDF emails to users who already have deeds.
 * You can send emails one at a time by specifying a deed ID or landSlotId.
 * 
 * Required Environment Variables:
 * - MONGODB_URI: MongoDB connection string
 * - GMAIL_USER: Gmail address for sending emails
 * - GMAIL_CLIENT_ID: Gmail OAuth2 Client ID
 * - GMAIL_CLIENT_SECRET: Gmail OAuth2 Client Secret
 * - GMAIL_REFRESH_TOKEN: Gmail OAuth2 Refresh Token
 * 
 * Usage:
 *   npm run send:deed-email [deedId or landSlotId]
 * 
 * Examples:
 *   npm run send:deed-email 507f1f77bcf86cd799439011
 *   npm run send:deed-email karnataka_jp_nagar_002
 * 
 * To find a deed, you can:
 * - Use the deed's MongoDB _id (24 character hex string)
 * - Use the deed's landSlotId (e.g., karnataka_jp_nagar_002)
 */

const sendDeedEmail = async () => {
  try {
    // Validate required environment variables for email
    const requiredEnvVars = [
      'GMAIL_USER',
      'GMAIL_CLIENT_ID',
      'GMAIL_CLIENT_SECRET',
      'GMAIL_REFRESH_TOKEN',
    ];

    const missingVars = requiredEnvVars.filter((varName) => !process.env[varName]);
    if (missingVars.length > 0) {
      throw new Error(
        `Missing required environment variables: ${missingVars.join(', ')}\n` +
        'Please configure Gmail OAuth2 credentials. See EMAIL_SETUP.md for details.'
      );
    }

    // Connect to MongoDB
    const mongoUri = process.env.MONGODB_URI;
    if (!mongoUri) {
      throw new Error('MONGODB_URI is not configured in environment variables');
    }

    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(mongoUri);
    console.log('✅ Connected to MongoDB\n');

    // Get deed identifier from command line args
    const deedIdentifier = process.argv[2];

    if (!deedIdentifier) {
      console.error('❌ Error: Please provide a deed ID or landSlotId\n');
      console.log('Usage:');
      console.log('  npm run send:deed-email <deedId or landSlotId>\n');
      console.log('Examples:');
      console.log('  npm run send:deed-email 507f1f77bcf86cd799439011');
      console.log('  npm run send:deed-email karnataka_jp_nagar_002\n');
      console.log('To find deeds, query your MongoDB database or check your admin panel.');
      await mongoose.disconnect();
      process.exit(1);
    }

    // Try to find deed by ID first, then by landSlotId
    let deed = null;
    
    // Check if it looks like a MongoDB ObjectId (24 hex characters)
    if (/^[0-9a-fA-F]{24}$/.test(deedIdentifier)) {
      console.log(`🔍 Looking for deed by ID: ${deedIdentifier}`);
      deed = await Deed.findById(deedIdentifier);
    }
    
    // If not found, try by landSlotId
    if (!deed) {
      console.log(`🔍 Looking for deed by landSlotId: ${deedIdentifier}`);
      deed = await Deed.findOne({ landSlotId: deedIdentifier });
    }

    if (!deed) {
      console.error(`❌ Deed not found: ${deedIdentifier}`);
      console.log('\n💡 Tips:');
      console.log('  - Make sure the deed ID or landSlotId is correct');
      console.log('  - Use MongoDB _id (24 hex characters) or landSlotId (e.g., karnataka_jp_nagar_002)');
      await mongoose.disconnect();
      process.exit(1);
    }

    console.log(`✅ Found deed:`);
    console.log(`   - Land Slot ID: ${deed.landSlotId}`);
    console.log(`   - Plot ID: ${deed.plotId}`);
    console.log(`   - City: ${deed.city}`);
    console.log(`   - Owner: ${deed.ownerName}`);
    console.log(`   - Seal Number: ${deed.sealNo}`);
    console.log('');

    // Get user information
    const user = await User.findById(deed.userId);
    if (!user) {
      console.error(`❌ User not found for deed (userId: ${deed.userId})`);
      await mongoose.disconnect();
      process.exit(1);
    }

    // Check if user has email
    if (!user.email) {
      console.error(`❌ User does not have an email address`);
      console.log(`   User ID: ${user._id}`);
      console.log(`   User Name: ${user.name || 'N/A'}`);
      console.log('\n💡 This user cannot receive emails. Please add an email to their account first.');
      await mongoose.disconnect();
      process.exit(1);
    }

    console.log(`📧 Preparing to send email to: ${user.email}`);
    console.log(`   User: ${user.name || user.fullName || 'N/A'}\n`);

    // Send email
    try {
      console.log('📨 Sending email...');
      await EmailService.sendDeedEmail(deed, user.email, user.name || user.fullName || 'Valued Customer');
      console.log('');
      console.log('✅ Email sent successfully!');
      console.log(`   Recipient: ${user.email}`);
      console.log(`   Deed: ${deed.landSlotId}`);
      console.log(`   PDF: WorldTile_Deed_${deed.landSlotId}.pdf`);
    } catch (emailError: any) {
      console.error('');
      console.error('❌ Failed to send email:');
      console.error(`   Error: ${emailError.message}`);
      console.error('');
      console.error('💡 Troubleshooting:');
      console.error('   - Check that Gmail OAuth2 credentials are correct');
      console.error('   - Verify that the refresh token is valid');
      console.error('   - Ensure Gmail API is enabled in Google Cloud Console');
      console.error('   - See EMAIL_SETUP.md for detailed setup instructions');
      await mongoose.disconnect();
      process.exit(1);
    }

    // Disconnect
    await mongoose.disconnect();
    console.log('\n✅ Script completed successfully');
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
  sendDeedEmail();
}

export default sendDeedEmail;

