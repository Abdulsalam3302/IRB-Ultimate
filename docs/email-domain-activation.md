# irb-sa.org and committee@irb-sa.org activation

Verified on **2026-10-18 (Asia/Riyadh)**: the public website, automated Resend delivery, and the existing Google Workspace committee mailbox are operational. These are separate observations; the table below records the actual evidence rather than treating configuration as delivery proof.

| Path | Observed result |
| --- | --- |
| Public website | `https://irb-sa.org/` returned HTTPS 200; `www` redirected to the canonical apex. API liveness, database/schema readiness, and password-recovery availability returned HTTP 200. |
| Native owner login | A fresh email/password sign-in reached the authenticated dashboard and owner Email page. No password was changed. |
| Automated transactional mail | One native password-recovery request queued and delivered a bilingual message from `IRB Saudi Arabia <committee@irb-sa.org>` to the owner test inbox. Resend recorded delivery; the application recorded the signed delivery callback; Gmail recorded inbox receipt with SPF, DKIM and DMARC pass. The reset link was not completed. |
| Receiving and human reply | A synthetic message with reference `IRB-MAIL-20261018` reached the committee Gmail inbox. Its committee reply reached the originating test inbox, with Google DKIM, SPF and DMARC pass. No research or participant information was used. |
| Provider scope | Existing Resend key has **Sending access restricted to `irb-sa.org`**. Domain is verified, TLS is enforced, and the production webhook is enabled. No duplicate key was created. |
| Registrar | Squarespace overview shows **Active**, renewal on **2027-09-15**, auto-renewal managed by Google Workspace, and domain lock on. WHOIS privacy was enabled during this maintenance. No DNS records, payment details or subscription were changed. |

These checks do not certify every user email event or an official committee decision. Decision attachments and authority still require their own eligible synthetic workflow and institutional authorization. No real application was submitted, approved, rejected or retracted during this mail check.

## Current routing plan

- Website: existing Vercel project `irb-saudi-arabia`, with `irb-sa.org` serving as the canonical public origin. The API is proxied to the existing Render service.
- Existing mailbox: `committee@irb-sa.org` is a working Google Workspace Gmail inbox. Public DNS retains MX `1 smtp.google.com.`. Preserve the receiving setup. The authenticated registrar overview now shows an active domain and no outstanding contact-verification or terms blocker; future renewal still depends on the Google Workspace account remaining funded and accessible.
- Gmail branding: the existing bilingual `IRB Saudi Arabia` signature and logo remain the default for new messages and replies/forwards. On 2026-10-18 the legacy Vercel portal and logo links were changed to `https://irb-sa.org/` and `https://irb-sa.org/email-logo.png`. The canonical logo returned HTTP 200 with PNG content. No message was sent by this settings change.
- Optional future receiving alternative: Cloudflare Email Routing can forward mail to a separately confirmed Gmail inbox if the owner later chooses to replace Google Workspace. That would be a mailbox migration, not a prerequisite for this existing account. Do not overwrite the current Google MX records or add catch-all routing without that decision.
- Automated outgoing mail: Resend HTTPS API. The application is configured for a 90-attempt daily budget, with a separate bulk allowance reserving capacity for account and decision mail. Check the current provider account quota before changing this limit. A provider subscription quota and the application's budget are separate controls.
- Human replies: use the existing committee Gmail mailbox. A future free forwarding arrangement could use Gmail “Send mail as” with a verified outbound SMTP provider. An alias/forwarding address has no separate inbox password; a Resend SMTP password is an API credential. Existing Workspace billing was not changed; this setup must not be described as an entirely free mailbox service.
- Portable fallback: a separately verified SMTP provider can be selected by the operator. Pending attempted messages are held for reconciliation after provider/account changes to avoid duplicate sends. No automatic provider switch transmits research material to an unapproved processor.

Provider references checked on 2026-09-15: [Resend pricing](https://resend.com/pricing), [Resend SMTP](https://resend.com/docs/send-with-smtp), [Cloudflare Email Service](https://developers.cloudflare.com/email-service/), [Render free service limitations](https://render.com/docs/free). Cloudflare outbound Email Sending is a separate offering; this plan uses its receiving/forwarding feature. Render Free blocks common SMTP ports; the primary transport is HTTPS.

## DNS handover

1. Keep the Squarespace domain active and review renewal before 2027-09-15. The owner authorized the previously pending Squarespace and Resend terms; neither authenticated provider dashboard presented a remaining terms acceptance blocker in this maintenance. No new account or duplicate persistent key was necessary.
2. Keep the existing Squarespace DNS and Google receiving setup for the current plan. Only if the owner chooses a future Cloudflare migration: add the domain on the free plan, import and verify all records, and change nameservers to the pair Cloudflare actually assigns. Do not guess nameservers or enable an unrelated paid Workers plan.
3. The Vercel website records are already working. Do not replace them from historical instructions. Re-run `vercel domains verify irb-sa.org --scope researcher-os` and inspect the current recommended records if a future change is necessary.
4. Preserve the current Google MX/SPF records. For an explicitly chosen future receiving migration, use the exact incoming MX/TXT records supplied by Cloudflare and verify forwarding with a real test message.
5. Add the exact DKIM and return-path records supplied by Resend. Keep the receiving MX records at the root and the sending return-path records on their provider-specified subdomain. Avoid duplicate SPF records at a single name. Set DMARC after alignment is verified and monitor before tightening enforcement.
6. Verify Vercel HTTPS issuance and application routing, then set `PUBLIC_APP_URL`, `VITE_PUBLIC_SITE_URL`, and the exact allowed origins to the final domain. Rebuild public SEO pages, sitemap and robots metadata. Keep old application URLs working during the transition; validate cookie/auth callback behavior before redirecting old traffic.

## Application configuration and acceptance

Set server-only `MAIL_PROVIDER=resend`, `MAIL_FROM=committee@irb-sa.org`, a durable 32-byte hex `MAIL_ENCRYPTION_KEY`, `RESEND_API_KEY`, and `RESEND_WEBHOOK_SECRET`. Keep the encryption key backed up separately from the database. Configure the signed callback at `/api/email/webhook/resend` on the live API route. Do not expose any of these secrets through `VITE_` configuration.

The admin Email page at `/admin/email` shows configuration state, recipient directory, message previews, queue states and delivery receipts. Owner confirmation freezes the audience and message for a bounded batch; retrying confirmation does not create another campaign. Each recipient gets a separate message, with unsubscribe for optional updates. A bulk campaign is not sent merely by opening a preview.

Run synthetic welcome, fragment-link password recovery, submission, and eligible authorized decision events. Confirm real PDF attachments match the recorded decision, forged callbacks are rejected, obsolete recovery links are cancelled, and account erasure clears encrypted queue payloads. A provider outage must leave a retry or unknown state, not a false delivered receipt. Record one Gmail receive/reply round-trip and one signed Resend delivery receipt before declaring the committee mailbox operational.

Official decision issuance remains tied to the responsible committee's activation and recorded authorization. Domain setup, email branding, AI screening and marketing do not themselves confer institutional IRB authority.
