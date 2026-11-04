# NDPC registration assessment

Date: 2 November 2026. Not legal advice. Have a Nigerian data protection lawyer or a licensed Data Protection Compliance Organisation (DPCO) confirm.

## Does the NDPA apply to PrimaHunt?
**Yes.** PrimaHunt is operated from Lagos and processes personal data (emails, nicknames, photos) of people in Nigeria (NDPA s.2). The household/personal-use exemption doesn't fit: it is a public website that anyone can sign up to and that serves many separate groups.

## Must PrimaHunt register as a "data controller of major importance" (DCMI)?
Under the NDPA (s.44) and the GAID 2025, controllers and processors of major importance must register with the NDPC. The GAID treats an organisation as of major importance if, among other things, it processes the personal data of **more than 200 data subjects within six months**, or works in certain sectors (finance, health, telecoms, insurance, public sector, etc.). Tiers:

| Tier | Data subjects in 6 months | Annual fee (reported) | Other duties |
|---|---|---|---|
| Ordinary High Level (OHL) | over 200, under 1,000 | ₦10,000 | Renew yearly |
| Extra-High Level (EHL) | 1,000 to 5,000 | ₦100,000 | Annual Compliance Audit Return (CAR) via a DPCO by 31 March |
| Ultra-High Level (UHL) | over 5,000 | ₦250,000 | Annual CAR via a DPCO by 31 March |

**PrimaHunt today:** 17 user accounts in total, all created in the last six months (2 November 2026), with no sector designation, no payments processed and no sensitive data collected on purpose. That is **well under 200**, so **registration is not required right now.**

## When it becomes required
As soon as PrimaHunt processes data of **more than 200 people in any six-month window**. In practice: more than 200 accounts created or active in six months. Registration would then be at the **OHL** tier (₦10,000/year) until 1,000 people.

Check monthly:
```sql
SELECT count(*) FROM hunt.users WHERE created_at > now() - interval '6 months';
SELECT count(*) FROM hunt.users;
```
Action at **150** users: prepare registration (NDPC portal at ndpc.gov.ng). At **200**: register.

## Duties that apply now, whatever the size
- Lawful basis and a clear privacy notice → `/privacy`, consent at sign-up (`hunt.consents`).
- Data minimisation and retention limits → 7-day deletion job (`lib/retention.js`).
- Data subject rights → download data (`GET /api/me/export`), delete account (`DELETE /api/me`), email contact.
- Security of processing → see the Privacy Policy section 8.
- Breach notification within 72 hours → `docs/BREACH_RESPONSE.md`.
- Cross-border transfer safeguards → `docs/HOSTING_AND_TRANSFERS.md`.
- No children's data → 18+ confirmation at sign-up.

## Not needed at this size (revisit if PrimaHunt grows)
- A Data Protection Officer (required for DCMIs).
- A Data Protection Impact Assessment, unless processing becomes high-risk (e.g. adding location tracking, face recognition or payments).

## Sources
- DLA Piper, Data Protection Laws of the World, Nigeria: registration — https://dlapiperdataprotection.com/?c=NG&t=registration
- NDPC Guidance Notice on Registration of DCPMIs — https://ndpc.gov.ng/wp-content/uploads/2025/07/Updated-Guidance-Notice-on-Registtration-2024.pdf
- NDPR Toolkit, NDPC registration guide (2026) — https://ndprtoolkit.com.ng/blog/ndpc-registration-guide-2026/
