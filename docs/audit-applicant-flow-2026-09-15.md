# Applicant workflow refinement — 15 September 2026

Scope: Stage 1 and Stage 2 applicant forms, advisory review presentation, final submission readiness, post-submission screening status, browser agent editor integration, and native password recovery. This report describes source and controlled local checks. It does not establish deployment, email delivery, scientific validity, institutional authority, or permission to start research.

## Implemented behavior

- Stage 2 uses one debounced, ordered save queue for typing, explicit saves, review preparation, navigation, and authenticated browser-agent writes. A change made during an in-flight save is written next. Failed writes retain the draft and block controlled navigation until retry succeeds. Unsaved recovery stays in the existing authentication-cleared memory cache; protocol text is not written to browser persistent storage. Reload/close prompts remain necessary when a save has failed.
- The main Stage 2 form exposes 12 named, required controls in four groups. Explanatory copy distinguishes required answers from optional AI tools, attachments, sample-size calculations, and literature searches. Optional tools load when opened. Native form submission saves only; it does not trigger AI review or final application submission.
- AI service outages and unresolved-information results are unscored. Legacy `[AI_UNAVAILABLE]` records no longer become a research score of zero or fabricated missing-field advice. Genuine completed zero assessments remain valid numerical results. Canonical field identifiers receive readable English/Arabic labels. Feedback from an earlier version is marked stale.
- Stage 2 wording suggestions require explicit selection before application. Text edited after a suggestion request is preserved. Stage 1 enhancement also starts from saved facts, merges only untouched fields, and limits undo to unchanged AI edits.
- Stage 1 progression saves required facts and proceeds without a numerical AI gate, punitive override dialog, or promised 100/100 replacement. Final submission uses server-provided required-field/declaration readiness and a distinct, explicit submit action. Zero assigned reviewers is reported as queued for human review.
- The submitted application view exposes queued, running, completed, or escalated screening state and optional stage feedback. Pending/running status refreshes while the page is foregrounded. Screening completion is explicitly distinct from an authorized human ethics decision.
- Browser WebMCP draft tools use the active owned React editor and the same save queue. Final submission holds an editor lock while saving, submitting, and refreshing status; competing editor mutations are rejected. Saved-field readiness is described as such. The browser adapter remains experimental and feature detected. The local fixture supplies an API-compatible test adapter; it does not prove native WebMCP support in every browser.
- Native password recovery checks global service availability before accepting an email request. An unavailable delivery configuration offers support/retry without claiming an email was queued. Recovery responses do not disclose account existence. Reset links capture a fragment token, support legacy query links, clear URL parameters, and keep the token only in component memory. Valid existing reset tokens work independently of delivery availability. Password fields consistently support the existing 12–200-character policy for new passwords.

## Reproducible checks

Use the repository's supported Node runtime (Node 24 was used locally):

```sh
pnpm exec tsc --noEmit
pnpm exec vitest run client/src/lib/draftSaver.test.ts client/src/lib/aiReviewPresentation.test.ts client/src/lib/stage2AgentBridge.test.ts client/src/lib/webmcp.test.ts
node scripts/test-applicant-flow.mjs
```

The four focused test files passed 30 tests. The final applicant browser run passed 148 checks. The script exercises actual application modules and Tailwind styling in React StrictMode at a 390px mobile viewport, independently in English and Arabic. Every backend, provider, model, submission, and email operation is synthetic and intercepted. It writes screenshots, source hashes and `receipt.json` to a temporary `irb-applicant-flow-*` folder outside the repository.

Browser coverage includes ordered/debounced writes, typing during save/review, duplicate requests, outage presentation, failed-save recovery, explicit suggestion acceptance, stale-suggestion protection, Stage 1 progression, named readiness requirements, explicit final submission, background screening status, browser-agent editing/submission locking, recovery availability, fragment/query token removal, generic errors, cleared password controls, private-route analytics exclusion, owner editing of legacy AI-passed drafts without a submission timestamp, and frozen timestamped submissions including rejected agent updates. Arabic screenshots were visually inspected, and both-language overflow and browser exception checks passed.

Combined repository tests, production bundle budgets, CI, deployment, live API behavior, and actual recovery-mail delivery remain separate release evidence owned by the release run.
