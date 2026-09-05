# IRB Ultimate 2.4.1

This release simplifies sign-in and the owner workflow at the operator's request.

- The evaluation notice is removed from the application and generated public pages in English and Arabic. The former `VITE_PUBLIC_DEMO_BANNER` flag is no longer used, including deployment defaults.
- The normal sign-in page opens directly to email and password. Existing connected accounts remain available through a secondary sign-in option. A failed attempt never sends credentials to another identity service or merges accounts.
- Profiles no longer show the account security and two-step verification card. For non-owner staff whose configured policy requires verification, the verification form appears only when accessing staff tools.
- The exact existing administrator subject configured by `OWNER_OPEN_ID` is exempt from the staff MFA prompt. The role must still be `admin`. Server procedures, private downloads and `auth.me` use the same owner policy. Names and contact emails confer no authority.

The production owner setting is bound to the existing website account; it does not create a new user, change its password or change Supabase dashboard authentication. `STAFF_MFA_REQUIRED=true` continues to apply to other staff. Private storage, scanning, quotas, application access checks and official IRB decision controls retain their existing behavior.

Local validation includes 743 automated tests across 67 files, TypeScript, production build and bundle budgets. The notice-removal receipt in `docs/validation/frontend-notice-removal.local.json` records a build with the obsolete flag set to `1` and English/Arabic mobile checks. `node scripts/test-auth-flow.mjs` passes 76 checks in English and Arabic and exercises the actual sign-in, profile and staff-verification components with intercepted synthetic API responses. CI remains required before unattended deployment of the exact passing commit to Render and Vercel.
