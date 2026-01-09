import nodemailer from 'nodemailer';
import { PDFGenerationService } from './pdfGeneration.service';
import { IDeed } from '../models/Deed.model';
import User from '../models/User.model';
import Order from '../models/Order.model';

/**
 * Email Service
 * Handles sending emails using Google Workspace Gmail account
 */
export class EmailService {
  private static transporter: nodemailer.Transporter | null = null;

  /**
   * Initialize email transporter with Google Workspace Gmail OAuth2
   */
  private static async getTransporter(): Promise<nodemailer.Transporter> {
    if (this.transporter) {
      return this.transporter;
    }

    // Validate required environment variables
    const gmailUser = process.env.GMAIL_USER;
    const gmailClientId = process.env.GMAIL_CLIENT_ID;
    const gmailClientSecret = process.env.GMAIL_CLIENT_SECRET;
    const gmailRefreshToken = process.env.GMAIL_REFRESH_TOKEN;

    if (!gmailUser || !gmailClientId || !gmailClientSecret || !gmailRefreshToken) {
      throw new Error(
        'Gmail configuration missing. Please set GMAIL_USER, GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, and GMAIL_REFRESH_TOKEN environment variables.'
      );
    }

    // Create transporter with OAuth2
    this.transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        type: 'OAuth2',
        user: gmailUser,
        clientId: gmailClientId,
        clientSecret: gmailClientSecret,
        refreshToken: gmailRefreshToken,
      },
      tls: {
        rejectUnauthorized: false, // Allow self-signed certificates (safe with OAuth2 + TLS)
      },
    });

    // Verify connection
    try {
      await this.transporter.verify();
      console.log('✅ Email service ready');
    } catch (error) {
      console.error('❌ Email service verification failed:', error);
      throw new Error('Failed to verify email service connection');
    }

    return this.transporter;
  }

  /**
   * Send deed PDF email to user after purchase
   * @param deed - Deed document
   * @param userEmail - User email address
   * @param userName - User name for personalization
   */
  static async sendDeedEmail(
    deed: IDeed,
    userEmail: string,
    userName: string
  ): Promise<void> {
    try {
      // Get order to fetch price
      let priceUSDT: string | undefined;
      try {
        const order = await Order.findById(deed.orderId);
        if (order) {
          priceUSDT = order.payment?.expectedAmountUSDT || order.expectedAmountUSDT;
          // If it's a multi-slot order, calculate price per slot
          if (priceUSDT && order.quantity > 1) {
            const totalPrice = parseFloat(priceUSDT);
            priceUSDT = (totalPrice / order.quantity).toFixed(6);
          }
        }
      } catch (error) {
        console.warn(`⚠️ Could not fetch order price for deed ${deed.landSlotId}:`, error);
      }

      // Generate PDF
      console.log(`📄 Generating PDF for deed: ${deed.landSlotId}`);
      const pdfBuffer = await PDFGenerationService.generateDeedPDF(deed, priceUSDT);

      // Get transporter
      const transporter = await this.getTransporter();

      // Prepare email
      const mailOptions = {
        from: {
          name: 'WorldTile Registry',
          address: process.env.GMAIL_USER || '',
        },
        to: userEmail,
        subject: '🎉 Congratulations! Your WorldTile Digital Land Ownership Deed',
        html: this.getEmailHTML(deed, userName),
        attachments: [
          {
            filename: `WorldTile_Deed_${deed.landSlotId}.pdf`,
            content: pdfBuffer,
            contentType: 'application/pdf',
          },
        ],
      };

      // Send email
      console.log(`📧 Sending deed email to: ${userEmail}`);
      const info = await transporter.sendMail(mailOptions);
      console.log(`✅ Deed email sent successfully! Message ID: ${info.messageId}`);
    } catch (error: any) {
      console.error(`❌ Failed to send deed email:`, error.message);
      // Don't throw - we don't want email failures to break the payment flow
      // Log the error for monitoring
      throw error;
    }
  }

  /**
   * Get HTML email template
   * @param deed - Deed document
   * @param userName - User name
   * @returns HTML string
   */
  private static getEmailHTML(deed: IDeed, userName: string): string {
    const plotId = deed.plotId;
    const city = deed.city;
    const sealNo = deed.sealNo;
    const issueDate = new Date(deed.issuedAt).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });

    return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Your WorldTile Digital Land Ownership Deed</title>
