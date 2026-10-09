import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { CheckCircle2, Info } from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { ScrollTable } from "@/components/common/scroll-table";
import { Markdown } from "@/components/methods/markdown";
import { ANTHROPIC_MODELS, OPENAI_DEFAULT_MODEL } from "@/lib/ai/models";
import { MAX_SCENARIO_LENGTH } from "@/lib/ai/scenario-config";
import { loadDataCard, loadDecisionRecords } from "@/lib/content";
import { site } from "@/lib/site";

export const metadata: Metadata = {
  title: "Methods: data, decisions and the data card",
  description:
    "How the SA Mock Address Lab works and how its claims are checked: data provenance, the generator and its sampling designs, the evaluation design, assumptions, limitations, decision records, the data card and the AI use statement.",
};

const TOC = [
  { id: "data", label: "Data provenance" },
  { id: "method", label: "Method" },
  { id: "evaluation", label: "Evaluation design" },
  { id: "assumptions", label: "Assumptions" },
  { id: "limitations", label: "Limitations" },
  { id: "change", label: "What I'd change" },
  { id: "decisions", label: "Decision records" },
  { id: "data-card", label: "Data card" },
  { id: "ai-use", label: "AI use statement" },
];

const LINK =
  "text-primary underline decoration-primary/40 underline-offset-2 hover:decoration-primary";

function Section({
  id,
  eyebrow,
  title,
  children,
}: {
  id: string;
  eyebrow: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section id={id} aria-labelledby={`${id}-h`} className="scroll-mt-20 border-t pt-10">
      <p className="eyebrow">{eyebrow}</p>
      <h2 id={`${id}-h`} className="mt-2 text-2xl font-semibold sm:text-3xl">
        {title}
      </h2>
      <div className="mt-5 space-y-5">{children}</div>
    </section>
  );
}

function List({ items }: { items: ReactNode[] }) {
  return (
    <ul className="prose-notebook max-w-3xl list-disc space-y-2 pl-5 marker:text-muted-foreground">
      {items.map((item, i) => (
        <li key={i} className="leading-relaxed text-ink-soft">
          {item}
        </li>
      ))}
    </ul>
  );
}

