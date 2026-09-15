# irb-sa.org and committee@irb-sa.org activation

The email delivery code is installed but remains disabled until verified provider configuration is supplied. A configured transport is not proof of inbox delivery. Record provider acceptance, signed delivery callbacks, and receipt in the test inbox separately.

## Current routing plan

- Website: existing Vercel project `irb-saudi-arabia`. `irb-sa.org` was attached on 2026-09-15. Vercel reports domain ownership verified, but DNS is not yet connected. Existing Squarespace apex records remain unchanged.
- Existing mailbox: `committee@irb-sa.org` already opens a Google Workspace Gmail inbox. Public DNS has MX `1 smtp.google.com.` and SPF `v=spf1 include:_spf.google.com ~all`. Preserve these receiving records. Gmail displays a required Squarespace domain-contact verification notice; complete that verification before claiming continuing mail availability.
- Gmail branding: the bilingual `IRB Saudi Arabia` signature, public logo, committee email, and working portal link were saved and read back on 2026-09-15. It is the default for new messages and replies/forwards. No message was sent by this branding change.
- Optional future receiving alternative: Cloudflare Email Routing can forward mail to a separately confirmed Gmail inbox if the owner later chooses to replace Google Workspace. That would be a mailbox migration, not a prerequisite for this existing account. Do not overwrite the current Google MX records or add catch-all routing without that decision.
- Automated outgoing mail: Resend HTTPS API. Its Free plan currently allows 3,000 messages/month and 100/day. The application defaults to 90/day, with a separate bulk allowance reserving capacity for account and decision mail. This does not reserve capacity from manual Gmail/SMTP sending in the same Resend account.
- Human replies: use the existing committee Gmail mailbox. A future free forwarding arrangement could use Gmail “Send mail as” with a verified outbound SMTP provider. An alias/forwarding address has no separate inbox password; a Resend SMTP password is an API credential. The existing Workspace subscription/billing state has not been changed or verified by this release.
- Portable fallback: a separately verified SMTP provider can be selected by the operator. Pending attempted messages are held for reconciliation after provider/account changes to avoid duplicate sends. No automatic provider switch transmits research material to an unapproved processor.

Provider references checked on 2026-09-15: [Resend pricing](https://resend.com/pricing), [Resend SMTP](https://resend.com/docs/send-with-smtp), [Cloudflare Email Service](https://developers.cloudflare.com/email-service/), [Render free service limitations](https://render.com/docs/free). Cloudflare outbound Email Sending is a separate offering; this plan uses its receiving/forwarding feature. Render Free blocks common SMTP ports; the primary transport is HTTPS.

## DNS handover

1. Complete the Squarespace account/terms and domain-contact verification for the committee identity, then inspect domain ownership and all website/email DNS records before changing anything. The registrar terms screen is prepared; it has not been accepted by this release.
2. Keep the existing Squarespace DNS and Google receiving setup for the current plan. Only if the owner chooses a future Cloudflare migration: add the domain on the free plan, import and verify all records, and change nameservers to the pair Cloudflare actually assigns. Do not guess nameservers or enable an unrelated paid Workers plan.
3. Add the Vercel website records. Vercel's live recommendation on 2026-09-15 was apex A records `216.198.79.1` and `64.29.17.1`; re-run `vercel domains verify irb-sa.org --scope researcher-os` before applying, since recommendations can change.
4. Preserve the current Google MX/SPF records. For an explicitly chosen future receiving migration, use the exact incoming MX/TXT records supplied by Cloudflare and verify forwarding with a real test message.
5. Add the exact DKIM and return-path records supplied by Resend. Keep the receiving MX records at the root and the sending return-path records on their provider-specified subdomain. Avoid duplicate SPF records at a single name. Set DMARC after alignment is verified and monitor before tightening enforcement.
6. Verify Vercel HTTPS issuance and application routing, then set `PUBLIC_APP_URL`, `VITE_PUBLIC_SITE_URL`, and the exact allowed origins to the final domain. Rebuild public SEO pages, sitemap and robots metadata. Keep old application URLs working during the transition; validate cookie/auth callback behavior before redirecting old traffic.

## Application configuration and acceptance

Set server-only `MAIL_PROVIDER=resend`, `MAIL_FROM=committee@irb-sa.org`, a durable 32-byte hex `MAIL_ENCRYPTION_KEY`, `RESEND_API_KEY`, and `RESEND_WEBHOOK_SECRET`. Keep the encryption key backed up separately from the database. Configure the signed callback at `/api/email/webhook/resend` on the live API route. Do not expose any of these secrets through `VITE_` configuration.

The admin Email page at `/admin/email` shows configuration state, recipient directory, message previews, queue states and delivery receipts. Owner confirmation freezes the audience and message for a bounded batch; retrying confirmation does not create another campaign. Each recipient gets a separate message, with unsubscribe for optional updates. A bulk campaign is not sent merely by opening a preview.

Run synthetic welcome, fragment-link password recovery, submission, and eligible authorized decision events. Confirm real PDF attachments match the recorded decision, forged callbacks are rejected, obsolete recovery links are cancelled, and account erasure clears encrypted queue payloads. A provider outage must leave a retry or unknown state, not a false delivered receipt. Record one Gmail receive/reply round-trip and one signed Resend delivery receipt before declaring the committee mailbox operational.

Official decision issuance remains tied to the responsible committee's activation and recorded authorization. Domain setup, email branding, AI screening and marketing do not themselves confer institutional IRB authority.
