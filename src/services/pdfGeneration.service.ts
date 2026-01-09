import puppeteer from 'puppeteer-core';
import chromium from '@sparticuz/chromium';
import { IDeed } from '../models/Deed.model';

/**
 * PDF Generation Service
 * Generates PDF deeds from HTML template
 * Uses puppeteer-core + @sparticuz/chromium for Vercel/serverless compatibility
 */
export class PDFGenerationService {
  /**
   * Generate PDF deed from deed data
   * @param deed - Deed document with all required fields
   * @param priceUSDT - Optional price paid in USDT
   * @returns PDF buffer
   */
  static async generateDeedPDF(deed: IDeed, priceUSDT?: string): Promise<Buffer> {
    const html = this.generateHTML(deed, priceUSDT);

    // Launch browser with serverless-compatible Chrome
    // @sparticuz/chromium provides a Lambda-compatible Chrome binary
    // This works on Vercel, AWS Lambda, and other serverless platforms
    const browser = await puppeteer.launch({
      args: chromium.args,
      executablePath: await chromium.executablePath(),
      headless: chromium.headless,
    });

    try {
      const page = await browser.newPage();
      
      // Set content
      await page.setContent(html, {
        waitUntil: 'networkidle0',
      });

      // Generate PDF - force single page
      const pdfBuffer = await page.pdf({
        format: 'A4',
        printBackground: true,
        margin: {
          top: '0',
          right: '0',
          bottom: '0',
          left: '0',
        },
        preferCSSPageSize: false,
        displayHeaderFooter: false,
      });

      return Buffer.from(pdfBuffer);
    } finally {
      await browser.close();
    }
  }

  /**
   * Generate HTML from deed data using the provided template
   * @param deed - Deed document
   * @param priceUSDT - Optional price paid in USDT
   * @returns HTML string
   */
  private static generateHTML(deed: IDeed, priceUSDT?: string): string {
    // Format issue date
    const issueDate = new Date(deed.issuedAt).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });

    // Use seal number from database
    const sealNumber = deed.sealNo || 'N/A';

    // Get blockchain display name
    const blockchainName = deed.nft.blockchain === 'POLYGON' ? 'POLYGON' : deed.nft.blockchain;

    // Format addresses (show first 4 chars + ... + last 6 chars)
    const formatAddress = (address: string, length: number = 10): string => {
      if (!address || address.length <= length) return address;
      return `${address.substring(0, 4)}...${address.substring(address.length - 6)}`;
    };

    const nftContractShort = formatAddress(deed.nft.contractAddress, 14);
    const paymentTxShort = formatAddress(deed.payment.transactionId, 14);
    const paymentReceiverShort = formatAddress(deed.payment.receiver, 14);

    // Build OpenSea link HTML if available, with price in the right cell
    const openSeaRow = deed.nft.openSeaUrl
      ? `<div class="row">
          <div class="cell">
            <div class="label">View on OpenSea</div>
            <div class="value"><a href="${this.escapeHtml(deed.nft.openSeaUrl)}" style="color: #3a556a; text-decoration: none; font-weight: 600;">OpenSea</a></div>
          </div>
          <div class="cell">
            <div class="label">Price Paid</div>
            <div class="value">${priceUSDT ? `${parseFloat(priceUSDT).toFixed(2)} USDT` : 'N/A'}</div>
          </div>
        </div>`
      : '';

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>WorldTile Digital Land Ownership Deed</title>
  <style>
    @page {
      margin: 0;
      size: A4;
    }
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }
    body {
      margin: 0;
      padding: 30px 35px;
      background: #f7f6f3;
      font-family: "Inter", "Segoe UI", -apple-system, BlinkMacSystemFont, sans-serif;
      color: #2b2b2b;
      font-size: 13px;
      line-height: 1.5;
    }
    .deed {
      max-width: 100%;
      margin: 0 auto;
      background: #f7f6f3;
      padding: 40px 50px;
      position: relative;
      height: calc(100vh - 60px);
      max-height: 1123px;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
    }
    /* HEADER */
    .brand {
      text-align: center;
      font-family: "Georgia", "Times New Roman", serif;
      font-size: 26px;
      letter-spacing: 3px;
      color: #3a556a;
      margin-bottom: 6px;
      font-weight: normal;
    }
    .subtitle {
      text-align: center;
      font-size: 13px;
      color: #6b7280;
      margin-bottom: 22px;
      font-weight: normal;
    }
    hr {
      border: none;
      border-top: 1px solid #d1d5db;
      margin: 24px 0 20px 0;
    }
    /* TITLE */
    .title {
      text-align: center;
      font-family: "Georgia", "Times New Roman", serif;
      font-size: 28px;
      letter-spacing: 2px;
      margin-bottom: 14px;
      margin-top: 4px;
      color: #2b2b2b;
      font-weight: normal;
    }
    /* MAIN TEXT */
    .text {
      text-align: center;
      font-size: 15px;
      line-height: 1.7;
      color: #374151;
      margin-bottom: 10px;
    }
    .owner-name {
      text-align: center;
      font-size: 24px;
      font-weight: 600;
      color: #3a556a;
      margin: 10px 0 14px 0;
      font-family: "Inter", "Segoe UI", sans-serif;
    }
    /* INFO TABLE */
    .table {
      border: 1px solid #d1d5db;
      border-radius: 6px;
      overflow: hidden;
      margin-top: 24px;
      background: white;
      flex: 1;
      min-height: 0;
    }
    .row {
      display: grid;
      grid-template-columns: 1fr 1fr;
    }
    .cell {
      padding: 14px 18px;
      border-bottom: 1px solid #d1d5db;
      border-right: 1px solid #d1d5db;
      background: white;
    }
    .row:last-child .cell {
      border-bottom: none;
    }
    .cell:nth-child(2n) {
      border-right: none;
    }
    .label {
      font-size: 12px;
      color: #6b7280;
      margin-bottom: 6px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      font-weight: 500;
    }
    .value {
      font-size: 15px;
      color: #1f2937;
      font-weight: 500;
      word-break: break-word;
      line-height: 1.5;
    }
    .value a {
      color: #3a556a;
      text-decoration: underline;
      font-weight: 600;
    }
    /* ISSUED DATE */
    .issued-date {
      text-align: right;
      font-size: 13px;
      color: #4b5563;
      margin-top: 20px;
      margin-bottom: 20px;
    }
    /* FOOTER */
    .footer {
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
      margin-top: 0;
    }
    .issuer {
      font-size: 13px;
      color: #374151;
      line-height: 1.7;
    }
    .issuer strong {
      color: #3a556a;
      font-weight: 600;
    }
    /* SEAL */
    .seal {
      width: 150px;
      height: 150px;
      flex-shrink: 0;
    }
    .seal svg {
      width: 100%;
      height: 100%;
    }
    .seal text {
      font-family: "Inter", "Segoe UI", sans-serif;
    }
  </style>
