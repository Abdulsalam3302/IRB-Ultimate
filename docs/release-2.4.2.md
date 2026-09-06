# IRB Ultimate 2.4.2

The public sign-in page now offers email/password and registration without the unused “More sign-in options” link. Google and other social methods are not advertised. Existing staff connected-account deep links remain supported so appointed staff can complete their configured verification flow.

The owner login incident was a mismatch between the supplied password and the stored password hash. The existing native owner account was repaired separately in production, preserving its identity and role. An actual browser sign-in with the supplied password reached the Administration Panel and AI Swarm tab without MFA. No credential, password hash or session token is included in this release.

The browser regression checks cover the absence of alternative options in English and Arabic, ordinary sign-in, credential isolation, provider-outage recovery, owner presentation and staff verification. The normal CI and exact-commit deployment gates remain in place.
