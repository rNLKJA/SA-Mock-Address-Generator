import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Download, ExternalLink, FileWarning } from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { getProvenance } from "@/lib/server/data";
import { RA_NAMES, RA_SHORT } from "@/lib/suburbs";
import { site } from "@/lib/site";
import { formatInt, formatPct } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Data provenance",
  description:
    "How the 2025 suburb table compares with a rebuild from ABS open data: all-zero socio-economic status, 997 'Not Applicable' remoteness rows, postcodes missing a leading zero, and the sources and licences used now.",
};

const SOURCE_LINK =
  "text-sm text-primary underline decoration-primary/40 underline-offset-2 hover:decoration-primary";

/** Short file-type label, e.g. "XLSX" or "Shapefile ZIP". */
function fileKind(file: string): string {
  if (file.endsWith(".zip")) return "Shapefile ZIP";
  const ext = file.split(".").pop();
  return ext ? ext.toUpperCase() : "File";
}

function Section({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section aria-labelledby={id} className="space-y-4">
      <h2 id={id} className="text-2xl font-semibold">
        {title}
      </h2>
      {children}
    </section>
  );
}

const ORIGINAL_ORDER = [
  "Major Cities of Australia",
  "Inner Regional Australia",
  "Outer Regional Australia",
  "Remote Australia",
  "Very Remote Australia",
  "Not Applicable",
];

