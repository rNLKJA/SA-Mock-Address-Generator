"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import {
  Copy,
  Dices,
  Download,
  Loader2,
  MapPinned,
  Play,
  X,
  CheckCircle2,
} from "lucide-react";
import { toast } from "sonner";
import Link from "next/link";
import { ScenarioAssistant } from "@/components/ai/scenario-assistant";
import { AddressTag } from "@/components/common/address-tag";
import { MockNotice } from "@/components/common/mock-notice";
import { SaMap, type ColorBy, type MapPoint } from "@/components/map/sa-map";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { CancelledError, useGeneratorWorker } from "@/hooks/use-generator-worker";
import { copyText, downloadText, randomSeed } from "@/lib/download";
import {
  EXTENSION,
  MIME,
  formatAddresses,
  type OutputFormat,
} from "@/lib/generator/format";
import {
  MAX_COUNT,
  type GenerateOptions,
  type GenerateResult,
} from "@/lib/generator/generate";
import {
  WEIGHT_MODES,
  allocateQuotas,
  defaultWeights,
  equalSharesWouldHelp,
  minCountForEveryStratum,
  type Filters,
  type WeightMode,
  type Weights,
} from "@/lib/generator/weights";
import type { GeneratorSettings } from "@/lib/ai/scenario-config";
import type { FilterOptions } from "@/lib/server/data";
import { RA_SHORT, shortRemoteness } from "@/lib/suburbs";
import { cn, formatInt } from "@/lib/utils";
import { TargetCheck, emptyQuotaText } from "./target-check";
import { WeightsEditor } from "./weights-editor";

const ANY = "any";
const PAGE = 100;
const PREVIEW_LINES = 80;

const INITIAL: Omit<GenerateOptions, "weights"> = {
  count: 25,
  seed: 2025,
  mode: "uniform",
  filters: {},
  coordinates: true,
};

function plural(n: number, one: string, many: string): string {
  return `${formatInt(n)} ${n === 1 ? one : many}`;
}

interface Run {
  result: GenerateResult;
  ms: number;
  options: GenerateOptions;
}