</head>
<body>
  <div class="deed">
    <div>
      <div class="brand">WORLD TILE</div>
      <div class="subtitle">Digital Land Registry • Blockchain Secured</div>
      <hr />
      <div class="title">DIGITAL LAND OWNERSHIP DEED</div>
      <div class="text">This deed certifies that</div>
      <div class="owner-name">${this.escapeHtml(deed.ownerName)}</div>
      <div class="text">
        is the verified digital owner of the following <strong>WorldTile</strong> land parcel,
        permanently recorded on the blockchain.
      </div>
      <!-- DETAILS TABLE -->
      <div class="table">
        <div class="row">
          <div class="cell">
            <div class="label">Owner Name</div>
            <div class="value">${this.escapeHtml(deed.ownerName)}</div>
          </div>
          <div class="cell">
            <div class="label">Plot ID</div>
            <div class="value">${this.escapeHtml(deed.plotId)}</div>
          </div>
        </div>
        <div class="row">
          <div class="cell">
            <div class="label">City / Region</div>
            <div class="value">${this.escapeHtml(deed.city)}</div>
          </div>
          <div class="cell">
            <div class="label">NFT Token ID</div>
            <div class="value">${this.escapeHtml(deed.nft.tokenId)}</div>
          </div>
        </div>
        <div class="row">
          <div class="cell">
            <div class="label">NFT Contract</div>
            <div class="value">${nftContractShort}</div>
          </div>
          <div class="cell">
            <div class="label">Blockchain</div>
            <div class="value">${blockchainName}</div>
          </div>
        </div>
        ${openSeaRow}
        <div class="row">
          <div class="cell">
            <div class="label">Latitude</div>
            <div class="value">${deed.latitude.toFixed(6)}</div>
          </div>
          <div class="cell">
            <div class="label">Longitude</div>
            <div class="value">${deed.longitude.toFixed(6)}</div>
          </div>
        </div>
        <div class="row">
          <div class="cell">
            <div class="label">Payment Transaction ID</div>
            <div class="value">${paymentTxShort}</div>
          </div>
          <div class="cell">
            <div class="label">Payment Receiver</div>
            <div class="value">${paymentReceiverShort}</div>
          </div>
        </div>
      </div>
      <div class="issued-date">Issued: ${issueDate}</div>
    </div>
    <!-- FOOTER -->
    <div class="footer">
      <div class="issuer">
        Issued by<br />
        <strong>WorldTile Registry</strong><br />
        Digitally Generated • No Physical Signature Required
      </div>
      <!-- SEAL -->
      <div class="seal">
        <svg viewBox="0 0 200 200">
          <circle cx="100" cy="100" r="92" fill="none" stroke="#3a556a" stroke-width="4"/>
          <circle cx="100" cy="100" r="75" fill="none" stroke="#3a556a" stroke-width="2"/>
          <defs>
            <path id="topArc" d="M40,100 A60,60 0 0,1 160,100"/>
            <path id="bottomArc" d="M160,100 A60,60 0 0,1 40,100"/>
          </defs>
          <text font-size="13" fill="#3a556a" font-weight="700" letter-spacing="2">
            <textPath href="#topArc" startOffset="50%" text-anchor="middle">
              WORLD TILE
            </textPath>
          </text>
          <text font-size="11" fill="#3a556a" font-weight="600" letter-spacing="1.5">
            <textPath href="#bottomArc" startOffset="50%" text-anchor="middle">
              DIGITAL LAND REGISTRY
            </textPath>
          </text>
          <text x="100" y="92" text-anchor="middle" font-size="15" fill="#3a556a" font-weight="700">
            VERIFIED
          </text>
          <text x="100" y="110" text-anchor="middle" font-size="10" fill="#4b5563">
            SEAL NO
          </text>
          <text x="100" y="128" text-anchor="middle" font-size="9" fill="#1f2937" font-weight="700">
            ${this.escapeHtml(sealNumber.substring(0, 18))}
          </text>
        </svg>
      </div>
    </div>
  </div>
</body>
</html>`;
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
}

