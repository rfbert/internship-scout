# Visa, CPT/OPT, and sponsorship analysis

The single most important evaluation in the system. Two layers: a deterministic
phrase-rule engine (always runs) and an AI language-analysis pass (augments when a
provider is configured). The UI never presents an inference as confirmed fact.

## Assessment categories

`listing_sponsorship_assessments.category` is one of:

| Category | Meaning |
|---|---|
| `SPONSORSHIP_OFFERED` | Listing explicitly offers visa sponsorship |
| `CPT_OPT_ACCEPTED` | Explicitly accepts CPT/OPT students |
| `FUTURE_POSSIBLE` | Language suggests future sponsorship is possible |
| `COMPANY_HISTORY` | No listing language, but company has verified sponsorship history |
| `UNCERTAIN` | Conflicting or vague signals |
| `NO_INFO` | Nothing found either way |
| `EXPLICITLY_UNAVAILABLE` | Listing states no sponsorship now/future |
| `UNRESTRICTED_AUTH_REQUIRED` | Requires unrestricted US work authorization |
| `CITIZENSHIP_REQUIRED` | Requires US citizenship |
| `CLEARANCE_REQUIRED` | Requires security clearance implying citizenship |
| `USER_INELIGIBLE` | Any other clear ineligibility for an F-1 student |

Confidence: `CONFIRMED | HIGH | MODERATE | LOW | UNKNOWN | EXPLICITLY_UNAVAILABLE`.

## Hard-reject phrases (deterministic, case-insensitive, applied to description + requirements)

Auto-reject (category `EXPLICITLY_UNAVAILABLE` / `CITIZENSHIP_REQUIRED` / etc.,
listing goes to Archive with reason, never to Review Queue):

- "must be a u.s. citizen" / "US citizenship required" / "citizens only"
- "must be a lawful permanent resident" / "green card holders only"
- "we do not sponsor" / "does not sponsor employment visas" / "unable to sponsor"
- "will not sponsor" / "cannot sponsor" / "no visa sponsorship"
- "must not require sponsorship now or in the future"
- "without the need for sponsorship now or in the future"
- "permanent unrestricted work authorization" / "unrestricted authorization to work"
- "active security clearance" / "ability to obtain a security clearance" (clearance
  implies citizenship → `CLEARANCE_REQUIRED`)
- Aggregator markers: 🇺🇸 (citizenship) from GitHub list legends

Flag-not-reject (kept, labeled prominently):

- "sponsorship not available for this role" *when the role is an internship* →
  `UNCERTAIN` with note: F-1 CPT internships don't require employer sponsorship;
  the phrase usually refers to H-1B. Kept for manual review, never auto-accepted.
- 🛂 marker from GitHub lists → same treatment.

## CPT/OPT logic (facts the engine encodes)

- A paid U.S. internship for an enrolled F-1 student generally runs on **CPT**
  authorized by the university — the employer does not "sponsor" anything, but must
  agree to the arrangement (a "no sponsorship" phrase is a yellow flag, not a hard bar).
- **OPT/STEM OPT** matters for the *return offer*: a CS degree is STEM-eligible
  (3-year OPT window), so post-graduation employment is possible without immediate
  H-1B — but long-term retention eventually requires sponsorship. Hence
  `future_sponsorship_potential` is scored separately from internship accessibility.

## Company sponsorship history

`company_sponsorship_evidence` rows store: evidence kind (`H1B_FILINGS`,
`EMPLOYER_STATEMENT`, `UNIVERSITY_DOC`, `PRIOR_POSTING`, `VERIFIED_REPORT`),
source name + URL, evidence date, free-text summary, and a reliability grade.
Public H-1B disclosure data (USCIS/DOL) can be imported manually or noted per company.
History raises `COMPANY_HISTORY` confidence but **never** upgrades a listing that
explicitly refuses sponsorship.

## Stored per assessment

category, confidence, matched phrases (exact quoted text from the listing),
conflicting signals, evidence source + date, model/prompt-version (if AI-assisted),
and a plain-English explanation of the conclusion.
