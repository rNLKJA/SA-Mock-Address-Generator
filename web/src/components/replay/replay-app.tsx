"use client";

import { useEffect, useId, useMemo, useState } from "react";
import { Copy, Dices, Loader2, Play, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
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
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { fetchOriginalTable } from "@/hooks/use-suburb-data";
import { copyText, randomSeed } from "@/lib/download";
import {
  replayCommand,
  resolveDistribution,
  runGenerate,
  runOptions,
  seededLookup,
  toArgv,
  type CliFormat,
  type CliResult,
  type GenerateArgs,
} from "@/lib/original/cli";
import { loadOriginalTable, type OriginalRow } from "@/lib/original/lookup";
import { cn, formatInt } from "@/lib/utils";

type FilterKind = "none" | "suburb" | "council" | "remoteness" | "socioeconomic";
type Command = "generate" | "options";

const MAX_REPLAY = 500;

interface Ran {
  command: Command;
  seed: number;
  args: GenerateArgs;
  result: CliResult;
  notes: string[];
}

function quirkNotes(
  rows: readonly OriginalRow[],
  args: GenerateArgs,
  result: CliResult,
): string[] {
  const notes: string[] = [];
  const { type, value } = resolveDistribution(args);
  if (args.socioeconomic === 0) {
    notes.push(
      "`elif args.socioeconomic:` treats 0 as false, so --socioeconomic 0 applies no filter at all.",
    );
  }
  if (type !== "default") {
    const matched = seededLookup(rows, 0).filterSuburbsByDistribution(type, value).length;
    if (matched === 0) {
      notes.push(
        type === "socioeconomic"
          ? `Every row has SocioEconomicStatus 0, so level ${value} matches nothing and the code silently falls back to all ${formatInt(rows.length)} suburbs.`
          : `No row matches ${type} "${value}", so the code silently falls back to all ${formatInt(rows.length)} suburbs.`,
      );
    } else {
      notes.push(
        `The filter keeps ${formatInt(matched)} of ${formatInt(rows.length)} rows; each is equally likely.`,
      );
    }
  }
  if (result.addresses.some((a) => a.postcode < 1000)) {
    notes.push(
      "Postcode 872 lost its leading zero in the 2025 CSV: Australia Post writes it as 0872.",
    );
  }
  if (result.addresses.some((a) => a.remoteness_level === "Not Applicable")) {
    notes.push('"Not Applicable" is the remoteness of 997 of the 1,894 rows.');
  }
  return notes;
}

export function ReplayApp() {
  const id = useId();
  const [rows, setRows] = useState<OriginalRow[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [command, setCommand] = useState<Command>("generate");
  const [seed, setSeed] = useState("42");
  const [count, setCount] = useState("3");
  const [format, setFormat] = useState<CliFormat>("default");
  const [kind, setKind] = useState<FilterKind>("none");
  const [value, setValue] = useState("");
  const [ran, setRan] = useState<Ran | null>(null);

  useEffect(() => {
    fetchOriginalTable()
      .then((json) => {
        const loaded = loadOriginalTable(json);
        setRows(loaded);
        // First replay: the documented seed-42 example.
        const args: GenerateArgs = { count: 3, format: "default" };
        const result = runGenerate(loaded, 42, args);
        setRan({
          command: "generate",
          seed: 42,
          args,
          result,
          notes: quirkNotes(loaded, args, result),
        });
      })
      .catch((e: unknown) =>
        setLoadError(e instanceof Error ? e.message : "Could not load the 2025 table."),
      );
  }, []);

  const options = useMemo(
    () => (rows ? seededLookup(rows, 0).getAvailableOptions() : null),
    [rows],
  );

  const seedNum = Number(seed);
  const countNum = Number(count);
  const seedOk = /^\d+$/.test(seed.trim()) && seedNum <= 0xffffffff;
  const countOk = Number.isInteger(countNum) && countNum >= 1 && countNum <= MAX_REPLAY;

  const buildArgs = (): GenerateArgs => {
    const args: GenerateArgs = { count: countNum, format };
    if (kind === "suburb" && value) args.suburb = value;
    if (kind === "council" && value) args.council = value;
    if (kind === "remoteness" && value) args.remoteness = value;
    if (kind === "socioeconomic" && value !== "") args.socioeconomic = Number(value);
    return args;
  };

  const run = (override?: { seed: number }) => {
    if (!rows) return;
    const s = override?.seed ?? seedNum;
    const args = buildArgs();
    const result =
      command === "options" ? runOptions(rows, format) : runGenerate(rows, s, args);
    setRan({
      command,
      seed: s,
      args,
      result,
      notes: command === "generate" ? quirkNotes(rows, args, result) : [],
    });
  };

  const argv = ran
    ? ran.command === "options"
      ? [
          ...(ran.args.format !== "default" ? ["--format", ran.args.format] : []),
          "options",
        ]
      : toArgv(ran.args)
    : [];
  const pythonCmd = ran ? replayCommand(ran.seed, argv) : "";
  const shown = ran
    ? `$ python cli.py ${argv.map((a) => (/\s/.test(a) ? `"${a}"` : a)).join(" ")}\n${ran.result.stdout}${ran.result.stderr}`
    : "";

  return (
    <div className="mx-auto grid max-w-7xl gap-6 px-4 sm:px-6 lg:grid-cols-[22rem_minmax(0,1fr)]">
      <form
        className="h-fit space-y-4 rounded-xl border bg-card p-4 lg:sticky lg:top-20"
        onSubmit={(e) => {
          e.preventDefault();
          if (seedOk && (countOk || command === "options")) run();
        }}
        aria-label="Replay settings"
      >
        <div className="space-y-1.5">
          <p className="text-sm font-medium" id={`${id}-cmd`}>
            Command
          </p>
          <ToggleGroup
            type="single"
            variant="outline"
            value={command}
            onValueChange={(v) => v && setCommand(v as Command)}
            aria-labelledby={`${id}-cmd`}
            className="w-full"
          >
            <ToggleGroupItem value="generate" className="flex-1 font-mono">
              generate
            </ToggleGroupItem>
            <ToggleGroupItem value="options" className="flex-1 font-mono">
              options
            </ToggleGroupItem>
          </ToggleGroup>
        </div>

        <div className="space-y-1.5">
          <p className="text-sm font-medium" id={`${id}-fmt`}>
            --format
          </p>
          <ToggleGroup
            type="single"
            variant="outline"
            value={format}
            onValueChange={(v) => v && setFormat(v as CliFormat)}
            aria-labelledby={`${id}-fmt`}
            className="w-full"
          >
            {(["default", "json", "csv"] as const).map((f) => (
              <ToggleGroupItem key={f} value={f} className="flex-1 font-mono">
                {f}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>

        {command === "generate" && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor={`${id}-seed`}>Seed</Label>
                <div className="flex gap-1">
                  <Input
                    id={`${id}-seed`}
                    inputMode="numeric"
                    value={seed}
                    onChange={(e) => setSeed(e.target.value)}
                    aria-invalid={!seedOk}
                    className="font-mono"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="size-9 shrink-0"
                    aria-label="Pick a random seed"
                    onClick={() => setSeed(String(randomSeed()))}
                  >
                    <Dices aria-hidden />
                  </Button>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`${id}-count`}>count</Label>
                <Input
                  id={`${id}-count`}
                  type="number"
                  min={1}
                  max={MAX_REPLAY}
                  value={count}
                  onChange={(e) => setCount(e.target.value)}
                  aria-invalid={!countOk}
                  aria-describedby={`${id}-count-help`}
                  className="font-mono"
                />
              </div>
            </div>
            <p
              id={`${id}-count-help`}
              className={cn(
                "-mt-2 text-[0.7rem]",
                !seedOk || !countOk ? "text-destructive" : "text-muted-foreground",
              )}
            >
              {!seedOk
                ? "Seed: a whole number up to 4,294,967,295."
                : !countOk
                  ? `count: 1 to ${MAX_REPLAY} here.`
                  : "Seeds Python's random and NumPy's global RNG."}
            </p>

            <div className="space-y-1.5">
              <Label htmlFor={`${id}-kind`}>
                Filter (one at a time, like the original)
              </Label>
              <Select
                value={kind}
                onValueChange={(v) => {
                  setKind(v as FilterKind);
                  setValue(v === "socioeconomic" ? "5" : "");
                }}
              >
                <SelectTrigger id={`${id}-kind`} className="w-full font-mono">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">none</SelectItem>
                  <SelectItem value="suburb">--suburb</SelectItem>
                  <SelectItem value="council">--council</SelectItem>
                  <SelectItem value="remoteness">--remoteness</SelectItem>
                  <SelectItem value="socioeconomic">--socioeconomic</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {kind === "suburb" && (
              <div className="space-y-1.5">
                <Label htmlFor={`${id}-val`} className="text-xs text-muted-foreground">
                  Suburb (case-insensitive)
                </Label>
                <Input
                  id={`${id}-val`}
                  list={`${id}-subs`}
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  placeholder="ADELAIDE"
                  autoComplete="off"
                  className="font-mono"
                />
                <datalist id={`${id}-subs`}>
                  {options?.suburbs.map((s) => (
                    <option key={s} value={s} />
                  ))}
                </datalist>
              </div>
            )}
            {(kind === "council" || kind === "remoteness" || kind === "socioeconomic") &&
              options && (
                <div className="space-y-1.5">
                  <Label htmlFor={`${id}-val`} className="text-xs text-muted-foreground">
                    Value
                  </Label>
                  <Select value={value} onValueChange={setValue}>
                    <SelectTrigger id={`${id}-val`} className="w-full font-mono text-xs">
                      <SelectValue placeholder="Choose…" />
                    </SelectTrigger>
                    <SelectContent className="max-h-72">
                      {(kind === "council"
                        ? options.councils
                        : kind === "remoteness"
                          ? options.remoteness_levels
                          : ["0", "1", "2", "3", "4", "5"]
                      ).map((o) => (
                        <SelectItem
                          key={o}
                          value={String(o)}
                          className="font-mono text-xs"
                        >
                          {o}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
          </>
        )}

        <div className="flex gap-2">
          <Button
            type="submit"
            size="lg"
            className="h-10 flex-1"
            disabled={!rows || !seedOk || (command === "generate" && !countOk)}
          >
            {rows ? (
              <Play aria-hidden />
            ) : (
              <Loader2 className="animate-spin" aria-hidden />
            )}{" "}
            Run
          </Button>
          {command === "generate" && (
            <Button
              type="button"
              variant="outline"
              size="lg"
              className="h-10"
              disabled={!rows}
              onClick={() => {
                const s = randomSeed();
                setSeed(String(s));
                run({ seed: s });
              }}
            >
              <Dices aria-hidden /> New seed
            </Button>
          )}
        </div>
        {loadError && <p className="text-sm text-destructive">{loadError}</p>}
      </form>

      <section className="min-w-0 space-y-4" aria-label="Replay output">
        <pre
          tabIndex={0}
          aria-label="Terminal output of the replayed command"
          aria-live="polite"
          className="terminal max-h-[36rem] min-h-72 overflow-auto p-4 whitespace-pre"
        >
          {ran ? shown : "Loading the 2025 table…"}
        </pre>

        {ran && ran.notes.length > 0 && (
          <ul className="space-y-2" aria-label="What the original code did here">
            {ran.notes.map((n) => (
              <li
                key={n}
                className="flex gap-2.5 rounded-lg border border-sa-gold/40 bg-sa-gold/[0.07] px-3.5 py-2.5 text-sm"
              >
                <TriangleAlert
                  className="mt-0.5 size-4 shrink-0 text-sa-gold"
                  aria-hidden
                />
                <span>{n}</span>
              </li>
            ))}
          </ul>
        )}

        {ran && (
          <div className="space-y-2 rounded-xl border bg-card p-4">
            <p className="text-sm font-medium">Check it against the real Python</p>
            <p className="text-sm text-muted-foreground">
              From a clone of the repo, this runs the unchanged{" "}
              <code className="font-mono text-xs">original/cli.py</code> with both
              generators seeded. It prints the same bytes as the panel above.
            </p>
            <div className="flex items-start gap-2">
              <code className="min-w-0 flex-1 rounded-md bg-muted px-3 py-2 font-mono text-xs break-all">
                {pythonCmd}
              </code>
              <Button
                variant="outline"
                size="icon"
                className="size-9 shrink-0"
                aria-label="Copy the Python command"
                onClick={async () => {
                  if (await copyText(pythonCmd)) toast.success("Command copied");
                  else toast.error("The clipboard is not available here.");
                }}
              >
                <Copy aria-hidden />
              </Button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
