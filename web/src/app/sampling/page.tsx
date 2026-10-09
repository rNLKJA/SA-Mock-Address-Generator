import type { Metadata } from "next";
import Link from "next/link";
import { CheckCircle2, History } from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { ScrollTable } from "@/components/common/scroll-table";
import { DesignChart } from "@/components/sampling/design-chart";
import { PointPatternFigure } from "@/components/sampling/point-pattern-figure";
import { SampleSizeCalculator } from "@/components/sampling/sample-size-calculator";
import { DESIGN_COLOR } from "@/lib/palette";
import type { Rate, SingleSample } from "@/lib/sampling/design-study";
import { getSamplingEvidence } from "@/lib/server/sampling";
import { FIT_METHOD_LABEL, chiSquareSf, cohensWLabel } from "@/lib/stats";
import { formatInt, formatP, formatPctFixed } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Sampling design",
  description:
    "Uniform, weighted and stratified sampling of mock South Australian addresses, checked over 200 seeds: Wilson intervals, exact and chi-square goodness of fit, a sample-size calculator, point-in-polygon validation and Clark-Evans uniformity.",
};

const SECTIONS = [
  ["designs", "Three designs"],
  ["one-sample", "One sample"],
  ["small-samples", "Small samples"],
  ["sample-size", "Sample size"],
  ["spatial", "Spatial checks"],
] as const;

function Section({
  id,
  eyebrow,
  title,
  children,
}: {
  id: string;
  eyebrow: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section aria-labelledby={id} className="scroll-mt-20 space-y-5">
      <div className="space-y-1.5">
        <p className="eyebrow">{eyebrow}</p>
        <h2 id={id} className="text-2xl font-semibold sm:text-3xl">
          {title}
        </h2>
      </div>
      {children}
    </section>
  );
}

/** "3.0% (1.4% to 6.4%)" */
function rateText(r: Rate, digits = 1): string {
  return `${formatPctFixed(r.rate, digits)} (95% CI ${formatPctFixed(r.lo, digits)} to ${formatPctFixed(r.hi, digits)})`;
}

const TH = "px-3 py-2.5 font-medium";

const NUMBER_WORDS: Record<number, string> = {
  2: "two",
  3: "three",
  4: "four",
  5: "five",
};

/** Areas: two decimals below 10 km², one below 100, whole numbers above. */
function formatArea(km2: number): string {
  if (km2 < 10) return `${km2.toFixed(2)} km²`;
  if (km2 < 100) return `${km2.toFixed(1)} km²`;
  return `${formatInt(Math.round(km2))} km²`;
}
const TD = "px-3 py-2 text-right font-mono text-xs whitespace-nowrap tabular-nums";

