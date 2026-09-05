import { writeFile, mkdir } from "node:fs/promises";
import { chromium } from "playwright";
import { renderCertificatePdf, renderCertificateHtml, renderCertificateDocx } from "../server/certificateV2";
import { renderResourcePdf, renderResourceDocx } from "../server/_core/resourceExport";
import { getResourceBySlug } from "../shared/resources";
// Local synthetic fixtures only: no application/database writes or model calls.
(async () => {
 if (process.env.NODE_ENV !== "test") throw new Error("Run with NODE_ENV=test");
 await mkdir("/tmp/irb-generation-validation", {recursive:true});
 const data = { app: { id:1,humanDecisionByUserId:7,humanDecisionAt:new Date("2026-09-05T00:00:00Z"),status:"approved",irbNumber:"IRB-TEST-2026-001",approvedAt:new Date("2026-09-05T00:00:00Z"), researchTitle:"SYNTHETIC VALIDATION ONLY — Observational protocol / دراسة رصدية",principalInvestigator:"Synthetic Test Investigator",piInstitution:"Synthetic Test Institution",researchType:"observational",irbCategory:"full_board" },applicantName:"Synthetic Test", applicantEmail:"test@example.invalid", redactForPublic:true } as any;
 const pdf = await renderCertificatePdf(data);
 if(pdf.subarray(0,5).toString()!=="%PDF-") throw new Error("Certificate not a PDF");
 await writeFile("/tmp/irb-generation-validation/certificate.pdf",pdf);
 await writeFile("/tmp/irb-generation-validation/certificate.docx", await renderCertificateDocx(data));
 const browser = await chromium.launch({headless:true});
 const page = await browser.newPage({viewport:{width:900,height:1200},javaScriptEnabled:false});
 await page.route("**/*", (route:any)=>route.abort());
 await page.setContent(renderCertificateHtml(data));
 await page.screenshot({path:"/tmp/irb-generation-validation/certificate.png",fullPage:true});
 await browser.close();
 const item = getResourceBySlug("informed-consent")!;
 for(const lang of ["en","ar"] as const) {
   const opts={item,lang,mode:"generated" as const,prefill:{}};
   const buf=await renderResourcePdf(opts);
   if(buf.subarray(0,5).toString()!=="%PDF-") throw new Error("Resource not PDF");
   await writeFile(`/tmp/irb-generation-validation/consent-${lang}.pdf`,buf);
   await writeFile(`/tmp/irb-generation-validation/consent-${lang}.docx`,await renderResourceDocx(opts));
 }
 console.log(JSON.stringify({certificatePdfBytes:pdf.length,outputs:["certificate.pdf","certificate.docx","consent-en.pdf","consent-ar.pdf","consent-en.docx","consent-ar.docx"],externalRequests:"blocked by renderer",fixture:"synthetic, no live application"}));
 process.exit(0);
})().catch(e=>{console.error(e);process.exit(1)});