export function GeneratorApp({ options: filterOptions }: { options: FilterOptions }) {
  const generate = useGeneratorWorker();
  const formId = useId();
  const [count, setCount] = useState("25");
  const [seed, setSeed] = useState("2025");
  const [mode, setMode] = useState<WeightMode>("uniform");
  const [weights, setWeights] = useState<Weights>(defaultWeights);
  const [filters, setFilters] = useState<Filters>({});
  const [coordinates, setCoordinates] = useState(true);
  const [format, setFormat] = useState<OutputFormat>("text");
  const [run, setRun] = useState<Run | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [visible, setVisible] = useState(PAGE);
  const [tab, setTab] = useState("addresses");
  const [mapColor, setMapColor] = useState<ColorBy>("none");

  // Strict whole numbers: "2.7" or "1e3" are errors, not 2 or 1.
  const countNum = /^\d+$/.test(count.trim()) ? Number(count.trim()) : Number.NaN;
  const seedNum = Number.parseInt(seed, 10);
  const countError =
    !Number.isInteger(countNum) || countNum < 1 || countNum > MAX_COUNT
      ? `Choose a whole number from 1 to ${formatInt(MAX_COUNT)}.`
      : null;
  const seedError =
    !Number.isFinite(seedNum) ||
    seedNum < 0 ||
    seedNum > 0xffffffff ||
    !/^\d+$/.test(seed.trim())
      ? "Use a whole number from 0 to 4,294,967,295."
      : null;

  const latestRequest = useRef(0);
  const runGenerate = useCallback(
    async (opts: GenerateOptions) => {
      const requestId = ++latestRequest.current;
      setBusy(true);
      setError(null);
      try {
        const { result, ms } = await generate(opts);
        if (requestId !== latestRequest.current) return;
        if (result.error) {
          // Drop the previous sample so Copy/Download can't export results
          // that no longer match the form.
          setRun(null);
          setError(result.error);
        } else {
          setRun({ result, ms, options: opts });
          setVisible(PAGE);
        }
      } catch (e) {
        if (e instanceof CancelledError || requestId !== latestRequest.current) return;
        setRun(null);
        setError(e instanceof Error ? e.message : "Generation failed.");
      } finally {
        if (requestId === latestRequest.current) setBusy(false);
      }
    },
    [generate],
  );

  // First sample on load. State is only set in the promise callbacks.
  useEffect(() => {
    const requestId = ++latestRequest.current;
    const opts: GenerateOptions = { ...INITIAL, weights: defaultWeights() };
    generate(opts)
      .then(({ result, ms }) => {
        if (requestId !== latestRequest.current) return;
        setRun({ result, ms, options: opts });
        setBusy(false);
      })
      .catch((e: unknown) => {
        if (e instanceof CancelledError || requestId !== latestRequest.current) return;
        setError(e instanceof Error ? e.message : "Generation failed.");
        setBusy(false);
      });
  }, [generate]);

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (countError || seedError) return;
    void runGenerate({
      count: countNum,
      seed: seedNum,
      mode,
      filters,
      weights,
      coordinates,
    });
  };

  const output = useMemo(
    () => (run ? formatAddresses(run.result.addresses, format, run.options) : ""),
    [run, format],
  );
  const preview = useMemo(() => {
    const lines = output.split(/\r?\n/);
    return lines.length > PREVIEW_LINES
      ? `${lines.slice(0, PREVIEW_LINES).join("\n")}\n… ${formatInt(lines.length - PREVIEW_LINES)} more lines in the download`
      : output;
  }, [output]);

  const points: MapPoint[] = useMemo(
    () =>
      (run?.result.addresses ?? [])
        .filter((a) => a.latitude !== null && a.longitude !== null)
        .map((a) => ({
          id: a.id,
          lon: a.longitude!,
          lat: a.latitude!,
          label: `MOCK · ${a.full_address}`,
        })),
    [run],
  );

  const filterCount = Object.values(filters).filter(
    (v) => v !== null && v !== undefined && v !== "",
  ).length;
  const modeHint = WEIGHT_MODES.find((m) => m.value === mode)?.hint;
  // Stratified, before generating: warn when the count is too small for every
  // area to get a quota. Only without filters, which can remove areas (the
  // results warn either way), and only for settings not yet generated: once
  // they have been, the results carry the same warning.
  const quotaHint = (() => {
    if (mode !== "stratified" || countError || filterCount > 0) return null;
    const lastRun = run?.options;
    if (
      lastRun &&
      lastRun.mode === mode &&
      lastRun.count === countNum &&
      Object.values(lastRun.filters).every(
        (v) => v === null || v === undefined || v === "",
      ) &&
      lastRun.weights.remoteness.length === weights.remoteness.length &&
      lastRun.weights.remoteness.every((w, h) => w === weights.remoteness[h])
    )
      return null;
    const hasSuburbs = filterOptions.raCounts.map((c) => c > 0);
    const live = weights.remoteness.map((w, h) => (hasSuburbs[h] ? Math.max(0, w) : 0));
    const quotas = allocateQuotas(countNum, live);
    const areas = quotas.flatMap((q, h) => (q === 0 && live[h] > 0 ? [h] : []));
    return areas.length
      ? emptyQuotaText(
          {
            areas,
            minCount: minCountForEveryStratum(live),
            equalHelps: equalSharesWouldHelp(countNum, weights.remoteness, hasSuburbs),
          },
          countNum,
          { planned: true },
        )
      : null;
  })();

  const fileName = run
    ? `sa-mock-addresses_seed-${run.options.seed}_${run.result.addresses.length}.${EXTENSION[format]}`
    : "";

  // What the optional scenario assistant sees and may change (invalid fields
  // fall back to the last run's values).
  const currentSettings: GeneratorSettings = {
    count: countError ? (run?.options.count ?? INITIAL.count) : countNum,
    seed: seedError ? (run?.options.seed ?? INITIAL.seed) : seedNum,
    mode,
    weights,
    filters,
    coordinates,
    format,
  };
  const applySettings = (next: GeneratorSettings) => {
    setCount(String(next.count));
    setSeed(String(next.seed));
    setMode(next.mode);
    setWeights(next.weights);
    setFilters(next.filters);
    setCoordinates(next.coordinates);
    setFormat(next.format);
  };

  return (
    <>
      <div className="mx-auto mb-6 max-w-7xl px-4 sm:px-6">
        <ScenarioAssistant
          current={currentSettings}
          catalogue={filterOptions}
          onApply={applySettings}
        />
      </div>
      <div className="mx-auto grid max-w-7xl gap-6 px-4 sm:px-6 lg:grid-cols-[22rem_minmax(0,1fr)]">
        {/* ---------- Settings ---------- */}
        <form
          onSubmit={onSubmit}
          aria-labelledby={`${formId}-title`}
          className="h-fit space-y-5 rounded-xl border bg-card p-4 lg:sticky lg:top-20"
        >
          <h2 id={`${formId}-title`} className="font-heading text-lg font-semibold">
            Settings
          </h2>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor={`${formId}-count`}>How many</Label>
              <Input
                id={`${formId}-count`}
                type="number"
                inputMode="numeric"
                min={1}
                max={MAX_COUNT}
                value={count}
                onChange={(e) => setCount(e.target.value)}
                aria-invalid={Boolean(countError)}
                aria-describedby={`${formId}-count-help`}
                className="font-mono"
              />
              <p
                id={`${formId}-count-help`}
                className={cn(
                  "text-[0.7rem]",
                  countError ? "text-destructive" : "text-muted-foreground",
                )}
              >
                {countError ?? `Up to ${formatInt(MAX_COUNT)}`}
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`${formId}-seed`}>Seed</Label>
              <div className="flex gap-1">
                <Input
                  id={`${formId}-seed`}
                  inputMode="numeric"
                  value={seed}
                  onChange={(e) => setSeed(e.target.value)}
                  aria-invalid={Boolean(seedError)}
                  aria-describedby={`${formId}-seed-help`}
                  className="font-mono"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="size-9 shrink-0"
                  onClick={() => setSeed(String(randomSeed()))}
                  aria-label="Pick a random seed"
                >
                  <Dices aria-hidden />
                </Button>
              </div>
              <p
                id={`${formId}-seed-help`}
                className={cn(
                  "text-[0.7rem]",
                  seedError ? "text-destructive" : "text-muted-foreground",
                )}
              >
                {seedError ?? "Same seed and settings, same output"}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Quick counts">
            {[10, 100, 1000, 5000].map((n) => (
              <Button
                key={n}
                type="button"
                variant="secondary"
                size="xs"
                onClick={() => setCount(String(n))}
              >
                {formatInt(n)}
              </Button>
            ))}
          </div>

          <fieldset className="space-y-2">
            <legend className="mb-1.5 text-sm font-medium">Weighting</legend>
            <div className="space-y-1.5">
              {WEIGHT_MODES.map((m) => (
                <label
                  key={m.value}
                  className={cn(
                    "flex cursor-pointer items-center gap-2.5 rounded-md border px-3 py-2 text-sm transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring",
                    mode === m.value
                      ? "border-primary/60 bg-primary/[0.06]"
                      : "hover:bg-muted/60",
                  )}
                >
                  <input
                    type="radio"
                    name={`${formId}-mode`}
                    value={m.value}
                    checked={mode === m.value}
                    onChange={() => setMode(m.value)}
                    className="size-3.5 accent-[var(--primary)]"
                  />
                  {m.label}
                </label>
              ))}
            </div>
            {modeHint && (
              <p className="text-xs leading-snug text-muted-foreground">{modeHint}</p>
            )}
            {quotaHint && (
              <p className="text-xs leading-snug font-medium text-amber-800 dark:text-sa-gold">
                {quotaHint}
              </p>
            )}
            {(mode === "remoteness" || mode === "stratified") && (
              <WeightsEditor
                kind="remoteness"
                weights={weights}
                onChange={setWeights}
                legend={mode === "stratified" ? "Quota shares by remoteness" : undefined}
              />
            )}
            {mode === "seifa" && (
              <WeightsEditor kind="decile" weights={weights} onChange={setWeights} />
            )}
          </fieldset>

          <div role="group" aria-labelledby={`${formId}-filters`} className="space-y-3">
            <div className="flex min-h-6 items-center justify-between gap-2">
              <p id={`${formId}-filters`} className="text-sm font-medium">
                Filters{" "}
                {filterCount > 0 && (
                  <span className="font-mono text-xs text-muted-foreground">
                    ({filterCount})
                  </span>
                )}
              </p>
              {filterCount > 0 && (
                <Button
                  type="button"
                  variant="ghost"
                  size="xs"
                  onClick={() => setFilters({})}
                >
                  <X aria-hidden /> Clear filters
                </Button>
              )}
            </div>
            <div className="space-y-1.5">
              <Label
                htmlFor={`${formId}-suburb`}
                className="text-xs text-muted-foreground"
              >
                Suburb
              </Label>
              <Input
                id={`${formId}-suburb`}
                list={`${formId}-suburbs`}
                placeholder="Any suburb"
                autoComplete="off"
                value={filters.suburb ?? ""}
                onChange={(e) =>
                  setFilters((f) => ({
                    ...f,
                    suburb: e.target.value.toUpperCase() || null,
                  }))
                }
              />
              <datalist id={`${formId}-suburbs`}>
                {filterOptions.suburbs.map((s) => (
                  <option key={s} value={s} />
                ))}
              </datalist>
            </div>
            <div className="space-y-1.5">
              <Label
                htmlFor={`${formId}-council`}
                className="text-xs text-muted-foreground"
              >
                Council (LGA)
              </Label>
              <Select
                value={filters.council ?? ANY}
                onValueChange={(v) =>
                  setFilters((f) => ({ ...f, council: v === ANY ? null : v }))
                }
              >
                <SelectTrigger id={`${formId}-council`} className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="max-h-72">
                  <SelectItem value={ANY}>Any council</SelectItem>
                  {filterOptions.councils.map((c) => (
                    <SelectItem key={c.name} value={c.name}>
                      {c.name} <span className="text-muted-foreground">({c.count})</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor={`${formId}-ra`} className="text-xs text-muted-foreground">
                  Remoteness
                </Label>
                <Select
                  value={
                    filters.ra === null || filters.ra === undefined
                      ? ANY
                      : String(filters.ra)
                  }
                  onValueChange={(v) =>
                    setFilters((f) => ({ ...f, ra: v === ANY ? null : Number(v) }))
                  }
                >
                  <SelectTrigger id={`${formId}-ra`} className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ANY}>Any</SelectItem>
                    {RA_SHORT.map((name, i) => (
                      <SelectItem key={name} value={String(i)}>
                        {name}{" "}
                        <span className="text-muted-foreground">
                          ({filterOptions.raCounts[i]})
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label
                  htmlFor={`${formId}-decile`}
                  className="text-xs text-muted-foreground"
                >
                  SEIFA decile
                </Label>
                <Select
                  value={
                    filters.decile === null || filters.decile === undefined
                      ? ANY
                      : String(filters.decile)
                  }
                  onValueChange={(v) =>
                    setFilters((f) => ({ ...f, decile: v === ANY ? null : Number(v) }))
                  }
                >
                  <SelectTrigger id={`${formId}-decile`} className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ANY}>Any</SelectItem>
                    {filterOptions.decileCounts.map((n, i) => (
                      <SelectItem key={i} value={String(i + 1)}>
                        {i + 1} <span className="text-muted-foreground">({n})</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          <div className="flex items-start justify-between gap-3 rounded-md bg-muted/60 px-3 py-2.5">
            <Label
              htmlFor={`${formId}-coords`}
              className="flex-col items-start gap-0.5 text-sm"
            >
              Coordinates
              <span className="text-xs font-normal text-muted-foreground">
                A random point inside the suburb boundary
              </span>
            </Label>
            <Switch
              id={`${formId}-coords`}
              checked={coordinates}
              onCheckedChange={setCoordinates}
            />
          </div>

          <Button
            type="submit"
            size="lg"
            className="h-10 w-full text-sm"
            disabled={busy || Boolean(countError || seedError)}
          >
            {busy ? (
              <Loader2 className="animate-spin" aria-hidden />
            ) : (
              <Play aria-hidden />
            )}
            {busy ? "Generating…" : "Generate addresses"}
          </Button>
        </form>

        {/* ---------- Results ---------- */}
        <section aria-labelledby={`${formId}-results`} className="min-w-0 space-y-4">
          <MockNotice />
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="space-y-1">
              <h2 id={`${formId}-results`} className="font-heading text-lg font-semibold">
                Results
              </h2>
              <p className="text-sm text-muted-foreground" aria-live="polite">
                {busy && !run && "Generating the first sample…"}
                {run &&
                  `${plural(run.result.addresses.length, "address", "addresses")} · seed ${run.options.seed} · ${
                    WEIGHT_MODES.find((m) => m.value === run.options.mode)?.label
                  } · ${plural(run.result.eligible - run.result.zeroWeight, "suburb", "suburbs")} in play · ${run.ms.toFixed(0)} ms in a Web Worker`}
              </p>
              {run?.options.mode === "stratified" && run.result.emptyQuotas && (
                <p className="text-sm font-medium text-amber-800 dark:text-sa-gold">
                  {emptyQuotaText(run.result.emptyQuotas, run.result.addresses.length)}
                </p>
              )}
            </div>
            {run && (
              <div className="flex flex-wrap items-center gap-2">
                <Link
                  href={`/verify?seed=${run.options.seed}&count=${run.result.addresses.length}&mode=${run.options.mode}${
                    run.options.filters.suburb
                      ? `&suburb=${encodeURIComponent(run.options.filters.suburb)}`
                      : ""
                  }${
                    run.options.filters.council
                      ? `&council=${encodeURIComponent(run.options.filters.council)}`
                      : ""
                  }${
                    run.options.filters.ra !== null &&
                    run.options.filters.ra !== undefined
                      ? `&ra=${run.options.filters.ra}`
                      : ""
                  }${
                    run.options.filters.decile !== null &&
                    run.options.filters.decile !== undefined
                      ? `&decile=${run.options.filters.decile}`
                      : ""
                  }`}
                >
                  <Button variant="secondary" size="sm">
                    <CheckCircle2 aria-hidden /> Verify these results
                  </Button>
                </Link>
                <ToggleGroup
                  type="single"
                  variant="outline"
                  size="sm"
                  value={format}
                  onValueChange={(v) => v && setFormat(v as OutputFormat)}
                  aria-label="Output format"
                >
                  <ToggleGroupItem value="text">Text</ToggleGroupItem>
                  <ToggleGroupItem value="json">JSON</ToggleGroupItem>
                  <ToggleGroupItem value="csv">CSV</ToggleGroupItem>
                </ToggleGroup>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={async () => {
                    const ok = await copyText(output);
                    if (ok)
                      toast.success(`Copied ${format.toUpperCase()} to the clipboard`);
                    else
                      toast.error(
                        "The clipboard is not available here. Use Download instead.",
                      );
                  }}
                >
                  <Copy aria-hidden /> Copy
                </Button>
                <Button
                  size="sm"
                  onClick={() => downloadText(fileName, output, MIME[format])}
                >
                  <Download aria-hidden /> Download
                </Button>
              </div>
            )}
          </div>

          {error && (
            <div
              role="alert"
              className="rounded-lg border border-destructive/40 bg-destructive/[0.06] px-3.5 py-3 text-sm"
            >
              <p className="font-medium text-destructive">Nothing generated</p>
              <p className="text-ink-soft">
                {error} Loosen a filter or give a category a positive weight.
              </p>
            </div>
          )}

          {!run && !error && (
            <div className="flex h-64 items-center justify-center gap-2 rounded-xl border border-dashed text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" aria-hidden /> Loading the suburb
              table…
            </div>
          )}

          {run && (
            <Tabs
              value={tab}
              onValueChange={setTab}
              className={cn(busy && "opacity-60 transition-opacity")}
            >
              <TabsList className="h-9">
                <TabsTrigger value="addresses">Addresses</TabsTrigger>
                <TabsTrigger value="map">Map</TabsTrigger>
                <TabsTrigger value="check">Target check</TabsTrigger>
                <TabsTrigger value="output">Raw output</TabsTrigger>
              </TabsList>

              <TabsContent value="addresses" className="mt-2">
                <ol
                  className="grid gap-2 xl:grid-cols-2"
                  aria-label="Generated mock addresses"
                >
                  {run.result.addresses.slice(0, visible).map((a) => (
                    <li key={a.id}>
                      <AddressTag
                        index={a.id}
                        fullAddress={a.full_address}
                        meta={[
                          a.council,
                          shortRemoteness(a.remoteness_level),
                          a.seifa_decile_sa
                            ? `IRSAD decile ${a.seifa_decile_sa}`
                            : "no SEIFA",
                        ]}
                        coords={
                          a.latitude !== null && a.longitude !== null
                            ? [a.longitude, a.latitude]
                            : null
                        }
                      />
                    </li>
                  ))}
                </ol>
                {visible < run.result.addresses.length && (
                  <div className="mt-4 flex flex-wrap items-center gap-3">
                    <Button
                      variant="outline"
                      onClick={() => setVisible((v) => v + PAGE * 5)}
                    >
                      Show{" "}
                      {formatInt(
                        Math.min(PAGE * 5, run.result.addresses.length - visible),
                      )}{" "}
                      more
                    </Button>
                    <span className="text-sm text-muted-foreground">
                      Showing {formatInt(visible)} of{" "}
                      {formatInt(run.result.addresses.length)}. The download has them all.
                    </span>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="map" className="mt-2 space-y-3">
                {points.length === 0 ? (
                  <div className="flex h-72 flex-col items-center justify-center gap-2 rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
                    <MapPinned className="size-5" aria-hidden />
                    Turn on{" "}
                    <strong className="font-medium text-foreground">
                      Coordinates
                    </strong>{" "}
                    and generate again to map the sample.
                  </div>
                ) : (
                  <>
                    <div className="flex flex-wrap items-center gap-2 text-sm">
                      <span className="text-muted-foreground">Shade suburbs by</span>
                      <ToggleGroup
                        type="single"
                        variant="outline"
                        size="sm"
                        value={mapColor}
                        onValueChange={(v) => v && setMapColor(v as ColorBy)}
                        aria-label="Shade suburbs by"
                      >
                        <ToggleGroupItem value="none">Nothing</ToggleGroupItem>
                        <ToggleGroupItem value="remoteness">Remoteness</ToggleGroupItem>
                        <ToggleGroupItem value="seifa">SEIFA</ToggleGroupItem>
                      </ToggleGroup>
                    </div>
                    <div className="h-[28rem] sm:h-[34rem]">
                      <SaMap
                        label={`Map of ${points.length} generated mock addresses`}
                        points={points}
                        colorBy={mapColor}
                        cooperative
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Each dot is a mock point drawn uniformly inside its suburb&apos;s
                      simplified ABS boundary.
                      {run.result.coordinateFallbacks > 0 &&
                        ` ${run.result.coordinateFallbacks} fell back to the suburb's label point.`}
                    </p>
                  </>
                )}
              </TabsContent>

              <TabsContent value="check" className="mt-2">
                <TargetCheck result={run.result} mode={run.options.mode} />
              </TabsContent>

              <TabsContent value="output" className="mt-2">
                <pre
                  tabIndex={0}
                  aria-label={`${format.toUpperCase()} output preview`}
                  className="terminal max-h-[36rem] overflow-auto p-4 whitespace-pre"
                >
                  {preview}
                </pre>
              </TabsContent>
            </Tabs>
          )}
        </section>
      </div>
    </>
  );
}
