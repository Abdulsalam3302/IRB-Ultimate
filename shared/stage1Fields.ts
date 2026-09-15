export const STAGE1_FIELD_LABELS: Record<string, [string, string]> = {
  researchType: ["Research type", "نوع البحث"],
  irbCategory: ["Requested review category", "فئة المراجعة المطلوبة"],
  researchTitle: ["Research title", "عنوان البحث"],
  principalInvestigator: ["Principal investigator", "الباحث الرئيس"],
  piEmail: ["Investigator email", "البريد الإلكتروني للباحث"],
  piInstitution: ["Institution", "المؤسسة"],
  piDepartment: ["Department", "القسم"],
  fundingSource: ["Funding source", "مصدر التمويل"],
  estimatedDuration: ["Estimated duration", "المدة المتوقعة"],
  questionnaireFileUrl: ["Questionnaire attachment", "مرفق الاستبيان"],
  retrospectiveDataSource: ["Data source", "مصدر البيانات"],
  clinicalTrialDetails: ["Trial details", "تفاصيل التجربة"],
  supplementaryFilesJson: ["Supplementary attachments", "المرفقات الإضافية"],
  labHeadApproval: ["Laboratory authorization", "موافقة رئيس المختبر"],
  labHeadName: ["Laboratory head", "رئيس المختبر"],
  labHeadEmail: ["Laboratory head email", "بريد رئيس المختبر"],
  labHeadPhone: ["Laboratory head phone", "هاتف رئيس المختبر"],
};
export const stage1FieldLabel = (key: string, isAr: boolean) =>
  STAGE1_FIELD_LABELS[key]?.[isAr ? 1 : 0] ||
  key.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/_/g, " ");
export const labelStage1Text = (text: string, isAr: boolean) =>
  text.replace(
    new RegExp(`\\b(${Object.keys(STAGE1_FIELD_LABELS).join("|")})\\b`, "g"),
    key => stage1FieldLabel(key, isAr)
  );
