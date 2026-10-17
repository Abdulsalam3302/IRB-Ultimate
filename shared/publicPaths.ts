/** Exact public routes, without bilingual page copy in the private workspace bundle. */
export const PUBLIC_PATHS: string[] = [
  "/",
  "/resources",
  "/policy",
  "/disclaimer",
  "/support",
  "/verify",
  "/resources/guideline/how-to-get-irb-approval-saudi-arabia",
  "/resources/guideline/irb-application-checklist",
  "/resources/guideline/exempt-expedited-full-board-review",
  "/resources/guideline/nbce-ethical-guidelines",
  "/resources/guideline/declaration-of-helsinki",
  "/resources/guideline/ich-gcp",
  "/resources/guideline/data-privacy",
  "/resources/guideline/privacy-policy",
];

export function getWorkspaceMetadata(
  path: string,
  language: "en" | "ar" = "en"
) {
  const isAr = language === "ar";
  return {
    path: path.split(/[?#]/, 1)[0] || "/",
    title: `${isAr ? "مساحة العمل" : "Workspace"} | IRB Saudi Arabia`,
    description: isAr
      ? "مساحة عمل خاصة لإدارة طلبات أخلاقيات البحث."
      : "Private workspace for managing research ethics applications.",
    robots: "noindex, nofollow, noarchive",
    indexable: false,
  };
}
