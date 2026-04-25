import { storagePut } from "./storage";
import { Application } from "../drizzle/schema";

function escapeHtml(str: string): string {
  return (str || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function wrapText(text: string, maxCharsPerLine: number): string[] {
  if (!text) return [""];
  const words = text.split(" ");
  const lines: string[] = [];
  let currentLine = "";
  for (const word of words) {
    if ((currentLine + " " + word).trim().length > maxCharsPerLine) {
      if (currentLine) lines.push(currentLine.trim());
      currentLine = word;
    } else {
      currentLine = currentLine ? currentLine + " " + word : word;
    }
  }
  if (currentLine) lines.push(currentLine.trim());
  return lines.length > 0 ? lines : [""];
}

export async function generateRetractionCertificatePdf(
  app: Application,
  applicantName: string,
  retractionReason: string
): Promise<string> {
  const retractionDate = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  const hijriDate = new Date().toLocaleDateString("ar-SA-u-ca-islamic", { year: "numeric", month: "long", day: "numeric" });
  const originalApprovalDate = app.approvedAt
    ? new Date(app.approvedAt).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })
    : "N/A";

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="800" height="1130" viewBox="0 0 800 1130">
  <defs>
    <style>text { font-family: 'Inter', 'Arial', sans-serif; }</style>
    <linearGradient id="headerGrad" x1="0" y1="0" x2="800" y2="0">
      <stop offset="0%" style="stop-color:#7f1d1d"/>
      <stop offset="100%" style="stop-color:#991b1b"/>
    </linearGradient>
    <pattern id="watermark" width="200" height="200" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
      <text x="100" y="100" text-anchor="middle" fill="#991b1b" font-size="18" opacity="0.04" font-weight="700">RETRACTED</text>
    </pattern>
  </defs>
  
  <rect width="800" height="1130" fill="#ffffff"/>
  <rect width="800" height="1130" fill="url(#watermark)"/>
  
  <!-- Red Border -->
  <rect x="15" y="15" width="770" height="1100" fill="none" stroke="#991b1b" stroke-width="3" rx="4"/>
  <rect x="22" y="22" width="756" height="1086" fill="none" stroke="#991b1b" stroke-width="1.5" rx="3"/>
  
  <!-- Corner Marks -->
  <circle cx="40" cy="40" r="6" fill="#991b1b" opacity="0.7"/>
  <circle cx="760" cy="40" r="6" fill="#991b1b" opacity="0.7"/>
  <circle cx="40" cy="1090" r="6" fill="#991b1b" opacity="0.7"/>
  <circle cx="760" cy="1090" r="6" fill="#991b1b" opacity="0.7"/>
  
  <!-- Header Banner (Red) -->
  <rect x="28" y="28" width="744" height="140" fill="url(#headerGrad)" rx="2"/>
  
  <text x="400" y="60" text-anchor="middle" fill="#fca5a5" font-size="16" font-weight="700">&#9888; NOTICE OF RETRACTION &#9888;</text>
  <text x="400" y="85" text-anchor="middle" fill="#ffffff" font-size="28" font-weight="700" letter-spacing="2">IRB APPROVAL RETRACTED</text>
  <text x="400" y="112" text-anchor="middle" fill="#fecaca" font-size="13" font-weight="400">National Bioethics Committee of Saudi Arabia (NBCE)</text>
  <text x="400" y="132" text-anchor="middle" fill="#fecaca" font-size="11" font-weight="400">Institutional Review Board — Local Committee</text>
  <text x="400" y="152" text-anchor="middle" fill="#fca5a5" font-size="11" font-weight="600">Advanced Healthcare Systems Society</text>
  
  <!-- IRB Number Box (Red themed) -->
  <rect x="220" y="190" width="360" height="55" fill="#fef2f2" stroke="#991b1b" stroke-width="2" rx="8"/>
  <text x="400" y="212" text-anchor="middle" fill="#991b1b" font-size="10" font-weight="600" letter-spacing="2">RETRACTED CERTIFICATE NUMBER</text>
  <text x="400" y="235" text-anchor="middle" fill="#7f1d1d" font-size="22" font-weight="700" letter-spacing="1">${escapeHtml(app.irbNumber || "")}</text>
  
  <!-- Retraction Notice -->
  <rect x="60" y="270" width="680" height="80" fill="#fef2f2" stroke="#fecaca" stroke-width="1" rx="6"/>
  <text x="400" y="300" text-anchor="middle" fill="#991b1b" font-size="14" font-weight="700">THIS IRB APPROVAL HAS BEEN OFFICIALLY RETRACTED</text>
  <text x="400" y="322" text-anchor="middle" fill="#7f1d1d" font-size="12">The research protocol approval previously granted under the above certificate number</text>
  <text x="400" y="340" text-anchor="middle" fill="#7f1d1d" font-size="12">has been retracted effective ${retractionDate}.</text>
  
  <!-- Divider -->
  <line x1="100" y1="370" x2="700" y2="370" stroke="#991b1b" stroke-width="1"/>
  
  <!-- Original Details -->
  <text x="80" y="405" fill="#991b1b" font-size="11" font-weight="700" letter-spacing="1.5">RESEARCH TITLE</text>
  ${wrapText(app.researchTitle || "", 85).map((line, i) =>
    `<text x="80" y="${425 + i * 20}" fill="#1a1a1a" font-size="14" font-weight="600">${escapeHtml(line)}</text>`
  ).join("\n  ")}
  
  <text x="80" y="510" fill="#991b1b" font-size="11" font-weight="700" letter-spacing="1.5">PRINCIPAL INVESTIGATOR</text>
  <text x="80" y="530" fill="#1a1a1a" font-size="14" font-weight="500">${escapeHtml(app.principalInvestigator || "")}</text>
  
  <text x="80" y="570" fill="#991b1b" font-size="11" font-weight="700" letter-spacing="1.5">INSTITUTION</text>
  <text x="80" y="590" fill="#1a1a1a" font-size="14">${escapeHtml(app.piInstitution || "")}</text>
  
  <text x="450" y="570" fill="#991b1b" font-size="11" font-weight="700" letter-spacing="1.5">DEPARTMENT</text>
  <text x="450" y="590" fill="#1a1a1a" font-size="14">${escapeHtml(app.piDepartment || "")}</text>
  
  <!-- Dates -->
  <rect x="80" y="620" width="280" height="65" fill="#f0fdf4" stroke="#d1fae5" stroke-width="1" rx="6"/>
  <text x="220" y="642" text-anchor="middle" fill="#0d6b4e" font-size="10" font-weight="700" letter-spacing="1.5">ORIGINAL APPROVAL DATE</text>
  <text x="220" y="670" text-anchor="middle" fill="#064e3b" font-size="16" font-weight="700">${originalApprovalDate}</text>
  
  <rect x="440" y="620" width="280" height="65" fill="#fef2f2" stroke="#fecaca" stroke-width="1" rx="6"/>
  <text x="580" y="642" text-anchor="middle" fill="#991b1b" font-size="10" font-weight="700" letter-spacing="1.5">RETRACTION DATE</text>
  <text x="580" y="670" text-anchor="middle" fill="#7f1d1d" font-size="16" font-weight="700">${retractionDate}</text>
  
  <!-- Retraction Reason -->
  <text x="80" y="730" fill="#991b1b" font-size="11" font-weight="700" letter-spacing="1.5">REASON FOR RETRACTION</text>
  <rect x="80" y="740" width="640" height="1" fill="#fecaca"/>
  ${wrapText(retractionReason, 90).slice(0, 6).map((line, i) =>
    `<text x="80" y="${760 + i * 20}" fill="#333333" font-size="12">${escapeHtml(line)}</text>`
  ).join("\n  ")}
  
  <!-- Retraction Stamp -->
  <circle cx="160" cy="920" r="55" fill="none" stroke="#991b1b" stroke-width="3" opacity="0.8"/>
  <circle cx="160" cy="920" r="47" fill="none" stroke="#991b1b" stroke-width="1.5" opacity="0.6"/>
  <text x="160" y="910" text-anchor="middle" fill="#991b1b" font-size="16" font-weight="700" opacity="0.9">RETRACTED</text>
  <text x="160" y="928" text-anchor="middle" fill="#991b1b" font-size="9" font-weight="600" opacity="0.7">IRB COMMITTEE</text>
  <text x="160" y="943" text-anchor="middle" fill="#991b1b" font-size="8" font-weight="400" opacity="0.6">SAUDI ARABIA</text>
  
  <!-- Chairman Signature -->
  <text x="550" y="880" fill="#991b1b" font-size="11" font-weight="700" letter-spacing="1.5">IRB CHAIRMAN</text>
  <line x1="480" y1="920" x2="720" y2="920" stroke="#991b1b" stroke-width="1"/>
  <text x="600" y="940" text-anchor="middle" fill="#7f1d1d" font-size="14" font-weight="700">Dr. Abdulsalam Aleid</text>
  <text x="600" y="958" text-anchor="middle" fill="#666666" font-size="10">Chairman, Institutional Review Board</text>
  <text x="600" y="973" text-anchor="middle" fill="#666666" font-size="10">Advanced Healthcare Systems Society</text>
  
  <!-- Footer -->
  <line x1="60" y1="1010" x2="740" y2="1010" stroke="#991b1b" stroke-width="1"/>
  <text x="400" y="1032" text-anchor="middle" fill="#666666" font-size="9">This retraction notice is electronically generated and digitally verified.</text>
  <text x="400" y="1048" text-anchor="middle" fill="#666666" font-size="9">The original approval certificate (${escapeHtml(app.irbNumber || "")}) is no longer valid.</text>
  <text x="400" y="1064" text-anchor="middle" fill="#991b1b" font-size="9" font-weight="600">Hijri Date: ${escapeHtml(hijriDate)}</text>
  <text x="400" y="1082" text-anchor="middle" fill="#999999" font-size="8">Advanced Healthcare Systems Society — Made with Love in Saudi Arabia</text>
</svg>`;

  const timestamp = Date.now();
  const fileKey = `certificates/${app.irbNumber}-retraction-${timestamp}.svg`;
  const { url } = await storagePut(fileKey, svg, "image/svg+xml");

  // Create HTML wrapper
  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>IRB Retraction Notice - ${escapeHtml(app.irbNumber || "")}</title>
<style>
  body { margin: 0; padding: 20px; background: #f5f5f5; }
  .page { background: white; margin: 0 auto; max-width: 800px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
  .page img { width: 100%; height: auto; display: block; }
  @media print { body { padding: 0; background: white; } .page { box-shadow: none; } }
</style>
</head>
<body>
<div class="page"><img src="${url}" alt="Retraction Notice"/></div>
</body>
</html>`;

  const { url: htmlUrl } = await storagePut(
    `certificates/${app.irbNumber}-retraction-${timestamp}.html`,
    html,
    "text/html"
  );

  return htmlUrl;
}
