import Link from "next/link";
import {
  ArrowRight,
  BarChart3,
  BookOpenCheck,
  FileSearch,
  ListOrdered,
  Map as MapIcon,
  PlayCircle,
  Search,
  ShieldCheck,
  Sigma,
  Sparkles,
  TerminalSquare,
} from "lucide-react";
import { AddressTag } from "@/components/common/address-tag";
import { GitHubIcon } from "@/components/common/github-icon";
import { Button } from "@/components/ui/button";
import { generateMockAddresses } from "@/lib/generator/generate";
import { defaultWeights } from "@/lib/generator/weights";
import parity from "@/lib/__fixtures__/original-parity.json";
import { getProvenance, getSuburbs } from "@/lib/server/data";
import { site } from "@/lib/site";
import { shortRemoteness } from "@/lib/suburbs";
import { formatInt, formatPct } from "@/lib/utils";

const FEATURES = [
  {
    href: "/generate",
    icon: ListOrdered,
    title: "Generate",
    body: "Up to 5,000 seeded addresses, filtered by suburb, council, remoteness or SEIFA decile, as text, JSON or CSV.",
  },
  {
    href: "/generate",
    icon: BarChart3,
    title: "Check the sample",
    body: "Realised shares with 95% Wilson intervals, and an exact or chi-square test with its effect size against the target the design promises.",
  },
  {
    href: "/verify",
    icon: ShieldCheck,
    title: "Verification Lab",
    body: "Every address checked inside its own suburb against ABS boundaries, target mix with chi-square and confidence intervals, spatial spread, and same-seed reproducibility.",
  },
  {
    href: "/sampling",
    icon: Sigma,
    title: "Sampling design",
    body: "Uniform, weighted and stratified designs over 200 seeds, exact and chi-square tests, a sample-size calculator, and spatial checks on every coordinate.",
  },
  {
    href: "/map",
    icon: MapIcon,
    title: "Map",
    body: "All 1,695 suburbs and localities on a free OpenFreeMap basemap, shaded by remoteness, SEIFA, or the 2025 table.",
  },
  {
    href: "/lookup",
    icon: Search,
    title: "Lookup",
    body: "Search a real place with Photon, then find its suburb, postcode, council and decile by point-in-polygon.",
  },
  {
    href: "/replay",
    icon: TerminalSquare,
    title: "2025 replay",
    body: "The original Python CLI ported to TypeScript, bugs included, printing the same bytes for the same seed.",
  },
  {
    href: "/data",
    icon: FileSearch,
    title: "Provenance",
    body: "The 2025 table against an ABS rebuild: what was missing, what agrees, and every source and licence.",
  },
  {
    href: "/methods",
    icon: BookOpenCheck,
    title: "Methods and decisions",
    body: "How every claim is checked, the assumptions and limits, five decision records and a data card for the reference table.",
  },
  {
    href: "/generate",
    icon: Sparkles,
    title: "Describe a scenario (optional AI)",
    body: "Bring your own key: a model proposes generator settings, you review each change, and every call goes to an audit log you can export.",
  },
];

const STACK = [
  ["Language", "Python 3.8+", "TypeScript (strict), Python only for data builds"],
  [
    "Interface",
    "argparse CLI and a Python class",
    "Next.js 16 static site, Web Worker generator",
  ],
  [
    "Suburb data",
    "1,894-row CSV, source not recorded",
    "ABS 2021 SAL, LGA, POA, RA, SEIFA (CC BY 4.0)",
  ],
  [
    "Coordinates",
    "Mapbox geocode of the suburb name (key needed)",
    "Seeded point inside the ABS boundary (no key)",
  ],
  [
    "Address lookup",
    "Mapbox Geocoding v5 (key needed)",
    "Photon via a cached route, local point-in-polygon",
  ],
  ["Maps", "None", "MapLibre GL + OpenFreeMap, bundled outline fallback"],
  [
    "Statistics",
    "None (the promised weights were never applied)",
    "Wilson intervals, exact and chi-square tests, Cohen's w, replicate studies over fixed seeds",
  ],
  [
    "AI",
    "None",
    "Optional, your own key: proposes settings for review, every call audit-logged",
  ],
  [
    "Tests",
    "None",
    "Vitest parity tests against recorded Python output, SciPy reference values",
  ],
];