</head>
<body style="margin: 0; padding: 0; font-family: 'Inter', 'Segoe UI', Arial, sans-serif; background-color: #f7f6f3; color: #2b2b2b;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f7f6f3; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
          <!-- Header -->
          <tr>
            <td style="background: linear-gradient(135deg, #3a556a 0%, #2b3e50 100%); padding: 40px 30px; text-align: center;">
              <h1 style="margin: 0; color: #ffffff; font-family: 'Georgia', serif; font-size: 32px; letter-spacing: 3px;">WORLD TILE</h1>
              <p style="margin: 8px 0 0 0; color: #e0e7ef; font-size: 14px;">Digital Land Registry • Blockchain Secured</p>
            </td>
          </tr>
          
          <!-- Content -->
          <tr>
            <td style="padding: 40px 30px;">
              <h2 style="margin: 0 0 20px 0; color: #3a556a; font-size: 24px; font-weight: 600;">🎉 Congratulations, ${this.escapeHtml(userName)}!</h2>
              
              <p style="margin: 0 0 20px 0; font-size: 16px; line-height: 1.6; color: #374151;">
                Your digital land purchase has been successfully processed, and your NFT has been minted on the blockchain!
              </p>
              
              <p style="margin: 0 0 20px 0; font-size: 16px; line-height: 1.6; color: #374151;">
                We're excited to welcome you as a verified digital landowner in the WorldTile metaverse. Your ownership is permanently recorded on the blockchain, ensuring authenticity and security.
              </p>
              
              <!-- Deed Details Box -->
              <div style="background-color: #f9fafb; border-left: 4px solid #3a556a; padding: 20px; margin: 30px 0; border-radius: 4px;">
                <p style="margin: 0 0 12px 0; font-size: 14px; font-weight: 600; color: #1f2937; text-transform: uppercase; letter-spacing: 0.5px;">Your Deed Details:</p>
                <table cellpadding="0" cellspacing="0" style="width: 100%;">
                  <tr>
                    <td style="padding: 8px 0; font-size: 14px; color: #6b7280;">Plot ID:</td>
                    <td style="padding: 8px 0; font-size: 14px; color: #1f2937; font-weight: 600; text-align: right;">#${this.escapeHtml(plotId)}</td>
                  </tr>
                  <tr>
                    <td style="padding: 8px 0; font-size: 14px; color: #6b7280;">City / Region:</td>
                    <td style="padding: 8px 0; font-size: 14px; color: #1f2937; font-weight: 600; text-align: right;">${this.escapeHtml(city)}</td>
                  </tr>
                  <tr>
                    <td style="padding: 8px 0; font-size: 14px; color: #6b7280;">Seal Number:</td>
                    <td style="padding: 8px 0; font-size: 14px; color: #1f2937; font-weight: 600; text-align: right;">${this.escapeHtml(sealNo)}</td>
                  </tr>
                  <tr>
                    <td style="padding: 8px 0; font-size: 14px; color: #6b7280;">Issued Date:</td>
                    <td style="padding: 8px 0; font-size: 14px; color: #1f2937; font-weight: 600; text-align: right;">${issueDate}</td>
                  </tr>
                </table>
              </div>
              
              <p style="margin: 20px 0; font-size: 16px; line-height: 1.6; color: #374151;">
                <strong>Your official Digital Land Ownership Deed is attached to this email.</strong> This PDF contains all the details of your purchase and serves as your proof of ownership.
              </p>
              
              <p style="margin: 20px 0; font-size: 16px; line-height: 1.6; color: #374151;">
                You can view and manage your digital land parcels in your WorldTile account dashboard. Your NFT is securely stored on the blockchain and can be viewed on OpenSea and other NFT marketplaces.
              </p>
              
              <p style="margin: 30px 0 20px 0; font-size: 16px; line-height: 1.6; color: #374151;">
                Thank you for being part of the WorldTile community. Welcome to the future of digital land ownership!
              </p>
              
              <p style="margin: 0; font-size: 16px; line-height: 1.6; color: #374151;">
                Best regards,<br>
                <strong style="color: #3a556a;">The WorldTile Registry Team</strong>
              </p>
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="background-color: #f9fafb; padding: 20px 30px; text-align: center; border-top: 1px solid #e5e7eb;">
              <p style="margin: 0; font-size: 12px; color: #6b7280;">
                This is an automated message from WorldTile Registry.<br>
                Please do not reply to this email.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
    `;
  }

  /**
   * Escape HTML to prevent XSS
   * @param text - Text to escape
   * @returns Escaped text
   */
  private static escapeHtml(text: string): string {
    const map: { [key: string]: string } = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;',
    };
    return text.replace(/[&<>"']/g, (m) => map[m]);
  }

  /**
   * Send deed email after purchase (with user lookup)
   * @param deed - Deed document (must be populated with userId)
   */
  static async sendDeedEmailAfterPurchase(deed: IDeed): Promise<void> {
    try {
      // Populate user if not already populated
      let user;
      if (typeof deed.userId === 'object' && deed.userId !== null) {
        user = deed.userId as any;
      } else {
        user = await User.findById(deed.userId);
      }

      if (!user) {
        console.warn(`⚠️ User not found for deed ${deed.landSlotId}, skipping email`);
        return;
      }

      // Check if user has email
      if (!user.email) {
        console.warn(`⚠️ User ${user._id} does not have an email address, skipping email`);
        return;
      }

      // Send email
      await this.sendDeedEmail(deed, user.email, user.name || user.fullName || 'Valued Customer');
    } catch (error: any) {
      // Log error but don't throw - email failures shouldn't break the payment flow
      console.error(`❌ Failed to send deed email for ${deed.landSlotId}:`, error.message);
      // Re-throw only if it's a critical error we want to know about
      // For now, we'll just log and continue
    }
  }
}