export default function DataPage() {
  const p = getProvenance();
  const m = p.match;
  const confusion = p.remotenessConfusion as Record<string, Record<string, number>>;
  const raMatched = ORIGINAL_ORDER.slice(0, 5).reduce(
    (s, k) => s + Object.values(confusion[k] ?? {}).reduce((a, b) => a + b, 0),
    0,
  );
  const raAgree = RA_NAMES.reduce((s, k) => s + (confusion[k]?.[k] ?? 0), 0);
  const maxCell = Math.max(...Object.values(confusion).flatMap((r) => Object.values(r)));
  const naResolved = m.notApplicableResolved as Record<string, number>;
  const naTotal = Object.values(naResolved).reduce((a, b) => a + b, 0);

  const tiles = [
    {
      label: "Rows",
      before: `${formatInt(p.original.rows)} names, source not recorded`,
      after: `${formatInt(p.rebuilt.rows)} ABS Suburbs and Localities (2021)`,
    },
    {
      label: "Socio-economic status",
      before: `0 in all ${formatInt(p.original.sesValues["0"])} rows`,
      after: `IRSAD decile for ${formatInt(p.rebuilt.withSeifa)} suburbs`,
    },
    {
      label: "Remoteness",
      before: `${formatInt(p.original.remoteness["Not Applicable"])} rows "Not Applicable"`,
      after: "Every suburb assigned an ABS Remoteness Area",
    },
    {
      label: "Postcodes",
      before: `${p.original.postcodesMissingZero} missing a leading zero (872)`,
      after: "Four-digit ABS Postal Areas (0872)",
    },
  ];

  return (
    <>
      <PageHeader eyebrow="Provenance" title="Where the suburb data comes from">
        <p>
          The 2025 generator read a 1,894-row CSV with no recorded source. For the
          revival, the table was rebuilt from Australian Bureau of Statistics open data by{" "}
          <a href={`${site.repo}/blob/main/scripts/build_data.py`}>
            scripts/build_data.py
          </a>
          , and then compared row by row with the original. This page is that comparison.
        </p>
      </PageHeader>

      <div className="mx-auto max-w-7xl space-y-14 px-4 sm:px-6">
        <Section id="glance" title="2025 table versus the rebuild">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {tiles.map((t) => (
              <div key={t.label} className="rounded-xl border bg-card p-4">
                <p className="eyebrow mb-3">{t.label}</p>
                <p className="text-sm text-muted-foreground line-through decoration-sa-red/60">
                  {t.before}
                </p>
                <p className="mt-1.5 flex items-start gap-1.5 text-sm font-medium">
                  <ArrowRight
                    className="mt-0.5 size-3.5 shrink-0 text-sa-blue"
                    aria-hidden
                  />
                  {t.after}
                </p>
              </div>
            ))}
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            {[
              {
                k: m.byName,
                of: p.original.rows,
                label: "2025 names found in the ABS list",
              },
              {
                k: m.postcodeExact,
                of: m.byName,
                label: "of those agree on the postcode",
              },
              {
                k: m.councilAgree,
                of: m.byName,
                label: "agree on the council, once names are crosswalked",
              },
            ].map((s) => (
              <div
                key={s.label}
                className="rounded-xl border border-dashed bg-card/60 p-4"
              >
                <p className="font-heading text-3xl font-semibold tabular-nums">
                  {formatPct(s.k / s.of)}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {formatInt(s.k)} of {formatInt(s.of)} {s.label}
                </p>
              </div>
            ))}
          </div>
          <p className="max-w-3xl text-sm text-muted-foreground">
            Where the 2025 table did record a remoteness level, it agrees with the ABS
            assignment for {formatInt(raAgree)} of {formatInt(raMatched)} suburbs (
            {formatPct(raAgree / raMatched)}). The disagreements are suburbs that straddle
            a boundary between two remoteness areas.
          </p>
        </Section>

        <Section id="remoteness" title="Remoteness, cell by cell">
          <p className="prose-notebook max-w-3xl">
            Rows are the 2025 label, columns the ABS Remoteness Area holding most of the
            suburb&apos;s residents. The bottom row is where the {formatInt(naTotal)}{" "}
            matched &ldquo;Not Applicable&rdquo; rows actually sit.
          </p>
          <div
            tabIndex={0}
            role="region"
            aria-label="Remoteness cross-tabulation (scrolls sideways)"
            className="overflow-x-auto rounded-xl border bg-card focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            <table className="w-full min-w-[40rem] text-sm">
              <caption className="sr-only">
                Cross-tabulation of 2025 remoteness labels against ABS 2021 remoteness
                areas
              </caption>
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th scope="col" className="px-3 py-2.5 font-medium">
                    2025 label ↓ / ABS 2021 →
                  </th>
                  {RA_SHORT.map((r) => (
                    <th
                      key={r}
                      scope="col"
                      className="px-3 py-2.5 text-right font-medium"
                    >
                      {r}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ORIGINAL_ORDER.map((o) => (
                  <tr key={o} className="border-b last:border-0">
                    <th scope="row" className="px-3 py-2 text-left font-normal">
                      {o === "Not Applicable" ? (
                        <span className="text-sa-red">&ldquo;Not Applicable&rdquo;</span>
                      ) : (
                        o.replace(" of Australia", "").replace(" Australia", "")
                      )}
                    </th>
                    {RA_NAMES.map((n) => {
                      const v = confusion[o]?.[n] ?? 0;
                      return (
                        <td
                          key={n}
                          className="px-3 py-2 text-right font-mono text-xs tabular-nums"
                          style={
                            v
                              ? {
                                  background: `color-mix(in oklch, var(--sa-blue) ${Math.round(8 + (v / maxCell) * 30)}%, transparent)`,
                                }
                              : undefined
                          }
                        >
                          {v ? (
                            formatInt(v)
                          ) : (
                            <span className="text-muted-foreground/50">·</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>

        <Section id="names" title="Names in only one table">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-xl border bg-card p-4">
              <p className="font-medium">
                {formatInt(m.onlyOriginal)} names only in the 2025 table
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {formatInt(m.onlyOriginalPastoral)} of them sit in the Pastoral
                Unincorporated Area and{" "}
                {m.onlyOriginalNotApplicable === m.onlyOriginal
                  ? "all"
                  : formatInt(m.onlyOriginalNotApplicable)}{" "}
                are marked &ldquo;Not Applicable&rdquo;: stations and outback places that
                the ABS folds into larger localities, so there is no ABS polygon to place
                them in.
              </p>
              <p className="mt-3 font-mono text-xs leading-relaxed text-ink-soft">
                {m.onlyOriginalSample.join(" · ")} …
              </p>
            </div>
            <div className="rounded-xl border bg-card p-4">
              <p className="font-medium">
                {formatInt(m.onlyRebuilt)} names only in the rebuild
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                &ldquo;SA Remainder&rdquo; is the ABS bucket for land outside every
                locality (it is never used for generated addresses); Murputja - Nyapari is
                an APY Lands community.
              </p>
              <p className="mt-3 font-mono text-xs leading-relaxed text-ink-soft">
                {m.onlyRebuiltSample.join(" · ")}
              </p>
            </div>
          </div>
        </Section>

        <Section id="examples" title="A few suburbs side by side">
          <div
            tabIndex={0}
            role="region"
            aria-label="Example suburbs compared (scrolls sideways)"
            className="overflow-x-auto rounded-xl border bg-card focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            <table className="w-full min-w-[46rem] text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th scope="col" className="px-3 py-2.5 font-medium">
                    Suburb
                  </th>
                  <th scope="col" className="px-3 py-2.5 font-medium">
                    Postcode
                  </th>
                  <th scope="col" className="px-3 py-2.5 font-medium">
                    Council
                  </th>
                  <th scope="col" className="px-3 py-2.5 font-medium">
                    Remoteness
                  </th>
                  <th scope="col" className="px-3 py-2.5 font-medium">
                    Socio-economic
                  </th>
                </tr>
              </thead>
              <tbody>
                {p.examples.map((e) => (
                  <tr key={e.suburb} className="border-b align-top last:border-0">
                    <th
                      scope="row"
                      className="px-3 py-2.5 text-left font-mono text-xs font-medium"
                    >
                      {e.suburb}
                    </th>
                    {[
                      [e.original.postcode, e.rebuilt.postcode],
                      [e.original.council, e.rebuilt.council],
                      [e.original.remoteness, e.rebuilt.remoteness],
                      [
                        `SES ${e.original.ses}`,
                        e.rebuilt.decileSa
                          ? `IRSAD decile ${e.rebuilt.decileSa}`
                          : "not published",
                      ],
                    ].map(([a, b], i) => (
                      <td key={i} className="px-3 py-2.5">
                        <span className="block text-xs text-muted-foreground">{a}</span>
                        <span className="block">{b}</span>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-muted-foreground">
            Top line: 2025 table. Bottom line: rebuild.
          </p>
        </Section>

        <Section id="councils" title="Council name crosswalk">
          <p className="prose-notebook max-w-3xl">
            The 2025 table used formal council names (&ldquo;THE DC OF LOXTON
            WAIKERIE&rdquo;); the ABS uses short LGA names (&ldquo;Loxton
            Waikerie&rdquo;). Each 2025 name is mapped to the LGA most of its suburbs fall
            in.
          </p>
          <details className="rounded-xl border bg-card">
            <summary className="cursor-pointer rounded-xl px-4 py-3 text-sm font-medium select-none hover:bg-muted/60">
              Show all {p.councilCrosswalk.length} councils
            </summary>
            <div
              tabIndex={0}
              role="region"
              aria-label="Council crosswalk (scrolls sideways)"
              className="overflow-x-auto rounded-b-xl px-4 pb-4 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              <table className="w-full min-w-[34rem] text-sm">
                <thead>
                  <tr className="border-b text-left text-xs text-muted-foreground">
                    <th scope="col" className="py-2 pr-3 font-medium">
                      2025 council
                    </th>
                    <th scope="col" className="py-2 pr-3 font-medium">
                      ABS LGA 2021
                    </th>
                    <th scope="col" className="py-2 text-right font-medium">
                      Suburbs agreeing
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {p.councilCrosswalk.map((c) => (
                    <tr key={c.original} className="border-b last:border-0">
                      <td className="py-1.5 pr-3 font-mono text-xs">{c.original}</td>
                      <td className="py-1.5 pr-3">{c.rebuilt}</td>
                      <td className="py-1.5 text-right font-mono text-xs tabular-nums">
                        {c.agree}/{c.suburbs}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </Section>

        <Section id="method" title="How the rebuild works">
          <ol className="prose-notebook max-w-3xl list-decimal space-y-2 pl-5 marker:font-mono marker:text-muted-foreground">
            <li>
              <p>
                Start from every 2021 ABS Suburb and Locality (SAL) in South Australia,
                minus the two non-places (&ldquo;No usual address&rdquo;, &ldquo;Migratory
                - Offshore - Shipping&rdquo;).
              </p>
            </li>
            <li>
              <p>
                Join each mesh block to its SAL, Postal Area, LGA and (via its SA1)
                Remoteness Area, and weight it by its 2021 Census usual residents. Each
                suburb gets the postcode, council and remoteness area holding most of its
                residents; land area breaks ties for empty localities.
              </p>
            </li>
            <li>
              <p>
                Attach SEIFA 2021 IRSAD scores and deciles, both national and ranked
                within South Australia. The ABS publishes none for{" "}
                {formatInt(p.rebuilt.rows - p.rebuilt.withSeifa)} very small localities.
              </p>
            </li>
            <li>
              <p>
                Simplify the boundaries with {p.tools.mapshaper} (Visvalingam, keep{" "}
                {p.tools.salSimplify} of removable vertices, shared edges preserved),
                round to {p.tools.precision}, and compute a label point inside each
                polygon. Mock coordinates are sampled inside these simplified shapes.
              </p>
            </li>
          </ol>
          <p className="text-sm text-muted-foreground">
            ABS Postal Areas approximate Australia Post postcodes; they are not the
            official delivery list. Rebuild everything with{" "}
            <code className="rounded bg-muted px-1 font-mono text-xs">
              uv run scripts/build_data.py
            </code>
            .
          </p>
        </Section>

        <Section id="sources" title="Sources and licences">
          <ul className="divide-y rounded-xl border bg-card">
            {p.sources.map((s) => (
              <li
                key={s.file}
                className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-baseline sm:justify-between"
              >
                <a href={s.url} className={SOURCE_LINK}>
                  {s.title}
                  <Download className="ml-1 inline size-3.5 align-[-2px]" aria-hidden />
                  <span className="sr-only"> (direct download)</span>
                </a>
                <span className="shrink-0 font-mono text-xs text-muted-foreground">
                  {fileKind(s.file)} ·{" "}
                  {s.publisher === "Australian Bureau of Statistics"
                    ? "ABS"
                    : s.publisher}{" "}
                  · {s.licence}
                </span>
              </li>
            ))}
            <li className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-baseline sm:justify-between">
              <a href="https://openfreemap.org" className={SOURCE_LINK}>
                Basemap tiles: OpenFreeMap (OpenMapTiles schema)
                <ExternalLink className="ml-1 inline size-3.5 align-[-2px]" aria-hidden />
              </a>
              <span className="shrink-0 font-mono text-xs text-muted-foreground">
                © OpenStreetMap contributors · ODbL
              </span>
            </li>
            <li className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-baseline sm:justify-between">
              <a href="https://photon.komoot.io" className={SOURCE_LINK}>
                Geocoding: Photon by komoot
                <ExternalLink className="ml-1 inline size-3.5 align-[-2px]" aria-hidden />
              </a>
              <span className="shrink-0 font-mono text-xs text-muted-foreground">
                © OpenStreetMap contributors · ODbL
              </span>
            </li>
          </ul>
          <p className="text-xs text-muted-foreground">
            Contains ABS data, © Commonwealth of Australia, licensed under CC BY 4.0.
          </p>
        </Section>

        <Section id="not-used" title="What the site deliberately does not use">
          <div className="flex gap-3 rounded-xl border border-sa-gold/40 bg-sa-gold/[0.06] p-4">
            <FileWarning className="mt-0.5 size-5 shrink-0 text-sa-gold" aria-hidden />
            <div className="prose-notebook max-w-3xl min-w-0 text-sm">
              <p>
                The repository also holds{" "}
                <code>original/data/regional_coastal_addresses_1.9k.csv</code>: 1,000 rows
                (not 1.9k), mostly Major Cities rather than regional or coastal, and in
                about half of them the geocoded address sits in a different suburb from
                the one claimed. It holds stored results from the Mapbox Geocoding API, so
                it stays in <code>original/</code> only as a historical record of the 2025
                tool; the website never reads or serves it.
              </p>
              <p>
                The Mapbox geocoder itself is replaced by Photon for lookups, and by
                sampling inside ABS boundaries for mock coordinates. The site holds no API
                keys of its own (the optional AI feature uses yours, from your browser).
                The reasoning is in <Link href="/methods#dr-001">DR-001</Link> and{" "}
                <Link href="/methods#dr-003">DR-003</Link>, and the table has a{" "}
                <Link href="/methods#data-card">data card</Link>.{" "}
                <Link href="/lookup">Try the lookup</Link>.
              </p>
            </div>
          </div>
        </Section>
      </div>
    </>
  );
}