function SampleTable({ sample, title }: { sample: SingleSample; title: string }) {
  return (
    <ScrollTable label={title}>
      <table className="w-full min-w-[36rem] text-sm">
        <caption className="px-3 pt-3 text-left text-sm font-medium">{title}</caption>
        <thead>
          <tr className="border-b text-left text-xs text-muted-foreground">
            <th scope="col" className={TH}>
              Remoteness area
            </th>
            <th scope="col" className={`${TH} text-right`}>
              Count
            </th>
            <th scope="col" className={`${TH} text-right`}>
              Share
            </th>
            <th scope="col" className={`${TH} text-right`}>
              95% Wilson CI
            </th>
            <th scope="col" className={`${TH} text-right`}>
              Target
            </th>
            <th scope="col" className={`${TH} text-right`}>
              Residual
            </th>
          </tr>
        </thead>
        <tbody>
          {sample.rows.map((r) => (
            <tr key={r.label} className="border-b last:border-0">
              <th scope="row" className="px-3 py-2 text-left font-normal">
                {r.label}
              </th>
              <td className={TD}>{formatInt(r.k)}</td>
              <td className={TD}>{formatPctFixed(r.share)}</td>
              <td className={TD}>
                {formatPctFixed(r.lo)} to {formatPctFixed(r.hi)}
              </td>
              <td className={TD}>{formatPctFixed(r.target, 0)}</td>
              <td className={TD}>
                {r.residual > 0 ? "+" : ""}
                {r.residual.toFixed(1)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </ScrollTable>
  );
}

function fitSentence(s: SingleSample): string {
  const f = s.fit;
  return `${FIT_METHOD_LABEL[f.method][0].toUpperCase()}${FIT_METHOD_LABEL[f.method].slice(1)}: χ²(${f.df}) = ${f.statistic.toFixed(2)}, ${formatP(f.pValue)}; Cohen's w = ${f.w.toFixed(3)} (${cohensWLabel(f.w)}).`;
}

export default function SamplingPage() {
  const e = getSamplingEvidence();
  const study = e.designs;
  const byId = Object.fromEntries(study.designs.map((d) => [d.id, d]));
  const weighted = byId.weighted;
  const weightedRejection = weighted.rejection!;
  const coverage = weighted.strata.map((s) => s.coverage!.rate);
  const small = e.examples.small;
  const smallChiP = chiSquareSf(small.fit.statistic, small.fit.df);
  const u = e.uniformity;
  const headline = u.suburbs[0];
  const [geocoded, clustered] = u.controls.items;
  const multiPart = u.suburbs.find((s) => s.parts > 1);

  return (
    <>
      <PageHeader
        eyebrow="Sampling design"
        title="Does each design deliver the mix it promises?"
      >
        <p>
          The generator can draw addresses three ways: uniformly over suburbs (what the
          2025 code did), weighted by remoteness, or stratified with fixed quotas. This
          page puts each one through the real generator with fixed seeds and asks two
          questions: does the sample hit its target mix, with honest uncertainty, and do
          the coordinates land where they should?
        </p>
        <p>
          Every number is computed at build time by the same code that runs on{" "}
          <Link href="/generate">/generate</Link>, from the seeds shown, so a rebuild
          gives the same numbers. How the checks were designed is on{" "}
          <Link href="/methods#evaluation">Methods</Link>.
        </p>
      </PageHeader>

      <div className="mx-auto max-w-7xl space-y-16 px-4 sm:px-6">
        <nav aria-label="On this page" className="-mt-2 flex flex-wrap gap-2 text-sm">
          {SECTIONS.map(([href, label]) => (
            <a
              key={href}
              href={`#${href}`}
              className="rounded-full border bg-card px-3 py-1 text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
            >
              {label}
            </a>
          ))}
        </nav>

        <Section id="designs" eyebrow="200 seeds each" title="Three designs, one target">
          <div className="prose-notebook max-w-3xl">
            <p>
              The target is the remoteness mix in <code>config.py</code> that the 2025
              README promised (40% Major Cities, 25% Inner Regional, 20% Outer Regional,
              10% Remote, 5% Very Remote). Each design generated {formatInt(study.n)}{" "}
              addresses with seeds {study.firstSeed} to{" "}
              {study.firstSeed + study.replicates - 1}. A good weighted design should miss
              the target only by chance: its 95% Wilson intervals should cover the target
              about 95% of the time, and a goodness-of-fit test at the 5% level should
              reject it about 5% of the time.
            </p>
          </div>

          <ul className="grid gap-3 md:grid-cols-3">
            {study.designs.map((d) => (
              <li key={d.id} className="space-y-2 rounded-xl border bg-card p-4">
                <p className="flex items-center gap-2 font-heading text-lg font-semibold">
                  <span
                    aria-hidden
                    className="inline-block size-3 rounded-full"
                    style={{ background: DESIGN_COLOR[d.id] }}
                  />
                  {d.label}
                </p>
                <p className="text-sm text-muted-foreground">{d.summary}</p>
                <dl className="space-y-1.5 border-t pt-2 text-sm">
                  {d.rejection ? (
                    <div>
                      <dt className="text-xs text-muted-foreground">
                        Seeds where the test rejects the target at 5%
                      </dt>
                      <dd className="font-mono text-xs tabular-nums">
                        {formatInt(d.rejection.k)} of {formatInt(d.rejection.n)},{" "}
                        {rateText(d.rejection)}
                      </dd>
                    </div>
                  ) : (
                    <div>
                      <dt className="text-xs text-muted-foreground">
                        Goodness-of-fit test
                      </dt>
                      <dd className="text-xs">
                        Not tested: the quotas fix every share (
                        <span className="font-mono tabular-nums">
                          {formatInt(d.seedsOnTarget)} of {formatInt(study.replicates)}
                        </span>{" "}
                        seeds exactly on target)
                      </dd>
                    </div>
                  )}
                  <div>
                    <dt className="text-xs text-muted-foreground">
                      Distance from the target (Cohen&apos;s w)
                    </dt>
                    <dd className="font-mono text-xs tabular-nums">
                      {d.fixedByDesign
                        ? `${d.w.mean.toFixed(3)} in every seed (no sampling variation)`
                        : `mean ${d.w.mean.toFixed(3)} (${cohensWLabel(d.w.mean)}), middle 95% ${d.w.range[0].toFixed(3)} to ${d.w.range[1].toFixed(3)}`}
                    </dd>
                  </div>
                </dl>
              </li>
            ))}
          </ul>

          <DesignChart study={study} />

          <div className="grid gap-4 lg:grid-cols-3">
            <div className="prose-notebook text-sm">
              <p>
                <strong className="text-foreground">Uniform</strong> misses badly and
                consistently: Major Cities gets about{" "}
                {formatPctFixed(byId.uniform.strata[0].meanShare, 0)} instead of 40%,
                because only {formatPctFixed(byId.uniform.strata[0].designShare, 0)} of
                suburbs are in a major city. The test catches it in every seed, and w
                around {byId.uniform.w.mean.toFixed(2)} (a{" "}
                {cohensWLabel(byId.uniform.w.mean)} effect, close to large) says the gap
                is substantial, not merely detectable.
              </p>
            </div>
            <div className="prose-notebook text-sm">
              <p>
                <strong className="text-foreground">Weighted</strong> behaves as theory
                says. The spread across seeds matches the multinomial standard deviation
                (for Major Cities {formatPctFixed(weighted.strata[0].sd, 2)} observed
                against {formatPctFixed(weighted.strata[0].theorySd, 2)} expected), the
                Wilson intervals cover the target in{" "}
                {formatPctFixed(Math.min(...coverage))} to{" "}
                {formatPctFixed(Math.max(...coverage))} of seeds per area, and the test
                rejects in {rateText(weightedRejection)}, consistent with its 5% level.
              </p>
            </div>
            <div className="prose-notebook text-sm">
              <p>
                <strong className="text-foreground">Stratified</strong> has nothing to
                test: the quotas fix every share, so{" "}
                {byId.stratified.seedsOnTarget === study.replicates ? "all " : ""}
                {formatInt(byId.stratified.seedsOnTarget)} of{" "}
                {formatInt(study.replicates)} seeds give exactly the target, and it is
                reported as fixed rather than given a test result or coverage interval.
                The suburbs, street numbers and names inside each area are still random.
                Use it when every area must be represented in a small sample; use weighted
                when you want the realistic variation of independent draws.
              </p>
            </div>
          </div>

          <details className="rounded-xl border bg-card">
            <summary className="cursor-pointer rounded-xl px-4 py-3 text-sm font-medium select-none hover:bg-muted/60">
              Show every number as a table
            </summary>
            <div className="px-4 pb-4">
              <ScrollTable label="Design study table" className="border-0">
                <table className="w-full min-w-[52rem] text-sm">
                  <thead>
                    <tr className="border-b text-left text-xs text-muted-foreground">
                      <th scope="col" className={TH}>
                        Design
                      </th>
                      <th scope="col" className={TH}>
                        Area
                      </th>
                      <th scope="col" className={`${TH} text-right`}>
                        Target
                      </th>
                      <th scope="col" className={`${TH} text-right`}>
                        Design share
                      </th>
                      <th scope="col" className={`${TH} text-right`}>
                        Mean share
                      </th>
                      <th scope="col" className={`${TH} text-right`}>
                        Middle 95% of seeds
                      </th>
                      <th scope="col" className={`${TH} text-right`}>
                        SD (theory)
                      </th>
                      <th scope="col" className={`${TH} text-right`}>
                        Wilson CI covers target
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {study.designs.flatMap((d) =>
                      d.strata.map((s, h) => (
                        <tr key={`${d.id}-${s.label}`} className="border-b last:border-0">
                          <th
                            scope="row"
                            className="px-3 py-1.5 text-left text-xs font-normal text-muted-foreground"
                          >
                            {h === 0 ? (
                              d.label
                            ) : (
                              <span className="sr-only">{d.label}</span>
                            )}
                          </th>
                          <td className="px-3 py-1.5">{s.label}</td>
                          <td className={TD}>{formatPctFixed(s.target, 0)}</td>
                          <td className={TD}>{formatPctFixed(s.designShare)}</td>
                          <td className={TD}>{formatPctFixed(s.meanShare, 2)}</td>
                          <td className={TD}>
                            {formatPctFixed(s.range[0])} to {formatPctFixed(s.range[1])}
                          </td>
                          <td className={TD}>
                            {formatPctFixed(s.sd, 2)} ({formatPctFixed(s.theorySd, 2)})
                          </td>
                          <td className={TD}>
                            {s.coverage ? (
                              <>
                                {s.coverage.k}/{s.coverage.n} (
                                {formatPctFixed(s.coverage.lo)} to{" "}
                                {formatPctFixed(s.coverage.hi)})
                              </>
                            ) : (
                              <span className="text-muted-foreground">n/a (fixed)</span>
                            )}
                          </td>
                        </tr>
                      )),
                    )}
                  </tbody>
                </table>
              </ScrollTable>
              <p className="mt-2 text-xs text-muted-foreground">
                &ldquo;Design share&rdquo; is what each design draws in expectation; the
                theoretical SD is √(p(1 − p)/n) at that share (zero for fixed quotas).
                Coverage intervals are 95% Wilson intervals over the 200 seeds. Coverage
                is not reported for the stratified design: its shares are fixed, so an
                interval around them would describe no real uncertainty.
              </p>
            </div>
          </details>
        </Section>

        <Section
          id="one-sample"
          eyebrow="Seed 2025, n = 2,000"
          title="One sample, read properly"
        >
          <div className="prose-notebook max-w-3xl">
            <p>
              The README&apos;s key result, recomputed: the same seed and size through the
              uniform and the weighted design. Each share comes with its 95% Wilson
              interval; the residual (O − E)/√E shows which areas drive the test
              statistic.
            </p>
          </div>
          <div className="grid gap-4 xl:grid-cols-2">
            <div className="min-w-0 space-y-2">
              <SampleTable sample={e.examples.uniform} title="Uniform (2025 behaviour)" />
              <p className="text-sm">{fitSentence(e.examples.uniform)}</p>
            </div>
            <div className="min-w-0 space-y-2">
              <SampleTable
                sample={e.examples.weighted}
                title="Weighted (config.py remoteness)"
              />
              <p className="text-sm">{fitSentence(e.examples.weighted)}</p>
            </div>
          </div>
          <p className="max-w-3xl text-sm text-muted-foreground">
            With 2,000 addresses even a trivial gap can reach significance, so the effect
            size matters as much as the p-value: w = {e.examples.uniform.fit.w.toFixed(3)}{" "}
            for the uniform sample sits at the boundary of a large effect by Cohen&apos;s
            conventions, while w = {e.examples.weighted.fit.w.toFixed(3)} for the weighted
            one is noise.
          </p>
        </Section>

        <Section
          id="small-samples"
          eyebrow="Exact multinomial or chi-square"
          title="Small samples: which test?"
        >
          <div className="prose-notebook max-w-3xl">
            <p>
              Test fixtures are often small. With 30 weighted addresses, Very Remote
              expects only {(0.05 * 30).toFixed(1)}, below the usual &ldquo;at least 5 per
              category&rdquo; rule for the chi-square approximation. The target check on{" "}
              <Link href="/generate">/generate</Link> therefore uses the exact multinomial
              test whenever the sample is small enough to enumerate every possible count
              vector, the chi-square test when every expected count is at least 5, and a
              seeded Monte Carlo p-value in between, and it names the test it used.
            </p>
            <p>
              Is the exact test worth it? The table gives each test&apos;s true
              false-alarm rate at the 5% level when the samples really do follow the
              target. It is computed exactly, by adding up the probability of every count
              vector a test would reject: no simulation and no seed.
            </p>
          </div>
          <ScrollTable label="False-alarm rates of the two tests" className="max-w-3xl">
            <table className="w-full min-w-[34rem] text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th scope="col" className={TH}>
                    Sample size
                  </th>
                  <th scope="col" className={`${TH} text-right`}>
                    Count vectors
                  </th>
                  <th scope="col" className={`${TH} text-right`}>
                    Exact test
                  </th>
                  <th scope="col" className={`${TH} text-right`}>
                    Chi-square
                  </th>
                  <th scope="col" className={`${TH} text-right`}>
                    Tests disagree
                  </th>
                </tr>
              </thead>
              <tbody>
                {e.smallSizes.map((s) => (
                  <tr key={s.n} className="border-b last:border-0">
                    <th scope="row" className="px-3 py-2 text-left font-normal">
                      n = {s.n}
                    </th>
                    <td className={TD}>{formatInt(s.outcomes)}</td>
                    <td className={TD}>{formatPctFixed(s.exact, 2)}</td>
                    <td className={TD}>{formatPctFixed(s.chiSquare, 2)}</td>
                    <td className={TD}>{formatPctFixed(s.disagree, 2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ScrollTable>
          <div className="prose-notebook max-w-3xl">
            <p>
              The honest answer for this target: the chi-square approximation&apos;s
              overall false-alarm rate is close to 5% even at these sizes, a known
              robustness of Pearson&apos;s statistic. Where it matters is the individual
              decision: the two tests disagree on about 2% of samples, which is roughly
              two in every five rejections. The exact test never exceeds its level by
              construction, so it is the one reported when it can be computed. For seed
              2025 with n = {small.n} the two agree: exact {formatP(small.fit.pValue)},
              chi-square {formatP(smallChiP)}.
            </p>
          </div>
        </Section>

        <Section
          id="sample-size"
          eyebrow="Planning"
          title="How many addresses do you need?"
        >
          <div className="prose-notebook max-w-3xl">
            <p>
              Three planning questions that come up when generating test data. Each comes
              down to the precision of a proportion. Share precision asks where a share
              with a known target lands, so it uses the exact binomial distribution; the
              per-area estimate is about a rate nobody knows yet, so it uses the Wilson
              interval the rest of the lab reports; zero failures uses the exact
              Clopper-Pearson bound. The normal approximation sits alongside for
              comparison.
            </p>
          </div>
          <SampleSizeCalculator />
        </Section>

        <Section id="spatial" eyebrow="Coordinates" title="Spatial checks">
          <div className="space-y-4">
            <h3 className="text-xl font-semibold">Every point inside its own suburb</h3>
            <div className="prose-notebook max-w-3xl">
              <p>
                Each mock coordinate is drawn by rejection sampling inside the
                suburb&apos;s simplified ABS boundary. The check looks every published
                point up again against all {formatInt(1696)} boundaries (the{" "}
                {formatInt(1695)} suburbs plus the non-addressable SA Remainder), not only
                the one it was drawn in, so a point in an overlap or across a border
                fails. The required rate is 100%; the Wilson interval says how sure that
                makes us.
              </p>
              <p>
                That lookup uses the same point-in-polygon routine as the sampler, so a
                bug in the routine could pass both. The routine is therefore checked on
                its own against Shapely (GEOS), which shares no code with it: for{" "}
                {formatInt(3000)} seeded points, half spread over the state&apos;s
                bounding box and half placed 10 cm either side of a boundary edge, the two
                agree on the suburb (or on no suburb) every time.
              </p>
            </div>
            <ScrollTable label="Point-in-polygon validation" className="max-w-4xl">
              <table className="w-full text-sm sm:min-w-[40rem]">
                <thead>
                  <tr className="border-b text-left text-xs text-muted-foreground">
                    <th scope="col" className={TH}>
                      Check
                    </th>
                    <th scope="col" className={`${TH} hidden text-right sm:table-cell`}>
                      Points
                    </th>
                    <th scope="col" className={`${TH} text-right`}>
                      Inside
                    </th>
                    <th scope="col" className={`${TH} text-right`}>
                      Rate (95% Wilson CI)
                    </th>
                    <th scope="col" className={`${TH} hidden text-right sm:table-cell`}>
                      Label-point fallbacks
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {e.validation.map((v) => (
                    <tr key={v.detail} className="border-b align-top last:border-0">
                      <th scope="row" className="px-3 py-2 text-left font-normal">
                        <span className="flex items-center gap-1.5">
                          {v.inside.k === v.points && (
                            <CheckCircle2
                              className="size-3.5 shrink-0 text-emerald-700 dark:text-emerald-400"
                              aria-label="Passed"
                            />
                          )}
                          {v.label}
                        </span>
                        <span className="block text-xs text-muted-foreground">
                          {v.detail}
                        </span>
                      </th>
                      <td className={`${TD} hidden sm:table-cell`}>
                        {formatInt(v.points)}
                      </td>
                      <td className={TD}>{formatInt(v.inside.k)}</td>
                      <td className={TD}>
                        {formatPctFixed(v.inside.rate, 2)}{" "}
                        <span className="block sm:inline">
                          ({formatPctFixed(v.inside.lo, 2)} to{" "}
                          {formatPctFixed(v.inside.hi, 2)})
                        </span>
                      </td>
                      <td className={`${TD} hidden sm:table-cell`}>
                        {formatInt(v.fallbacks)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </ScrollTable>
            <div className="flex max-w-4xl gap-3 rounded-xl border border-sa-gold/40 bg-sa-gold/[0.06] p-4 text-sm">
              <History className="mt-0.5 size-4 shrink-0 text-sa-gold" aria-hidden />
              <p className="text-ink-soft">
                <strong className="font-medium text-foreground">
                  What the check found.
                </strong>{" "}
                Its first run failed one point in 5,000 (seed 2025): a point drawn inside
                Mobilong, a few centimetres from its edge, crossed into the neighbouring
                suburb when it was rounded to six decimal places for output. The sampler
                now rounds before it tests, so a published point is always one that
                passed. The unit tests keep that exact point as a regression case.
              </p>
            </div>
          </div>

          <div className="space-y-4">
            <h3 className="text-xl font-semibold">Uniform inside the suburb</h3>
            <div className="prose-notebook max-w-3xl">
              <p>
                Inside a suburb the points should show complete spatial randomness: no
                clumping, no regular spacing. The Clark-Evans ratio R compares the mean
                distance from each point to its nearest neighbour with what randomness
                predicts for that area: R ≈ 1 for random, below 1 for clustered, above 1
                for evenly spaced. Because a suburb&apos;s edge cuts neighbours off, the
                expectation uses Donnelly&apos;s edge correction with the suburb&apos;s
                perimeter.
              </p>
            </div>
            <PointPatternFigure
              figure={u.figure}
              results={{
                generator: headline.example.r,
                geocoded: geocoded.result.r,
                clustered: clustered.result.r,
                n: u.pointsPerSuburb,
              }}
            />
            <ScrollTable label="Clark-Evans uniformity by suburb">
              <table className="w-full min-w-[56rem] text-sm">
                <thead>
                  <tr className="border-b text-left text-xs text-muted-foreground">
                    <th scope="col" className={TH}>
                      Suburb
                    </th>
                    <th scope="col" className={`${TH} text-right`}>
                      Area
                    </th>
                    <th scope="col" className={`${TH} text-right`}>
                      Compactness
                    </th>
                    <th scope="col" className={`${TH} text-right`}>
                      R, seed {u.headlineSeed}
                    </th>
                    <th scope="col" className={`${TH} text-right`}>
                      Mean R, {u.replicates} seeds (95% bootstrap CI)
                    </th>
                    <th scope="col" className={`${TH} text-right`}>
                      Middle 95% of R
                    </th>
                    <th scope="col" className={`${TH} text-right`}>
                      Rejects randomness at 5%
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {u.suburbs.map((s) => (
                    <tr key={s.code} className="border-b last:border-0">
                      <th scope="row" className="px-3 py-2 text-left font-normal">
                        {s.name}
                        {s.parts > 1 && (
                          <span className="block text-xs text-muted-foreground">
                            {NUMBER_WORDS[s.parts] ?? s.parts} separate parts
                          </span>
                        )}
                      </th>
                      <td className={TD}>{formatArea(s.areaKm2)}</td>
                      <td className={TD}>{s.compactness.toFixed(2)}</td>
                      <td className={TD}>
                        {s.example.r.toFixed(3)} ({formatP(s.example.pValue)})
                      </td>
                      <td className={TD}>
                        {s.rMean.estimate.toFixed(3)} ({s.rMean.lo.toFixed(3)} to{" "}
                        {s.rMean.hi.toFixed(3)})
                      </td>
                      <td className={TD}>
                        {s.rRange[0].toFixed(2)} to {s.rRange[1].toFixed(2)}
                      </td>
                      <td className={TD}>
                        {s.rejection.k}/{s.rejection.n} (
                        {formatPctFixed(s.rejection.lo, 0)} to{" "}
                        {formatPctFixed(s.rejection.hi, 0)})
                      </td>
                    </tr>
                  ))}
                  {u.controls.items.map((c) => (
                    <tr key={c.name} className="border-b bg-muted/40 last:border-0">
                      <th scope="row" className="px-3 py-2 text-left font-normal">
                        {c.name} (control)
                        <span className="block text-xs text-muted-foreground">
                          {u.controls.suburb}, {formatInt(c.result.n)} points
                        </span>
                      </th>
                      <td className={TD}>{formatArea(c.result.areaKm2)}</td>
                      <td className={TD}>{headline.compactness.toFixed(2)}</td>
                      <td className={TD}>
                        {c.result.r.toFixed(3)} (z = {c.result.z.toFixed(1)})
                      </td>
                      <td className={`${TD} text-muted-foreground`}>not repeated</td>
                      <td className={`${TD} text-muted-foreground`}>-</td>
                      <td className={TD}>flagged</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </ScrollTable>
            <div className="prose-notebook max-w-3xl text-sm">
              <p>
                Each suburb gets {formatInt(u.pointsPerSuburb)} points per seed, projected
                to kilometres around the suburb&apos;s centre; for these six the areas are
                within about 2% of the ABS figures, a gap that comes from simplifying the
                boundaries, not from the projection. Compactness is 4πA/P² (1 for a
                circle). For single-part suburbs the mean R sits at 1 and the test rejects
                in about 5% of seeds, as a calibrated test should.
                {multiPart
                  ? ` ${multiPart.name}, which has ${NUMBER_WORDS[multiPart.parts] ?? multiPart.parts} separate parts, sits slightly above 1 (${multiPart.rMean.estimate.toFixed(3)}) and is rejected in ${formatInt(multiPart.rejection.k)} of ${formatInt(multiPart.rejection.n)} seeds: Donnelly's correction was derived for a single rectangle, and a multi-part outline stretches it. Rejection sampling is uniform over the whole outline by construction, so the excess points at the reference value rather than the points; the controls show what real clustering looks like.`
                  : ""}
              </p>
            </div>
          </div>
        </Section>
      </div>
    </>
  );
}
