import dotenv from "dotenv";
import { connectMongoDB } from "../config/mongodb";
import { PaymentVerificationService } from "../services/paymentVerification.service";

// Load environment variables
dotenv.config();

(async function () {
  try {
    // Connect to MongoDB
    console.log("🔌 Connecting to MongoDB...");
    await connectMongoDB();
    console.log("✅ MongoDB connected");

    // Replace with an existing PAID order ID from your database
    const testOrderId = process.env.TEST_ORDER_ID || "694bffc0282e73916c7f0076";

    // Note: Order ID validation is handled in sendDeedEmailsForOrder

    console.log("🔁 Testing deed email for order:", testOrderId);
    
    // Method 1: Send emails for an existing paid order (recommended for testing)
    // This will send emails for all deeds associated with the order
    await PaymentVerificationService.sendDeedEmailsForOrder(testOrderId);
    
    console.log("✅ Email test completed successfully");
  } catch (err: any) {
    console.error("❌ Failed:", err.message);
    if (err.stack) {
      console.error(err.stack);
    }
    process.exit(1);
  } finally {
    // Close MongoDB connection
    const mongoose = await import("mongoose");
    await mongoose.default.connection.close();
    console.log("🔌 MongoDB connection closed");
    process.exit(0);
  }
})();