export default function MethodsPage() {
  const decisions = loadDecisionRecords();
  const card = loadDataCard();

  const evaluation: [string, string, ReactNode][] = [
    [
      "The port reproduces the 2025 Python",
      "20 recorded runs (11 CLI invocations, 9 generator calls) of the original code, with both random generators seeded, must print the same bytes",
      <code key="a">original.test.ts</code>,
    ],
    [
      "The statistics are right",
      "Normal and chi-square functions, Wilson intervals, the exact multinomial test (against brute-force enumeration), the true size of each test, sample sizes (Wilson and exact binomial, against scipy.stats.binom), Clopper-Pearson bounds and the Clark-Evans ratio (against a SciPy k-d tree) checked against SciPy and statsmodels",
      <code key="b">stats.reference.test.ts</code>,
    ],
    [
      "Each design delivers its mix",
      "200 seeds of 1,000 addresses per design through the real generator: spread against multinomial theory, Wilson coverage of the target and the test's rejection rate, each with a Wilson interval",
      <Link key="c" className={LINK} href="/sampling#designs">
        /sampling#designs
      </Link>,
    ],
    [
      "The reported test fits the sample",
      "Exact multinomial when the sample can be enumerated, chi-square when every expected count is at least 5, a seeded Monte Carlo p-value otherwise; the false-alarm rate of both tests computed exactly at small n",
      <Link key="d" className={LINK} href="/sampling#small-samples">
        /sampling#small-samples
      </Link>,
    ],
    [
      "Every coordinate is inside its suburb",
      "Each point looked up again against all 1,696 boundaries (the 1,695 suburbs plus the non-addressable SA Remainder): 5,000 generated points per design and a census of 5 points in every suburb, required rate 100%, with a Wilson lower bound. The point-in-polygon routine itself is checked against Shapely (GEOS) on 3,000 seeded points (pip.reference.test.ts)",
      <Link key="e" className={LINK} href="/sampling#spatial">
        /sampling#spatial
      </Link>,
    ],
    [
      "Coordinates are uniform within a suburb",
      "Clark-Evans ratio with Donnelly's edge correction in six differently shaped suburbs, over 100 seeds (mean with a bootstrap interval, rejection rate with a Wilson interval), plus two negative controls",
      <Link key="f" className={LINK} href="/sampling#spatial">
        /sampling#spatial
      </Link>,
    ],
    [
      "The numbers in the docs are the code's",
      "The figures quoted in the README, the decision records and on /sampling are recomputed and compared",
      <code key="g">claims.test.ts</code>,
    ],
    [
      "The AI client is safe with a key",
      "Adapters, errors, key storage, redaction, the audit log and the proposal review, with the network mocked",
      <code key="h">ai.test.ts</code>,
    ],
  ];

  return (
    <>
      <PageHeader
        eyebrow="Methods"
        title="How it works, how it is checked, and what it cannot tell you"
      >
        <p>
          The data and where it comes from, the generator and its sampling designs, how
          each claim on the site is checked, the assumptions and limits, the decisions
          behind them, a data card for the reference table, and what the optional AI
          feature does.
        </p>
      </PageHeader>

      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <div className="grid gap-10 lg:grid-cols-[14rem_minmax(0,1fr)]">
          <nav aria-label="On this page" className="lg:sticky lg:top-20 lg:h-fit">
            <ol className="flex flex-wrap gap-2 text-sm lg:flex-col lg:gap-1">
              {TOC.map((t, i) => (
                <li key={t.id}>
                  <a
                    href={`#${t.id}`}
                    className="flex gap-2 rounded-md border bg-card px-3 py-1 text-muted-foreground transition-colors hover:text-foreground lg:border-0 lg:bg-transparent lg:px-2"
                  >
                    <span className="font-mono text-xs leading-5 text-muted-foreground">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    {t.label}
                  </a>
                </li>
              ))}
            </ol>
          </nav>

          <div className="min-w-0 space-y-12">
            <Section id="data" eyebrow="01 · data" title="Data provenance">
              <div className="prose-notebook max-w-3xl">
                <p>
                  The reference table is rebuilt from Australian Bureau of Statistics open
                  data (ASGS Edition 3, the 2021 Census mesh block counts and SEIFA 2021,
                  all CC BY 4.0) by <code>scripts/build_data.py</code>, which anyone can
                  rerun. The 2025 table it replaces had no recorded source; it stays in{" "}
                  <code>original/</code>, and the <Link href="/data">Data page</Link>{" "}
                  compares the two row by row. The <a href="#data-card">data card</a>{" "}
                  below lists every source, how each field is built and the limits of each
                  one.
                </p>
                <p>
                  No personal information is used anywhere: every input is published,
                  area-level statistics, and every output is synthetic and stamped
                  &ldquo;MOCK: synthetic test data&rdquo;.
                </p>
              </div>
            </Section>

            <Section id="method" eyebrow="02 · method" title="Method">
              <List
                items={[
                  <>
                    <strong className="font-medium text-foreground">
                      The address recipe
                    </strong>{" "}
                    is the 2025 one, ported line by line: a suburb, a street number from 1
                    to 999 and one of 49 street names, drawn with a reimplementation of
                    Python&apos;s Mersenne Twister so a seed gives the same addresses as
                    the original code would.
                  </>,
                  <>
                    <strong className="font-medium text-foreground">Five designs</strong>{" "}
                    choose the suburb: uniform (the 2025 behaviour), remoteness or SEIFA
                    weights (a two-stage draw: category, then suburb), population, and
                    stratified with fixed quotas per remoteness area (
                    <a href="#dr-002">DR-002</a>, <a href="#dr-005">DR-005</a>).
                  </>,
                  <>
                    <strong className="font-medium text-foreground">Coordinates</strong>{" "}
                    are drawn uniformly inside the suburb&apos;s ABS boundary by rejection
                    sampling, from a separate seeded stream, rounded to 6 decimals before
                    the inside test (<a href="#dr-003">DR-003</a>).
                  </>,
                  <>
                    <strong className="font-medium text-foreground">
                      The target check
                    </strong>{" "}
                    on /generate reports each category&apos;s realised share with a 95%
                    Wilson interval and a goodness-of-fit test chosen for the sample
                    (exact multinomial, chi-square or Monte Carlo), with n and
                    Cohen&apos;s w.
                  </>,
                  <>
                    <strong className="font-medium text-foreground">The lookup</strong>{" "}
                    asks Photon for coordinates through a cached, rate-limited route, then
                    finds the suburb by point-in-polygon in the browser (
                    <a href="#dr-001">DR-001</a>).
                  </>,
                ]}
              />
            </Section>

            <Section id="evaluation" eyebrow="03 · evaluation" title="Evaluation design">
              <p className="prose-notebook max-w-3xl">
                Each claim the site makes has a check that could fail. Statistical claims
                are checked over many seeds, with the uncertainty of the check itself
                reported (a rejection rate over 200 seeds is a proportion, so it gets a
                Wilson interval too). Seeds are fixed and shown next to every result.
              </p>
              <ScrollTable label="Evaluation design">
                <table className="w-full min-w-[44rem] text-sm">
                  <thead>
                    <tr className="border-b text-left text-xs text-muted-foreground">
                      <th scope="col" className="px-3 py-2.5 font-medium">
                        Claim
                      </th>
                      <th scope="col" className="px-3 py-2.5 font-medium">
                        How it is checked
                      </th>
                      <th scope="col" className="px-3 py-2.5 font-medium">
                        Where
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {evaluation.map(([claim, how, where]) => (
                      <tr key={claim} className="border-b align-top last:border-0">
                        <th scope="row" className="px-3 py-2.5 text-left font-medium">
                          <span className="flex gap-1.5">
                            <CheckCircle2
                              className="mt-0.5 size-3.5 shrink-0 text-emerald-700 dark:text-emerald-400"
                              aria-hidden
                            />
                            {claim}
                          </span>
                        </th>
                        <td className="px-3 py-2.5 text-ink-soft">{how}</td>
                        <td className="px-3 py-2.5 text-xs whitespace-nowrap">{where}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </ScrollTable>
            </Section>

            <Section id="assumptions" eyebrow="04 · assumptions" title="Assumptions">
              <List
                items={[
                  "The config.py weights are the target the 2025 README meant. Its six socio-economic bands were never defined; mapping them onto ten IRSAD deciles is my reading (DR-002).",
                  "A suburb is represented by its ABS Suburb and Locality, and takes the postcode, council and remoteness area of most of its 2021 residents.",
                  "Uniform within a suburb is the right null model for mock coordinates: they are not meant to look like dwellings.",
                  "The Mersenne Twister streams behave as independent uniform draws for different seeds (the standard assumption behind seeded simulation).",
                  "Donnelly's edge correction is adequate for single-part suburbs; the calibration over 100 seeds tests this rather than assuming it.",
                ]}
              />
            </Section>

            <Section id="limitations" eyebrow="05 · limitations" title="Limitations">
              <List
                items={[
                  "Mock addresses can coincide with real ones: the street names are 49 real Adelaide names used in every suburb. Never use them for mail, identity checks or to stand in for a person.",
                  "SEIFA describes areas, not people. A mock address in a low-decile suburb says nothing about anyone, and must not be used to represent a disadvantaged person.",
                  "Postcodes are ABS Postal Areas (approximations of Australia Post postcodes); councils and remoteness are majority rules for suburbs that straddle boundaries.",
                  "Boundaries are simplified, so a point near an edge can sit in the real neighbouring suburb, and points can fall in parks, lakes or reserves.",
                  "The Clark-Evans test is miscalibrated for multi-part suburbs (Kingscote is rejected in about 13% of 100 seeds against a nominal 5%); the reference value, not the sampler, is the weak point.",
                  "The 2021 data are five years old; growth areas have changed since.",
                ]}
              />
            </Section>

            <Section id="change" eyebrow="06 · next" title="What I'd change">
              <List
                items={[
                  "Sample coordinates within residential mesh blocks weighted by dwellings, and use G-NAF to warn when a mock address coincides with a real one.",
                  "Replace the Clark-Evans reference with a Monte Carlo envelope from an independent uniform sampler, which handles multi-part suburbs properly.",
                  "Two-way stratification (remoteness by SEIFA decile) with raking, and a bootstrap interval for Cohen's w.",
                  "An evaluation set of test scenarios with expected settings, to score the AI assistant per model with paired comparisons before recommending one.",
                  "Rebuild on ASGS Edition 4 and 2026 Census counts when they are published, recorded in a new decision record.",
                ]}
              />
            </Section>

            <Section id="decisions" eyebrow="07 · decisions" title="Decision records">
              <p className="prose-notebook max-w-3xl">
                Each record states the decision first, then the context, the options, the
                reasons, what actually happened (weak numbers included) and what I would
                change. Records are never edited after the fact; a new record supersedes
                an old one. The sources are in{" "}
                <a className={LINK} href={`${site.repo}/tree/main/docs/decisions`}>
                  docs/decisions
                </a>
                .
              </p>
              <ol className="grid gap-3 sm:grid-cols-2">
                {decisions.map((d) => (
                  <li key={d.id}>
                    <a
                      href={`#${d.anchor}`}
                      className="block h-full rounded-xl border bg-card p-4 transition-colors hover:border-primary/40"
                    >
                      <span className="font-mono text-xs text-muted-foreground">
                        {d.id}
                      </span>
                      <span className="mt-1 block font-heading text-lg leading-snug font-semibold">
                        {d.title}
                      </span>
                    </a>
                  </li>
                ))}
              </ol>
              {decisions.map((d) => (
                <article
                  key={d.id}
                  id={d.anchor}
                  aria-labelledby={`${d.anchor}-h`}
                  className="scroll-mt-20 rounded-xl border bg-card p-5 sm:p-7"
                >
                  <p className="eyebrow">
                    {d.id} · {d.status} · {d.date}
                  </p>
                  <h3
                    id={`${d.anchor}-h`}
                    className="mt-2 text-xl font-semibold sm:text-2xl"
                  >
                    {d.title}
                  </h3>
                  {d.meta["applies-to"] ? (
                    <p className="mt-1 text-xs [overflow-wrap:anywhere] text-muted-foreground">
                      Applies to:{" "}
                      <span className="font-mono">{d.meta["applies-to"]}</span>
                    </p>
                  ) : null}
                  {d.summary ? (
                    <div className="mt-4 rounded-lg border border-sa-blue/30 bg-sa-blue/[0.05] px-4 py-3">
                      <p className="eyebrow mb-1">Decision</p>
                      <Markdown className="max-w-none">{d.summary}</Markdown>
                    </div>
                  ) : null}
                  <Markdown sectionLevel={4} label={d.id} className="mt-2">
                    {d.body}
                  </Markdown>
                </article>
              ))}
            </Section>

            <Section
              id="data-card"
              eyebrow="08 · data card"
              title="Data card: the reference table"
            >
              <div className="rounded-xl border bg-card p-5 sm:p-7">
                <Markdown label="Data card">{card.body}</Markdown>
              </div>
            </Section>

            <Section id="ai-use" eyebrow="09 · AI use" title="AI use statement">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="rounded-xl border bg-card p-4">
                  <h3 className="text-lg font-semibold">What the AI does</h3>
                  <p className="mt-2 text-sm leading-relaxed text-ink-soft">
                    One optional feature, &ldquo;Describe a test scenario&rdquo; on{" "}
                    <Link className={LINK} href="/generate">
                      /generate
                    </Link>
                    : it reads a plain-language description of the test data you need and
                    proposes generator settings. The proposal is labelled AI-generated,
                    checked against a schema and the reference table, and shown as a table
                    of changes that you review and apply (or not) field by field.
                  </p>
                </div>
                <div className="rounded-xl border bg-card p-4">
                  <h3 className="text-lg font-semibold">What it never does</h3>
                  <p className="mt-2 text-sm leading-relaxed text-ink-soft">
                    It never generates addresses (the seeded, tested generator does),
                    never changes a setting without your review, never runs without your
                    own key, and is never needed: every page works without it. It is not
                    used for any statistic on the site.
                  </p>
                </div>
                <div className="rounded-xl border bg-card p-4">
                  <h3 className="text-lg font-semibold">What is sent, and where</h3>
                  <p className="mt-2 text-sm leading-relaxed text-ink-soft">
                    From your browser directly to the provider you choose
                    (api.anthropic.com or api.openai.com), never through this site: your
                    scenario (at most {MAX_SCENARIO_LENGTH.toLocaleString("en-AU")}{" "}
                    characters), the current settings and the list of remoteness areas,
                    deciles and councils. No suburb list, no generated addresses, nothing
                    about you. The provider&apos;s own terms and retention apply to what
                    you send. Do not put personal information in a scenario.
                  </p>
                </div>
                <div className="rounded-xl border bg-card p-4">
                  <h3 className="text-lg font-semibold">Your key</h3>
                  <p className="mt-2 text-sm leading-relaxed text-ink-soft">
                    Bring your own: Anthropic (
                    {ANTHROPIC_MODELS.map((m) => m.label).join(" by default, or ")}) or
                    OpenAI ({OPENAI_DEFAULT_MODEL} by default, editable). It stays in this
                    browser (session storage, or local storage if you tick
                    &ldquo;remember&rdquo;), travels only in the request header to the
                    provider, and &ldquo;Forget key&rdquo; removes it. It is never sent to
                    this site, logged or stored in the audit log. The site&apos;s
                    Content-Security-Policy backs this up in the browser: pages may only
                    connect to this site, the two providers and the map tile server.
                  </p>
                </div>
                <div className="rounded-xl border bg-card p-4 md:col-span-2">
                  <h3 className="text-lg font-semibold">
                    Human in the loop, and the record
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-ink-soft">
                    Every call is written to an audit log in this browser (IndexedDB),
                    with the time, provider, model, the exact input, the raw output,
                    latency, token usage, which checks the proposal failed, and your
                    decision: accepted, edited (with what you applied) or rejected. Failed
                    calls are logged too. View and export it as JSON or CSV at{" "}
                    <Link className={LINK} href="/ai-log">
                      /ai-log
                    </Link>
                    . The design is in{" "}
                    <a className={LINK} href="#dr-004">
                      DR-004
                    </a>
                    .
                  </p>
                </div>
              </div>
              <div className="flex max-w-3xl gap-3 rounded-xl border bg-muted/40 p-4 text-sm">
                <Info
                  className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                  aria-hidden
                />
                <p className="text-ink-soft">
                  The design is informed by the Australian Government&apos;s policy for
                  the responsible use of AI in government (Digital Transformation Agency),
                  the EU AI Act&apos;s transparency principles and the NIST AI Risk
                  Management Framework. It is a personal project and makes no claim of
                  compliance with any of them.
                </p>
              </div>
            </Section>
          </div>
        </div>
      </div>
    </>
  );
}
