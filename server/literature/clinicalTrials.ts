import type { LiteratureItem } from "./types";
import { fetchWithTimeout, trim } from "./http";

/**
 * ClinicalTrials.gov v2 API — no key required.
 * Critical for an IRB platform: lets the AI flag protocols that
 * overlap with active or completed trials.
 */
export async function searchClinicalTrials(
  query: string,
  limit: number
): Promise<{ items: LiteratureItem[]; total: number }> {
  const url = `https://clinicaltrials.gov/api/v2/studies?query.term=${encodeURIComponent(
    query
  )}&pageSize=${limit}&format=json`;
  const res = await fetchWithTimeout(url, { timeoutMs: 8000 });
  if (!res.ok) throw new Error(`ClinicalTrials.gov ${res.status}`);
  const json = (await res.json()) as any;
  const studies: any[] = json?.studies ?? [];

  const items: LiteratureItem[] = studies
    .map((s: any): LiteratureItem | null => {
      const id = s?.protocolSection?.identificationModule?.nctId;
      if (!id) return null;
      const title =
        s?.protocolSection?.identificationModule?.briefTitle ||
        s?.protocolSection?.identificationModule?.officialTitle ||
        id;
      const status = s?.protocolSection?.statusModule?.overallStatus;
      const startYear = s?.protocolSection?.statusModule?.startDateStruct?.date
        ? parseInt(
            String(s.protocolSection.statusModule.startDateStruct.date).slice(0, 4),
            10
          )
        : undefined;
      const phases: string[] = s?.protocolSection?.designModule?.phases ?? [];
      const enrollment =
        s?.protocolSection?.designModule?.enrollmentInfo?.count ??
        undefined;
      const sponsor =
        s?.protocolSection?.sponsorCollaboratorsModule?.leadSponsor?.name;
      const summary = s?.protocolSection?.descriptionModule?.briefSummary;
      const collaborators: string[] = (
        s?.protocolSection?.sponsorCollaboratorsModule?.collaborators ?? []
      )
        .slice(0, 2)
        .map((c: any) => c?.name)
        .filter(Boolean);
      const authors = [sponsor, ...collaborators].filter(Boolean) as string[];
      return {
        source: "clinicaltrials" as const,
        id,
        title: trim(title, 250) || id,
        authors: authors.slice(0, 3),
        year: Number.isFinite(startYear) ? startYear : undefined,
        venue: "ClinicalTrials.gov",
        url: `https://clinicaltrials.gov/study/${id}`,
        abstract: trim(summary, 400),
        trialStatus: status,
        trialPhase: phases.join("/") || undefined,
        trialEnrollment: typeof enrollment === "number" ? enrollment : undefined,
      };
    })
    .filter((x): x is LiteratureItem => Boolean(x));

  return { items, total: items.length };
}
