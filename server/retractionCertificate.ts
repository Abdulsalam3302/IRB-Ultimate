import type { Application } from "../drizzle/schema";
import { generateAndStoreCertificatePdf } from "./certificateV2";

/** Uses the same validated, network-isolated renderer as all decision records. */
export async function generateRetractionCertificatePdf(
  app: Application,
  applicantName: string,
  retractionReason: string,
): Promise<string> {
  if (app.status !== "retracted") throw new Error("Retraction must be recorded before its notice is generated");
  return generateAndStoreCertificatePdf({
    app: { ...app, retractionReason }, applicantName, applicantEmail: null, redactForPublic: true,
  });
}
