import puppeteer from "puppeteer";
import fs from "fs";
import path from "path";

export interface DeedData {
  ownerName: string;
  plotId: string;
  city: string;
  latitude: number | string;
  longitude: number | string;
  tokenId: string;
  blockchain: string;
  transactionId: string;
  issuedAt: string;
  sealNo: string;
  sealBase64?: string;
}

/**
 * Generates a PDF deed document from a template
 * @param deedData - Data to populate in the deed template
 * @returns PDF buffer
 */
export async function generateDeedPDF(deedData: DeedData): Promise<Buffer> {
  const templatePath = path.join(__dirname, "../templates/deedTemplate.html");
  
  if (!fs.existsSync(templatePath)) {
    throw new Error(`Deed template not found at: ${templatePath}`);
  }

  let html = fs.readFileSync(templatePath, "utf8");

  // issuedAt is already a string from the interface
  const issuedAt = deedData.issuedAt;

  // Replace all template variables
  const replacements: Record<string, string> = {
    ownerName: deedData.ownerName || "",
    plotId: deedData.plotId || "",
    city: deedData.city || "",
    latitude: String(deedData.latitude || "0"),
    longitude: String(deedData.longitude || "0"),
    tokenId: deedData.tokenId || "",
    blockchain: deedData.blockchain || "",
    transactionId: deedData.transactionId || "",
    issuedAt: issuedAt,
    sealNo: deedData.sealNo || "",
    sealBase64: deedData.sealBase64 || "",
  };

  for (const key in replacements) {
    const regex = new RegExp(`\\{\\{${key}\\}\\}`, "g");
    html = html.replace(regex, replacements[key]);
  }

  // Remove seal container if no sealBase64 is provided
  if (!deedData.sealBase64 || deedData.sealBase64.trim() === "") {
    html = html.replace(
      /<div class="seal-container" id="seal-container"[\s\S]*?<\/div>/g,
      ""
    );
  } else {
    // Override the display: none to show the seal (both inline and CSS)
    html = html.replace(
      /id="seal-container" style="display: none;"/g,
      'id="seal-container" style="display: block !important;"'
    );
  }

  // Launch Puppeteer and generate PDF
  const browser = await puppeteer.launch({
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
    ],
  });

  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle0" });

    const pdfBuffer = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: {
        top: "20mm",
        right: "20mm",
        bottom: "20mm",
        left: "20mm",
      },
    });

    return Buffer.from(pdfBuffer);
  } finally {
    await browser.close();
  }
}

