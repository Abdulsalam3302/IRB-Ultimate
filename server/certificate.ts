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

export async function generateCertificatePdf(app: Application, applicantName: string, applicantEmail: string): Promise<string> {
  const approvalDate = app.approvedAt ? new Date(app.approvedAt).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }) : new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  const expiryDate = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  const hijriDate = new Date().toLocaleDateString("ar-SA-u-ca-islamic", { year: "numeric", month: "long", day: "numeric" });

  // Page 1: Main Certificate
  const page1 = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="800" height="1130" viewBox="0 0 800 1130">
  <defs>
    <style>
      text { font-family: 'Inter', 'Arial', sans-serif; }
    </style>
    <linearGradient id="headerGrad" x1="0" y1="0" x2="800" y2="0">
      <stop offset="0%" style="stop-color:#064e3b"/>
      <stop offset="100%" style="stop-color:#0d6b4e"/>
    </linearGradient>
    <pattern id="watermark" width="200" height="200" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
      <text x="100" y="100" text-anchor="middle" fill="#0d6b4e" font-size="14" opacity="0.03" font-weight="700">NCBE IRB</text>
    </pattern>
  </defs>
  
  <rect width="800" height="1130" fill="#ffffff"/>
  <rect width="800" height="1130" fill="url(#watermark)"/>
  
  <!-- Ornate Border -->
  <rect x="15" y="15" width="770" height="1100" fill="none" stroke="#0d6b4e" stroke-width="3" rx="4"/>
  <rect x="22" y="22" width="756" height="1086" fill="none" stroke="#c8a84e" stroke-width="1.5" rx="3"/>
  <rect x="28" y="28" width="744" height="1074" fill="none" stroke="#0d6b4e" stroke-width="0.5" rx="2" stroke-dasharray="4,4"/>
  
  <!-- Corner Ornaments -->
  <circle cx="40" cy="40" r="6" fill="#c8a84e" opacity="0.7"/>
  <circle cx="760" cy="40" r="6" fill="#c8a84e" opacity="0.7"/>
  <circle cx="40" cy="1090" r="6" fill="#c8a84e" opacity="0.7"/>
  <circle cx="760" cy="1090" r="6" fill="#c8a84e" opacity="0.7"/>
  
  <!-- Header Banner -->
  <rect x="28" y="28" width="744" height="140" fill="url(#headerGrad)" rx="2"/>
  
  <!-- Saudi Emblem Area -->
  <text x="400" y="60" text-anchor="middle" fill="#c8a84e" font-size="16" font-weight="700">&#9733; Kingdom of Saudi Arabia &#9733;</text>
  <text x="400" y="85" text-anchor="middle" fill="#ffffff" font-size="32" font-weight="700" letter-spacing="2">IRB APPROVAL CERTIFICATE</text>
  <text x="400" y="112" text-anchor="middle" fill="#a7f3d0" font-size="13" font-weight="400">National Committee of BioEthics (NCBE) of Saudi Arabia</text>
  <text x="400" y="132" text-anchor="middle" fill="#a7f3d0" font-size="11" font-weight="400">Institutional Review Board — Local Committee</text>
  <text x="400" y="152" text-anchor="middle" fill="#c8a84e" font-size="11" font-weight="600">Advanced Healthcare Systems Society</text>
  
  <!-- IRB Number Box -->
  <rect x="220" y="190" width="360" height="55" fill="#f0fdf4" stroke="#0d6b4e" stroke-width="2" rx="8"/>
  <text x="400" y="212" text-anchor="middle" fill="#666666" font-size="10" font-weight="600" letter-spacing="2">CERTIFICATE NUMBER</text>
  <text x="400" y="235" text-anchor="middle" fill="#064e3b" font-size="22" font-weight="700" letter-spacing="1">${escapeHtml(app.irbNumber || "")}</text>
  
  <!-- Certificate Body -->
  <text x="400" y="280" text-anchor="middle" fill="#333333" font-size="14" font-weight="400">This is to certify that the following research protocol has been reviewed and approved</text>
  <text x="400" y="300" text-anchor="middle" fill="#333333" font-size="14" font-weight="400">by the Institutional Review Board in accordance with NCBE regulations.</text>
  
  <!-- Divider -->
  <line x1="100" y1="325" x2="700" y2="325" stroke="#c8a84e" stroke-width="1"/>
  
  <!-- Research Title -->
  <text x="80" y="360" fill="#0d6b4e" font-size="11" font-weight="700" letter-spacing="1.5">RESEARCH TITLE</text>
  ${wrapText(app.researchTitle || "", 85).map((line, i) => 
    `<text x="80" y="${382 + i * 22}" fill="#1a1a1a" font-size="16" font-weight="600">${escapeHtml(line)}</text>`
  ).join("\n  ")}
  
  <!-- PI Info -->
  <text x="80" y="${382 + wrapText(app.researchTitle || "", 85).length * 22 + 30}" fill="#0d6b4e" font-size="11" font-weight="700" letter-spacing="1.5">PRINCIPAL INVESTIGATOR</text>
  <text x="80" y="${382 + wrapText(app.researchTitle || "", 85).length * 22 + 52}" fill="#1a1a1a" font-size="15" font-weight="500">${escapeHtml(app.principalInvestigator || "")}</text>
  <text x="80" y="${382 + wrapText(app.researchTitle || "", 85).length * 22 + 72}" fill="#666666" font-size="12" font-weight="400">${escapeHtml(applicantEmail)}</text>
  
  <!-- Two Column Info -->
  <text x="80" y="560" fill="#0d6b4e" font-size="11" font-weight="700" letter-spacing="1.5">INSTITUTION</text>
  <text x="80" y="580" fill="#1a1a1a" font-size="14" font-weight="400">${escapeHtml(app.piInstitution || "")}</text>
  
  <text x="450" y="560" fill="#0d6b4e" font-size="11" font-weight="700" letter-spacing="1.5">DEPARTMENT</text>
  <text x="450" y="580" fill="#1a1a1a" font-size="14" font-weight="400">${escapeHtml(app.piDepartment || "")}</text>
  
  <text x="80" y="620" fill="#0d6b4e" font-size="11" font-weight="700" letter-spacing="1.5">RESEARCH TYPE</text>
  <text x="80" y="640" fill="#1a1a1a" font-size="14" font-weight="400">${escapeHtml((app.researchType || "").replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase()))}</text>
  
  <text x="450" y="620" fill="#0d6b4e" font-size="11" font-weight="700" letter-spacing="1.5">REVIEW CATEGORY</text>
  <text x="450" y="640" fill="#1a1a1a" font-size="14" font-weight="400">Full Board Review</text>
  
  <text x="80" y="680" fill="#0d6b4e" font-size="11" font-weight="700" letter-spacing="1.5">FUNDING SOURCE</text>
  <text x="80" y="700" fill="#1a1a1a" font-size="14" font-weight="400">${escapeHtml(app.fundingSource || "N/A")}</text>
  
  <text x="450" y="680" fill="#0d6b4e" font-size="11" font-weight="700" letter-spacing="1.5">ESTIMATED DURATION</text>
  <text x="450" y="700" fill="#1a1a1a" font-size="14" font-weight="400">${escapeHtml(app.estimatedDuration || "N/A")}</text>
  
  <!-- Divider -->
  <line x1="100" y1="730" x2="700" y2="730" stroke="#e5e7eb" stroke-width="1"/>
  
  <!-- Dates -->
  <rect x="80" y="750" width="280" height="65" fill="#f0fdf4" stroke="#d1fae5" stroke-width="1" rx="6"/>
  <text x="220" y="772" text-anchor="middle" fill="#0d6b4e" font-size="10" font-weight="700" letter-spacing="1.5">DATE OF APPROVAL</text>
  <text x="220" y="800" text-anchor="middle" fill="#064e3b" font-size="18" font-weight="700">${approvalDate}</text>
  
  <rect x="440" y="750" width="280" height="65" fill="#fef3c7" stroke="#fde68a" stroke-width="1" rx="6"/>
  <text x="580" y="772" text-anchor="middle" fill="#92400e" font-size="10" font-weight="700" letter-spacing="1.5">VALID UNTIL</text>
  <text x="580" y="800" text-anchor="middle" fill="#92400e" font-size="18" font-weight="700">${expiryDate}</text>
  
  <!-- AI Scores -->
  <text x="80" y="855" fill="#0d6b4e" font-size="11" font-weight="700" letter-spacing="1.5">AI COMPLIANCE SCORES</text>
  <rect x="80" y="868" width="130" height="40" fill="#f0fdf4" stroke="#d1fae5" stroke-width="1" rx="4"/>
  <text x="145" y="884" text-anchor="middle" fill="#666666" font-size="9" font-weight="600">STAGE 1</text>
  <text x="145" y="901" text-anchor="middle" fill="#064e3b" font-size="14" font-weight="700">${app.stage1AiScore ?? "N/A"}/100</text>
  
  <rect x="230" y="868" width="130" height="40" fill="#f0fdf4" stroke="#d1fae5" stroke-width="1" rx="4"/>
  <text x="295" y="884" text-anchor="middle" fill="#666666" font-size="9" font-weight="600">STAGE 2</text>
  <text x="295" y="901" text-anchor="middle" fill="#064e3b" font-size="14" font-weight="700">${app.stage2AiScore ?? "N/A"}/100</text>
  
  <!-- Chairman Signature -->
  <text x="550" y="870" fill="#0d6b4e" font-size="11" font-weight="700" letter-spacing="1.5">IRB CHAIRMAN</text>
  <line x1="500" y1="910" x2="720" y2="910" stroke="#0d6b4e" stroke-width="1"/>
  <text x="610" y="930" text-anchor="middle" fill="#064e3b" font-size="14" font-weight="700">Dr. Abdulsalam Aleid</text>
  <text x="610" y="948" text-anchor="middle" fill="#666666" font-size="10" font-weight="400">Chairman, Institutional Review Board</text>
  <text x="610" y="963" text-anchor="middle" fill="#666666" font-size="10" font-weight="400">Advanced Healthcare Systems Society</text>
  
  <!-- Approval Stamp -->
  <circle cx="160" cy="960" r="50" fill="none" stroke="#0d6b4e" stroke-width="3" opacity="0.7"/>
  <circle cx="160" cy="960" r="42" fill="none" stroke="#0d6b4e" stroke-width="1.5" opacity="0.5"/>
  <text x="160" y="948" text-anchor="middle" fill="#0d6b4e" font-size="14" font-weight="700" opacity="0.8">APPROVED</text>
  <text x="160" y="965" text-anchor="middle" fill="#0d6b4e" font-size="9" font-weight="600" opacity="0.7">IRB COMMITTEE</text>
  <text x="160" y="980" text-anchor="middle" fill="#0d6b4e" font-size="8" font-weight="400" opacity="0.6">SAUDI ARABIA</text>
  
  <!-- Footer -->
  <line x1="60" y1="1020" x2="740" y2="1020" stroke="#0d6b4e" stroke-width="1"/>
  <text x="400" y="1042" text-anchor="middle" fill="#666666" font-size="9">This certificate is electronically generated and digitally verified. Serial number: ${escapeHtml(app.irbNumber || "")}</text>
  <text x="400" y="1058" text-anchor="middle" fill="#666666" font-size="9">Issued in compliance with NCBE regulations and Saudi Vision 2030 healthcare standards.</text>
  <text x="400" y="1074" text-anchor="middle" fill="#0d6b4e" font-size="9" font-weight="600">Hijri Date: ${escapeHtml(hijriDate)}</text>
  <text x="400" y="1092" text-anchor="middle" fill="#999999" font-size="8">Advanced Healthcare Systems Society — Made with Love in Saudi Arabia</text>
