import {
  STATUS_LABELS,
  RESEARCH_TYPE_LABELS,
  IRB_CATEGORY_LABELS,
  type ApplicationStatus,
  type ResearchType,
  type IrbCategory,
} from "./types";
const statusAr: Record<ApplicationStatus, string> = {
  draft: "مسودة",
  declaration_pending: "بانتظار الإقرارات",
  stage1_pending: "المعلومات الأساسية",
  stage1_failed: "ملاحظات على المعلومات الأساسية",
  stage2_pending: "تفاصيل البروتوكول",
  stage2_failed: "ملاحظات على البروتوكول",
  submitted: "تم التقديم",
  under_review: "قيد مراجعة اللجنة",
  pending_admin: "بانتظار القرار المخول",
  approved: "موافق عليه",
  rejected: "مرفوض — متاح لإعادة التقديم",
  resubmission_required: "مطلوب تعديل الطلب",
  permanently_rejected: "رفض نهائي",
  retracted: "قرار مسحوب",
  hidden: "مخفي",
};
const researchAr: Record<ResearchType, string> = {
  clinical_trial: "تجربة سريرية",
  observational: "دراسة رصدية",
  retrospective: "دراسة استعادية",
  survey_questionnaire: "مسح أو استبيان",
  case_study: "دراسة أو تقرير حالة",
  laboratory: "بحث مختبري",
  educational: "بحث تعليمي",
  social_behavioral: "بحث اجتماعي وسلوكي",
  other: "أخرى",
};
const categoryAr: Record<IrbCategory, string> = {
  full_board: "مراجعة اللجنة الكاملة",
  expedited: "مراجعة معجلة",
  exempt: "مراجعة الإعفاء",
};
export const applicationStatusLabel = (
  status: ApplicationStatus,
  isAr: boolean
) =>
  (isAr ? statusAr : STATUS_LABELS)[status] ||
  (isAr ? "حالة غير متاحة" : "Status unavailable");
export const researchTypeLabel = (type: ResearchType, isAr: boolean) =>
  (isAr ? researchAr : RESEARCH_TYPE_LABELS)[type] ||
  (isAr ? "غير محدد" : "Not specified");
export const reviewCategoryLabel = (category: IrbCategory, isAr: boolean) =>
  (isAr ? categoryAr : IRB_CATEGORY_LABELS)[category] ||
  (isAr ? "غير محددة" : "Not specified");
