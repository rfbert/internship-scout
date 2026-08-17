import { prisma } from "@/lib/prisma";
import { PageFrame } from "@/components/register/page-frame";
import { Footnote, Legend, type LegendItem } from "@/components/register/footnote";
import { DotLeader, SectionRule } from "@/components/register/rule";
import { DEFAULT_WEIGHTS, SCORE_COMPONENTS } from "@/lib/constants";
import type { ScoreComponent } from "@/lib/constants";
import { TOKEN_TEXT } from "@/lib/format";
import { resolveScoringKnobs } from "@/server/scoring";
import { readUiPrefs } from "@/server/ui-prefs";
import { TARGET_SEASON_RX } from "@/app/api/settings/validation";
import { SettingsForm, type SettingsFormValues } from "./settings-form";
import { DangerZone } from "./danger-zone";

export const dynamic = "force-dynamic";

const THRESHOLD_BANDS = [
  "EXCEPTIONAL",
  "HIGH_PRIORITY",
  "STRONG",
  "WORTH_REVIEWING",
  "REACH",
  "LOW_PRIORITY",
] as const;

export default async function SettingsPage() {
  const user = await prisma.user.findFirst();
  const prefs = user
    ? await prisma.userPreference.findUnique({ where: { userId: user.id } })
    : null;

  // The notation column is read through the guarded helper, never selected
  // directly: it post-dates the first migration, and the guard is what keeps
  // the page rendering in the window between a deploy and its migration.
  const { notation } = await readUiPrefs();

  const storedWeights = (prefs?.scoringWeights ?? {}) as Record<string, unknown>;
  const weights = {} as Record<ScoreComponent, number>;
  for (const c of SCORE_COMPONENTS) {
    const v = storedWeights[c];
    weights[c] = typeof v === "number" && Number.isFinite(v) ? v : DEFAULT_WEIGHTS[c];
  }

  // Effective role priorities / band thresholds: stored overrides resolved
  // over the defaults by the same code the scorer uses.
  const knobs = resolveScoringKnobs(prefs);

  const band = prefs?.reviewThresholdBand ?? "WORTH_REVIEWING";
  const initial: SettingsFormValues = {
    weights,
    reviewThresholdBand: (THRESHOLD_BANDS as readonly string[]).includes(band)
      ? (band as SettingsFormValues["reviewThresholdBand"])
      : "WORTH_REVIEWING",
    preferredArrangement: prefs?.preferredArrangement ?? "ONSITE",
    timezone: prefs?.timezone ?? "America/Los_Angeles",
    graduationDate: prefs?.graduationDate
      ? prefs.graduationDate.toISOString().slice(0, 10)
      : "",
    targetSeason:
      prefs?.targetSeason && TARGET_SEASON_RX.test(prefs.targetSeason) ? prefs.targetSeason : "",
    sponsorshipRequired: prefs?.sponsorshipRequired ?? true,
    roleAlignmentScores: knobs.roleAlignmentScores,
    bandThresholds: knobs.bandThresholds,
    notationMode: notation,
  };

  const [sampleListings, sampleCompanies] = await Promise.all([
    prisma.internshipListing.count({ where: { isSample: true } }),
    prisma.company.count({ where: { isSample: true } }),
  ]);


  /* The legend expands the marks that are ON THIS PAGE. `DEF` was not one of
     them and never had been: the ladder and the role rows print the lowercase
     word `default` when a field matches the app's value, and `def 60` — the
     value they would go back to — when it does not. So the legend named a
     mark nobody could find, and the mark it came closest to means the
     OPPOSITE of what the legend claimed. Both real marks are named instead. */
  /* `Σ` is gone from the legend, and its 152px is what pays for the two lines
     below. The mark is already expanded twice within a screen of itself — the
     Scoring weights rule reads `Σ MUST BE 100` and the total row reads
     `Σ TOTAL … 100 / 100` — so a third statement in the footnote was buying
     nothing, and the strip is one nowrap line: at 1100 the legend gets 493px,
     and the three items together needed 580. */
  const legend: LegendItem[] = [
    { mark: "default", meaning: "at the app's value" },
    { mark: "def 60", meaning: "what it would go back to" },
  ];

  return (
    <>
      <PageFrame
        eyebrow={`STANDING ORDERS · ${initial.timezone.toUpperCase()} · NOTATION ${notation}`}
        title="How the scout is instructed."
        figures={
          <>
            Review cut {initial.reviewThresholdBand.replace(/_/g, " ")}
            <br />
            Scoring deterministic
          </>
        }
      />

      <SettingsForm initial={initial} />

      {/* 7 · ENVIRONMENT — read-only. Mirrors the server's own resolution. */}
      <section className="mt-6">
        <SectionRule label="Environment" right="READ-ONLY · SET VIA .ENV" />
        <div className="grid gap-x-10 px-1 pt-2 lg:grid-cols-2">
          <ul>
            <DotLeader
              label="Scoring engine"
              value={<span className={TOKEN_TEXT.blue}>deterministic rules</span>}
              title="Every band on every listing is reproducible: the same posting and the same weights always yield the same score."
            />
            <DotLeader
              label="Role classification"
              value="rules"
              title="Title and description matching, shared by the import path and re-analysis so both agree."
            />
          </ul>
          <ul>
            <DotLeader
              label="Sponsorship verdicts"
              value="rules"
              title="Hard gates — citizenship, clearance, explicit no-sponsorship — are decided by rules alone and cannot be softened by a rescore."
            />
            <DotLeader
              label="Sample records on file"
              value={`${sampleListings} listings · ${sampleCompanies} companies`}
              muted={sampleListings === 0 && sampleCompanies === 0}
            />
          </ul>
        </div>
        {/* The section rule above already says READ-ONLY · SET VIA .ENV, so the
            third statement of it is gone — and it had called a two-column
            block "this line". */}
        <p className="px-1 pt-2 text-[11.5px] text-ink-3">
          Change these through <span className="font-mono text-[11px]">.env</span> or the
          deployment secrets, then redeploy — see the README.
        </p>
      </section>

      {/* 8 · DANGER ZONE ─────────────────────────────────────────────────── */}
      <section className="mt-6">
        <SectionRule label="Danger zone" tick="carmine" right="IRREVERSIBLE" />
        <div className="px-1 pt-2.5">
          <DangerZone sampleListings={sampleListings} sampleCompanies={sampleCompanies} />
        </div>
      </section>

      <Footnote
        legend={<Legend items={legend} />}
        keys={
          /* Measured, not guessed: the footnote is one nowrap line, and this
             slot and the legend share it. At 1100 the two together get 1074px
             — 493 here leaves the legend the 580 it needs. */
          <span>An empty field restores the app default · saved changes apply next run</span>
        }
      />
    </>
  );
}