</svg>`;

  // Page 2: Research Details
  const page2 = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="800" height="1130" viewBox="0 0 800 1130">
  <defs>
    <style>text { font-family: 'Inter', 'Arial', sans-serif; }</style>
  </defs>
  
  <rect width="800" height="1130" fill="#ffffff"/>
  
  <!-- Header -->
  <rect x="0" y="0" width="800" height="60" fill="#064e3b"/>
  <text x="400" y="28" text-anchor="middle" fill="#ffffff" font-size="14" font-weight="700">RESEARCH PROTOCOL DETAILS</text>
  <text x="400" y="48" text-anchor="middle" fill="#a7f3d0" font-size="10">${escapeHtml(app.irbNumber || "")} — Page 2</text>
  
  <!-- Research Objectives -->
  <text x="60" y="95" fill="#0d6b4e" font-size="12" font-weight="700" letter-spacing="1">1. RESEARCH OBJECTIVES</text>
  <rect x="60" y="105" width="680" height="1" fill="#e5e7eb"/>
  ${wrapText(app.researchObjectives || "N/A", 95).slice(0, 6).map((line, i) => 
    `<text x="60" y="${125 + i * 18}" fill="#333333" font-size="11" font-weight="400">${escapeHtml(line)}</text>`
  ).join("\n  ")}
  
  <!-- Methodology -->
  <text x="60" y="${125 + Math.min(wrapText(app.researchObjectives || "N/A", 95).length, 6) * 18 + 25}" fill="#0d6b4e" font-size="12" font-weight="700" letter-spacing="1">2. METHODOLOGY</text>
  <rect x="60" y="${125 + Math.min(wrapText(app.researchObjectives || "N/A", 95).length, 6) * 18 + 35}" width="680" height="1" fill="#e5e7eb"/>
  ${wrapText(app.methodology || "N/A", 95).slice(0, 8).map((line, i) => 
    `<text x="60" y="${125 + Math.min(wrapText(app.researchObjectives || "N/A", 95).length, 6) * 18 + 55 + i * 18}" fill="#333333" font-size="11" font-weight="400">${escapeHtml(line)}</text>`
  ).join("\n  ")}
  
  <!-- Sample & Population -->
  <text x="60" y="480" fill="#0d6b4e" font-size="12" font-weight="700" letter-spacing="1">3. SAMPLE SIZE &amp; TARGET POPULATION</text>
  <rect x="60" y="490" width="680" height="1" fill="#e5e7eb"/>
  <text x="60" y="510" fill="#666666" font-size="10" font-weight="600">Sample Size:</text>
  <text x="160" y="510" fill="#333333" font-size="11">${escapeHtml(app.sampleSize || "N/A")}</text>
  ${wrapText(app.targetPopulation || "N/A", 95).slice(0, 4).map((line, i) => 
    `<text x="60" y="${535 + i * 18}" fill="#333333" font-size="11" font-weight="400">${escapeHtml(line)}</text>`
  ).join("\n  ")}
  
  <!-- Selection Criteria -->
  <text x="60" y="630" fill="#0d6b4e" font-size="12" font-weight="700" letter-spacing="1">4. SELECTION CRITERIA</text>
  <rect x="60" y="640" width="680" height="1" fill="#e5e7eb"/>
  <text x="60" y="660" fill="#666666" font-size="10" font-weight="600">Inclusion Criteria:</text>
  ${wrapText(app.inclusionCriteria || "N/A", 95).slice(0, 4).map((line, i) => 
    `<text x="60" y="${678 + i * 18}" fill="#333333" font-size="11">${escapeHtml(line)}</text>`
  ).join("\n  ")}
  <text x="60" y="${678 + Math.min(wrapText(app.inclusionCriteria || "N/A", 95).length, 4) * 18 + 15}" fill="#666666" font-size="10" font-weight="600">Exclusion Criteria:</text>
  ${wrapText(app.exclusionCriteria || "N/A", 95).slice(0, 4).map((line, i) => 
    `<text x="60" y="${678 + Math.min(wrapText(app.inclusionCriteria || "N/A", 95).length, 4) * 18 + 33 + i * 18}" fill="#333333" font-size="11">${escapeHtml(line)}</text>`
  ).join("\n  ")}
  
  <!-- Data Collection -->
  <text x="60" y="880" fill="#0d6b4e" font-size="12" font-weight="700" letter-spacing="1">5. DATA COLLECTION METHODS</text>
  <rect x="60" y="890" width="680" height="1" fill="#e5e7eb"/>
  ${wrapText(app.dataCollectionMethods || "N/A", 95).slice(0, 6).map((line, i) => 
    `<text x="60" y="${910 + i * 18}" fill="#333333" font-size="11">${escapeHtml(line)}</text>`
  ).join("\n  ")}
  
  <!-- Footer -->
  <line x1="60" y1="1080" x2="740" y2="1080" stroke="#e5e7eb" stroke-width="1"/>
  <text x="400" y="1100" text-anchor="middle" fill="#999999" font-size="9">${escapeHtml(app.irbNumber || "")} — Advanced Healthcare Systems Society — Page 2</text>
</svg>`;

  // Page 3: Ethics & Consent
  const page3 = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="800" height="1130" viewBox="0 0 800 1130">
  <defs>
    <style>text { font-family: 'Inter', 'Arial', sans-serif; }</style>
  </defs>
  
  <rect width="800" height="1130" fill="#ffffff"/>
  
  <!-- Header -->
  <rect x="0" y="0" width="800" height="60" fill="#064e3b"/>
  <text x="400" y="28" text-anchor="middle" fill="#ffffff" font-size="14" font-weight="700">ETHICS &amp; CONSENT REVIEW</text>
  <text x="400" y="48" text-anchor="middle" fill="#a7f3d0" font-size="10">${escapeHtml(app.irbNumber || "")} — Page 3</text>
  
  <!-- Informed Consent -->
  <text x="60" y="95" fill="#0d6b4e" font-size="12" font-weight="700" letter-spacing="1">6. INFORMED CONSENT PROCESS</text>
  <rect x="60" y="105" width="680" height="1" fill="#e5e7eb"/>
  ${wrapText(app.informedConsentProcess || "N/A", 95).slice(0, 8).map((line, i) => 
    `<text x="60" y="${125 + i * 18}" fill="#333333" font-size="11">${escapeHtml(line)}</text>`
  ).join("\n  ")}
  
  <!-- Risk Assessment -->
  <text x="60" y="310" fill="#0d6b4e" font-size="12" font-weight="700" letter-spacing="1">7. RISK ASSESSMENT</text>
  <rect x="60" y="320" width="680" height="1" fill="#e5e7eb"/>
  ${wrapText(app.riskAssessment || "N/A", 95).slice(0, 8).map((line, i) => 
    `<text x="60" y="${340 + i * 18}" fill="#333333" font-size="11">${escapeHtml(line)}</text>`
  ).join("\n  ")}
  
  <!-- Benefit Assessment -->
  <text x="60" y="525" fill="#0d6b4e" font-size="12" font-weight="700" letter-spacing="1">8. BENEFIT ASSESSMENT</text>
  <rect x="60" y="535" width="680" height="1" fill="#e5e7eb"/>
  ${wrapText(app.benefitAssessment || "N/A", 95).slice(0, 8).map((line, i) => 
    `<text x="60" y="${555 + i * 18}" fill="#333333" font-size="11">${escapeHtml(line)}</text>`
  ).join("\n  ")}
  
  <!-- Confidentiality -->
  <text x="60" y="740" fill="#0d6b4e" font-size="12" font-weight="700" letter-spacing="1">9. CONFIDENTIALITY MEASURES</text>
  <rect x="60" y="750" width="680" height="1" fill="#e5e7eb"/>
  ${wrapText(app.confidentialityMeasures || "N/A", 95).slice(0, 8).map((line, i) => 
    `<text x="60" y="${770 + i * 18}" fill="#333333" font-size="11">${escapeHtml(line)}</text>`
  ).join("\n  ")}
  
  <!-- Conflict of Interest -->
  <text x="60" y="940" fill="#0d6b4e" font-size="12" font-weight="700" letter-spacing="1">10. CONFLICT OF INTEREST DECLARATION</text>
  <rect x="60" y="950" width="680" height="1" fill="#e5e7eb"/>
  ${wrapText(app.conflictOfInterest || "N/A", 95).slice(0, 4).map((line, i) => 
    `<text x="60" y="${970 + i * 18}" fill="#333333" font-size="11">${escapeHtml(line)}</text>`
  ).join("\n  ")}
  
  <!-- Footer -->
  <line x1="60" y1="1080" x2="740" y2="1080" stroke="#e5e7eb" stroke-width="1"/>
  <text x="400" y="1100" text-anchor="middle" fill="#999999" font-size="9">${escapeHtml(app.irbNumber || "")} — Advanced Healthcare Systems Society — Page 3</text>
