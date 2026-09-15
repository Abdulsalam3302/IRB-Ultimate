# IRB Ultimate 2.5: applicant workflow and communications

## Refined project instruction

Make the Saudi research ethics application journey clear, fast, and reliable for researchers and their authorized agents. Diagnose and fix the reported Stage 2 failures using reproducible cases. Preserve substantive scientific and participant-protection standards while eliminating false missing-field warnings, misleading failure scores, duplicated work, and avoidable waiting.

Save drafts independently of AI availability. Explain precisely what information is missing and why it matters, using natural Arabic and English labels. Accept concise, valid answers and justified non-applicability. Offer explicit, reviewable AI suggestions based on supplied facts; never invent consent, methods, participants, institutional authority, or approvals. Use compact, study-appropriate prompts, bounded provider calls, exact-input reuse, concurrency controls, and consistent paid-call accounting.

After an explicit submission, atomically record one submission and enqueue durable automatic screening. Return an immediate receipt. Run screening in the background, attach the evidence and risks, and route complete, unflagged work to the authorized decision process. Escalate uncertain, incomplete, flagged, or unavailable assessments to a qualified human. Only a valid decision recorded under the responsible committee's authority may produce an approval certificate; a score alone must never authorize research. Automate document generation and delivery after the authorized decision.

Support browser WebMCP and the authenticated server MCP through narrowly scoped, validated tools. Revalidate the signed-in user for each browser action. Agent edits must share the visible editor's save queue. Require explicit submission intent and preserve the applicant's declarations and ownership checks.

Prepare irb-sa.org as the public origin and committee@irb-sa.org as the sender and reply address. Activate DNS, TLS, canonical links, redirects, authentication origins, and email only after domain control and provider configuration are verified. Use free Cloudflare receiving/forwarding, Resend outbound delivery, and the owner's confirmed Gmail inbox where appropriate. Preserve a portable SMTP provider option. Do not expose API credentials or reuse a mailbox password as an SMTP API key.

Deliver bilingual, branded welcome, recovery, submission, and decision messages through an encrypted durable outbox with idempotency, bounded retries, suppression handling, explicit delivery states, and verified callbacks. Attach genuine decision PDFs corresponding to the current recorded decision. Provide a paginated administrator directory and an owner-controlled message preview/confirmation workflow. Do not send an unsolicited bulk announcement during implementation.

Verify migrations, session invalidation, private-data deletion, retry/concurrency behavior, browser flows in both languages, and provider failure states. Commit, push, deploy the exact tested revision, and verify the public runtime. Report code, tests, deployment, DNS, provider acceptance, inbox delivery, and committee authority as separate evidence states. Identify any remaining account access or operator decision precisely.

## Acceptance criteria

| Area | Required evidence |
|---|---|
| False missing fields | A populated sample size of `50` is present; unresolved placeholders are identified rather than called empty. |
| Provider outage | No fabricated zero score, no major-revision verdict attributed to an unperformed review, previous completed assessment retained. |
| Draft reliability | Changes made during an outstanding save persist; review/download/navigation flush the same queue; a failed save prevents losing the draft. |
| Suggestions | Applicant accepts proposed changes explicitly; edits made after an AI request are preserved. |
| Submission | Eight concurrent retries create one submission version, one screening job, and one set of assignments. |
| Proportional review | Full-board and non-full-board requests use different assignment counts; human authority and scientific objections remain enforced. |
| Automatic screening | Immutable submitted content, bounded attempts, crash recovery, exact-input reuse, and readable screening status without issuing a decision. |
| Recovery | Single-use expiring token, hash-only token table, encrypted email, no token in the outgoing URL query, session-version revocation, concurrent redemption rejected. |
| Email | Single-recipient sends, authentic PDFs, encrypted payloads, safe webhook validation, unsubscribe/suppression, explicit unknown/accepted/delivered distinction. |
| Agents | Strict schemas, current-session validation, application ownership, editor synchronization, cancellation and logout cleanup. |
| Deployment | Passing checks and build for the same commit, healthy backend and frontend readback; domain and email verification recorded separately. |

## Operator decisions still required

- Confirm ownership and registrar access for irb-sa.org. Public DNS currently points to Squarespace nameservers; that fact does not prove ownership.
- Confirm which Gmail inbox receives committee@irb-sa.org and complete Resend account sign-in/terms where required.
- Supply the responsible committee's registration/appointment and decision policy before activating official certificate issuance. The platform has not established that an AI-only decision meets the institution's obligations.
- Confirm the controller/contact details, jurisdiction and data-hosting arrangements before real confidential research intake and paid acquisition, as previously reserved by the owner.