export default function Home() {
  const suburbs = getSuburbs();
  const p = getProvenance();
  const addressable = suburbs.rows.filter((r) => r.addressable).length;
  const samples = generateMockAddresses(suburbs.rows, null, {
    count: 4,
    seed: 2025,
    mode: "population",
    filters: {},
    weights: defaultWeights(),
    coordinates: false,
  }).addresses;

  const findings = [
    {
      stat: "0 weights applied",
      text: "The README promised remoteness and socio-economic weighting. The weights sat in config.py, but the import was commented out, so every suburb was equally likely.",
    },
    {
      stat: `${formatInt(p.original.sesValues["0"])} / ${formatInt(p.original.rows)}`,
      text: "rows had socio-economic status 0, so asking for level 1 to 5 matched nothing and silently fell back to the whole state.",
    },
    {
      stat: formatInt(p.original.remoteness["Not Applicable"]),
      text: "rows had the remoteness level “Not Applicable”, more than half the table.",
    },
    {
      stat: String(p.original.postcodesMissingZero),
      text: "postcodes lost their leading zero, so AMATA printed as “SA 872” instead of 0872.",
    },
  ];

  return (
    <>
      {/* Hero */}
      <section className="mx-auto grid max-w-7xl items-center gap-10 overflow-x-clip px-4 pt-12 pb-16 sm:px-6 md:pt-20 lg:grid-cols-[1.15fr_1fr]">
        <div className="space-y-6">
          <p className="eyebrow">Personal project · 2025, revived 2026</p>
          <h1 className="text-4xl leading-[1.08] font-semibold sm:text-5xl lg:text-[3.4rem]">
            Mock South Australian addresses,{" "}
            <span className="text-sa-red italic">with the receipts.</span>
          </h1>
          <div className="prose-notebook max-w-xl text-[1.02rem]">
            <p>
              Test data needs addresses that look right: a real suburb, the right postcode
              and council, a plausible spread across the city and the outback. This lab
              generates them, shows whether a sample actually hits its target mix, and
              documents exactly where every field comes from.
            </p>
            <p>
              It began in August 2025 as a small Python CLI. The revival keeps that
              generator, fixes its data from ABS open sources, checks every sampling
              design over hundreds of seeds, and runs entirely in the browser with no API
              keys of its own.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button asChild size="lg" className="h-11 px-5 text-sm">
              <Link href="/generate">
                Generate addresses <ArrowRight aria-hidden />
              </Link>
            </Button>
            <Button asChild variant="outline" size="lg" className="h-11 px-5 text-sm">
              <Link href="/replay">Replay the 2025 CLI</Link>
            </Button>
            <Button asChild variant="ghost" size="lg" className="h-11 px-4 text-sm">
              <Link href="/tour">
                <PlayCircle aria-hidden /> Watch the guided tour
              </Link>
            </Button>
          </div>
        </div>

        <figure className="relative">
          <div
            aria-hidden
            className="absolute -inset-3 -z-10 rotate-1 rounded-2xl border border-dashed border-input bg-card/40"
          />
          <div className="space-y-2.5 rounded-xl border bg-card p-4 shadow-[0_18px_40px_-24px_rgb(28_38_48/0.35)] sm:p-5">
            <div className="flex items-center justify-between pb-1">
              <p className="eyebrow">Specimen sheet · seed 2025</p>
              <p className="font-mono text-[0.65rem] text-muted-foreground">
                population weighted
              </p>
            </div>
            {samples.map((a) => (
              <AddressTag
                key={a.id}
                index={a.id}
                fullAddress={a.full_address}
                meta={[
                  a.council,
                  shortRemoteness(a.remoteness_level),
                  a.seifa_decile_sa ? `IRSAD decile ${a.seifa_decile_sa}` : "no SEIFA",
                ]}
              />
            ))}
          </div>
          <figcaption className="mt-4 text-xs text-muted-foreground">
            Generated on the server from the same seeded code the generator page runs in
            your browser: choose population weighting with seed 2025 there and the first
            four match. These are not real addresses.
          </figcaption>
        </figure>
      </section>

      {/* Features */}
      <section aria-labelledby="lab" className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
        <div className="mb-6 flex items-end justify-between gap-4">
          <h2 id="lab" className="text-2xl font-semibold sm:text-3xl">
            What&apos;s in the lab
          </h2>
        </div>
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <li key={f.title}>
              <Link
                href={f.href}
                className="group flex h-full flex-col gap-2 rounded-xl border bg-card p-5 transition-colors hover:border-primary/40 hover:bg-card/70"
              >
                <f.icon className="size-5 text-sa-blue" aria-hidden />
                <span className="flex items-center gap-1.5 font-heading text-lg font-semibold">
                  {f.title}
                  <ArrowRight
                    className="size-4 -translate-x-1 opacity-0 transition-all group-hover:translate-x-0 group-hover:opacity-100"
                    aria-hidden
                  />
                </span>
                <span className="text-sm leading-relaxed text-muted-foreground">
                  {f.body}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      {/* Findings */}
      <section
        aria-labelledby="findings"
        className="mx-auto max-w-7xl px-4 py-12 sm:px-6"
      >
        <div className="grid gap-8 lg:grid-cols-[1fr_1.6fr]">
          <div className="space-y-3">
            <p className="eyebrow">Field notes</p>
            <h2 id="findings" className="text-2xl font-semibold sm:text-3xl">
              What the 2025 version actually did
            </h2>
            <p className="prose-notebook text-sm">
              Porting the code line by line and testing it against recorded Python output
              surfaced four problems the original README did not mention. The replay keeps
              them; the generator fixes the data underneath.
            </p>
            <Link
              href="/data"
              className="inline-flex items-center gap-1 text-sm font-medium text-primary underline-offset-4 hover:underline"
            >
              Read the full provenance <ArrowRight className="size-3.5" aria-hidden />
            </Link>
          </div>
          <ol className="grid gap-3 sm:grid-cols-2">
            {findings.map((f, i) => (
              <li key={f.stat} className="relative rounded-xl border bg-card p-5">
                <span className="absolute top-4 right-4 font-mono text-[0.65rem] text-muted-foreground">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <p className="font-heading text-3xl font-semibold text-sa-red tabular-nums">
                  {f.stat}
                </p>
                <p className="mt-2 text-sm leading-relaxed text-ink-soft">{f.text}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Results */}
      <section aria-labelledby="results" className="mx-auto max-w-7xl px-4 py-12 sm:px-6">
        <h2 id="results" className="mb-6 text-2xl font-semibold sm:text-3xl">
          Key results
        </h2>
        <dl className="grid gap-px overflow-hidden rounded-xl border bg-border sm:grid-cols-2 lg:grid-cols-4">
          {[
            [
              formatInt(addressable),
              "South Australian suburbs and localities, each with a postcode, council, remoteness area and boundary",
            ],
            [
              formatPct(p.match.postcodeExact / p.match.byName),
              `postcode agreement with the 2025 table where names match (${formatInt(p.match.postcodeExact)} of ${formatInt(p.match.byName)})`,
            ],
            [
              `${parity.cli.length + parity.generate.length}/${parity.cli.length + parity.generate.length}`,
              "recorded Python runs reproduced exactly by the TypeScript port, checked on every CI run",
            ],
            // Checked by src/lib/sampling/claims.test.ts.
            [
              "6 / 200",
              "seeds in which the weighted design's test rejects its target at 5% (95% CI 1.4% to 6.4%): calibrated, not lucky",
            ],
          ].map(([k, v]) => (
            <div key={v} className="bg-card p-5">
              <dt className="font-heading text-3xl font-semibold tabular-nums">{k}</dt>
              <dd className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                {v}
              </dd>
            </div>
          ))}
        </dl>
      </section>

      {/* About */}
      <section
        id="about"
        aria-labelledby="about-title"
        className="mx-auto max-w-7xl scroll-mt-20 px-4 py-12 sm:px-6"
      >
        <div className="grid gap-8 lg:grid-cols-[1fr_1.6fr]">
          <div className="space-y-4">
            <p className="eyebrow">About this project</p>
            <h2 id="about-title" className="text-2xl font-semibold sm:text-3xl">
              Personal project, 2025
            </h2>
            <div className="prose-notebook text-sm">
              <p>
                Written by <a href={site.authorUrl}>{site.author}</a> in August 2025 as a
                small tool for generating South Australian test addresses, and revived in
                October 2026 as this site. It is not university coursework.
              </p>
              <p>
                <strong className="font-medium text-foreground">Provenance.</strong> The
                2025 Python code, its data files and its README are preserved unchanged in
                the repository&apos;s <code>original/</code> folder, with history intact.
                The website is a rewrite: its generator is a faithful port of that code,
                and its suburb data is rebuilt from ABS open data by the scripts in{" "}
                <code>scripts/</code>.
              </p>
            </div>
            <Button asChild variant="outline">
              <a href={site.repo}>
                <GitHubIcon /> rNLKJA/SA-Mock-Address-Generator
              </a>
            </Button>
          </div>
          <div className="min-w-0">
            {/* Phones: one card per aspect, so the 2026 column is never off-screen. */}
            <dl
              aria-label="Original stack compared with the revived stack"
              className="divide-y rounded-xl border bg-card sm:hidden"
            >
              {STACK.map(([k, a, b]) => (
                <div key={k} className="space-y-1 px-4 py-3">
                  <dt className="text-xs font-medium text-muted-foreground">{k}</dt>
                  <dd className="flex gap-3 text-sm text-ink-soft">
                    <span className="w-9 shrink-0 pt-px font-mono text-[0.7rem] text-muted-foreground">
                      2025
                    </span>
                    <span>{a}</span>
                  </dd>
                  <dd className="flex gap-3 text-sm">
                    <span className="w-9 shrink-0 pt-px font-mono text-[0.7rem] text-sa-red">
                      2026
                    </span>
                    <span>{b}</span>
                  </dd>
                </div>
              ))}
            </dl>
            <div className="hidden overflow-x-auto rounded-xl border bg-card sm:block">
              <table className="w-full min-w-[34rem] text-sm">
                <caption className="sr-only">
                  Original stack compared with the revived stack
                </caption>
                <thead>
                  <tr className="border-b text-left text-xs text-muted-foreground">
                    <th scope="col" className="px-4 py-3 font-medium">
                      <span className="sr-only">Aspect</span>
                    </th>
                    <th scope="col" className="px-4 py-3 font-medium">
                      2025 original
                    </th>
                    <th scope="col" className="px-4 py-3 font-medium">
                      2026 revival
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {STACK.map(([k, a, b]) => (
                    <tr key={k} className="border-b align-top last:border-0">
                      <th
                        scope="row"
                        className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground"
                      >
                        {k}
                      </th>
                      <td className="px-4 py-2.5 text-ink-soft">{a}</td>
                      <td className="px-4 py-2.5">{b}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