</svg>`;

  // Page 4: Approval Summary & Conditions
  const page4 = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="800" height="1130" viewBox="0 0 800 1130">
  <defs>
    <style>text { font-family: 'Inter', 'Arial', sans-serif; }</style>
  </defs>
  
  <rect width="800" height="1130" fill="#ffffff"/>
  
  <!-- Header -->
  <rect x="0" y="0" width="800" height="60" fill="#064e3b"/>
  <text x="400" y="28" text-anchor="middle" fill="#ffffff" font-size="14" font-weight="700">APPROVAL CONDITIONS &amp; TERMS</text>
  <text x="400" y="48" text-anchor="middle" fill="#a7f3d0" font-size="10">${escapeHtml(app.irbNumber || "")} — Page 4</text>
  
  <!-- Approval Summary -->
  <rect x="60" y="80" width="680" height="80" fill="#f0fdf4" stroke="#d1fae5" stroke-width="1" rx="6"/>
  <text x="400" y="105" text-anchor="middle" fill="#064e3b" font-size="14" font-weight="700">APPROVAL SUMMARY</text>
  <text x="400" y="128" text-anchor="middle" fill="#333333" font-size="11">This research protocol has been approved for a period of one year from the date of approval.</text>
  <text x="400" y="148" text-anchor="middle" fill="#333333" font-size="11">The principal investigator must comply with all conditions listed below.</text>
  
  <!-- Standard Conditions -->
  <text x="60" y="200" fill="#0d6b4e" font-size="12" font-weight="700" letter-spacing="1">CONDITIONS OF APPROVAL</text>
  <rect x="60" y="210" width="680" height="1" fill="#e5e7eb"/>
  
  <text x="80" y="235" fill="#333333" font-size="11" font-weight="400">1. The research must be conducted in accordance with the approved protocol.</text>
  <text x="80" y="260" fill="#333333" font-size="11" font-weight="400">2. Any amendments to the protocol must be submitted to the IRB for review and approval</text>
  <text x="95" y="278" fill="#333333" font-size="11" font-weight="400">before implementation.</text>
  <text x="80" y="303" fill="#333333" font-size="11" font-weight="400">3. The principal investigator must report any serious adverse events to the IRB within 24 hours.</text>
  <text x="80" y="328" fill="#333333" font-size="11" font-weight="400">4. Annual progress reports must be submitted to the IRB for continuing review.</text>
  <text x="80" y="353" fill="#333333" font-size="11" font-weight="400">5. The principal investigator must notify the IRB upon completion or termination of the study.</text>
  <text x="80" y="378" fill="#333333" font-size="11" font-weight="400">6. All research team members must maintain current ethics training certifications.</text>
  <text x="80" y="403" fill="#333333" font-size="11" font-weight="400">7. Informed consent must be obtained from all participants before enrollment.</text>
  <text x="80" y="428" fill="#333333" font-size="11" font-weight="400">8. Data must be stored securely in compliance with Saudi data protection regulations.</text>
  <text x="80" y="453" fill="#333333" font-size="11" font-weight="400">9. The IRB reserves the right to conduct audits of the research at any time.</text>
  <text x="80" y="478" fill="#333333" font-size="11" font-weight="400">10. Failure to comply with these conditions may result in suspension or revocation of approval.</text>
  
  <!-- Regulatory Framework -->
  <text x="60" y="530" fill="#0d6b4e" font-size="12" font-weight="700" letter-spacing="1">REGULATORY FRAMEWORK</text>
  <rect x="60" y="540" width="680" height="1" fill="#e5e7eb"/>
  
  <text x="80" y="565" fill="#333333" font-size="11">This approval is granted in accordance with:</text>
  <text x="80" y="590" fill="#333333" font-size="11">• National Committee of BioEthics (NCBE) of Saudi Arabia Regulations</text>
  <text x="80" y="612" fill="#333333" font-size="11">• Declaration of Helsinki (World Medical Association)</text>
  <text x="80" y="634" fill="#333333" font-size="11">• The Belmont Report — Ethical Principles and Guidelines</text>
  <text x="80" y="656" fill="#333333" font-size="11">• ICH-GCP (International Council for Harmonisation — Good Clinical Practice)</text>
  <text x="80" y="678" fill="#333333" font-size="11">• Saudi Vision 2030 Healthcare Standards</text>
  <text x="80" y="700" fill="#333333" font-size="11">• Saudi Data and Artificial Intelligence Authority (SDAIA) Regulations</text>
  
  <!-- Renewal Notice -->
  <rect x="60" y="740" width="680" height="70" fill="#fef3c7" stroke="#fde68a" stroke-width="1" rx="6"/>
  <text x="400" y="765" text-anchor="middle" fill="#92400e" font-size="12" font-weight="700">RENEWAL NOTICE</text>
  <text x="400" y="788" text-anchor="middle" fill="#92400e" font-size="11">This approval expires on ${expiryDate}. A renewal application must be submitted</text>
  <text x="400" y="803" text-anchor="middle" fill="#92400e" font-size="11">at least 30 days before expiry to ensure continuity of research activities.</text>
  
  <!-- Signatures -->
  <text x="60" y="870" fill="#0d6b4e" font-size="12" font-weight="700" letter-spacing="1">AUTHORIZATION</text>
  <rect x="60" y="880" width="680" height="1" fill="#e5e7eb"/>
  
  <!-- Chairman -->
  <line x1="80" y1="960" x2="320" y2="960" stroke="#333333" stroke-width="1"/>
  <text x="200" y="980" text-anchor="middle" fill="#064e3b" font-size="13" font-weight="700">Dr. Abdulsalam Aleid</text>
  <text x="200" y="998" text-anchor="middle" fill="#666666" font-size="10">IRB Chairman</text>
  <text x="200" y="1013" text-anchor="middle" fill="#666666" font-size="10">Advanced Healthcare Systems Society</text>
  
  <!-- Committee Stamp -->
  <circle cx="580" cy="960" r="45" fill="none" stroke="#0d6b4e" stroke-width="2.5" opacity="0.7"/>
  <circle cx="580" cy="960" r="38" fill="none" stroke="#c8a84e" stroke-width="1" opacity="0.5"/>
  <text x="580" y="950" text-anchor="middle" fill="#0d6b4e" font-size="11" font-weight="700" opacity="0.8">OFFICIAL</text>
  <text x="580" y="966" text-anchor="middle" fill="#0d6b4e" font-size="9" font-weight="600" opacity="0.7">IRB SEAL</text>
  <text x="580" y="980" text-anchor="middle" fill="#0d6b4e" font-size="8" font-weight="400" opacity="0.6">KSA</text>
  
  <!-- Footer -->
  <line x1="60" y1="1050" x2="740" y2="1050" stroke="#e5e7eb" stroke-width="1"/>
  <text x="400" y="1070" text-anchor="middle" fill="#999999" font-size="9">This document is electronically generated and verified. No physical signature required.</text>
  <text x="400" y="1088" text-anchor="middle" fill="#999999" font-size="9">${escapeHtml(app.irbNumber || "")} — Advanced Healthcare Systems Society — Page 4</text>
  <text x="400" y="1106" text-anchor="middle" fill="#0d6b4e" font-size="8" font-weight="600">Made with Love in Saudi Arabia — Approved by Dr. Abdulsalam Aleid</text>
</svg>`;

  // Upload all pages
  const timestamp = Date.now();
  const baseKey = `certificates/${app.irbNumber}`;
  
  const [url1, url2, url3, url4] = await Promise.all([
    storagePut(`${baseKey}-page1-${timestamp}.svg`, page1, "image/svg+xml").then(r => r.url),
    storagePut(`${baseKey}-page2-${timestamp}.svg`, page2, "image/svg+xml").then(r => r.url),
    storagePut(`${baseKey}-page3-${timestamp}.svg`, page3, "image/svg+xml").then(r => r.url),
    storagePut(`${baseKey}-page4-${timestamp}.svg`, page4, "image/svg+xml").then(r => r.url),
  ]);

  // Create an HTML wrapper that combines all pages for download
  const combinedHtml = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>IRB Certificate - ${escapeHtml(app.irbNumber || "")}</title>
<style>
  @media print { 
    .page { page-break-after: always; } 
    .page:last-child { page-break-after: auto; }
    body { margin: 0; }
  }
  body { margin: 0; padding: 0; background: #f5f5f5; font-family: Arial, sans-serif; }
  .page { background: white; margin: 20px auto; max-width: 800px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
  .page img { width: 100%; height: auto; display: block; }
  @media print { .page { margin: 0; box-shadow: none; } }
</style>
</head>
<body>
<div class="page"><img src="${url1}" alt="Certificate Page 1"/></div>
<div class="page"><img src="${url2}" alt="Certificate Page 2"/></div>
<div class="page"><img src="${url3}" alt="Certificate Page 3"/></div>
<div class="page"><img src="${url4}" alt="Certificate Page 4"/></div>
</body>
</html>`;

  const { url: htmlUrl } = await storagePut(`${baseKey}-full-${timestamp}.html`, combinedHtml, "text/html");
  
  return htmlUrl;
}
