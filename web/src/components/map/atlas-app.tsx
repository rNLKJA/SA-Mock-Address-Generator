"use client";

import { useEffect, useId, useMemo, useState } from "react";
import { Loader2, Search } from "lucide-react";
import { SuburbCard, type OriginalRowView } from "@/components/common/suburb-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { fetchOriginalTable, useSuburbData } from "@/hooks/use-suburb-data";
import { RA_NAMES } from "@/lib/suburbs";
import { MapLegend, type LegendCounts } from "./map-legend";
import { SaMap, type ColorBy, type MapFocus } from "./sa-map";

const COLOR_OPTIONS: { value: ColorBy; label: string; note: string }[] = [
  {
    value: "remoteness",
    label: "Remoteness",
    note: "ABS Remoteness Areas 2021, assigned by where most of each suburb's residents live.",
  },
  {
    value: "seifa",
    label: "SEIFA",
    note: "Index of Relative Socio-economic Advantage and Disadvantage (IRSAD) 2021, ranked within South Australia.",
  },
  {
    value: "original",
    label: "2025 table",
    note: "The remoteness column of the original table, matched by suburb name. Grey is “Not Applicable”: 997 rows in the table, 797 of them matching an ABS suburb.",
  },
];

export function AtlasApp() {
  const id = useId();
  const { data, error } = useSuburbData(true);
  const [original, setOriginal] = useState<Map<string, OriginalRowView> | null>(null);
  const [colorBy, setColorBy] = useState<ColorBy>("remoteness");
  const [selected, setSelected] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [focus, setFocus] = useState<MapFocus | null>(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    fetchOriginalTable()
      .then((t) =>
        setOriginal(
          new Map(
            t.rows.map(([suburb, postcode, council, ses, remoteness]) => [
              suburb.toUpperCase(),
              { postcode, council, ses, remoteness },
            ]),
          ),
        ),
      )
      .catch(() => setOriginal(new Map()));
  }, []);

  const counts: LegendCounts = useMemo(() => {
    if (!data) return {};
    const remoteness = [0, 0, 0, 0, 0];
    const decile = Array(10).fill(0) as number[];
    let noDecile = 0;
    const origRa = [0, 0, 0, 0, 0];
    let notApplicable = 0;
    let unmatched = 0;
    for (const r of data.rows) {
      remoteness[r.ra]++;
      if (r.decileSa === null) noDecile++;
      else decile[r.decileSa - 1]++;
      const o = original?.get(r.name);
      if (!o) unmatched++;
      else if (o.remoteness === "Not Applicable") notApplicable++;
      else origRa[(RA_NAMES as readonly string[]).indexOf(o.remoteness)]++;
    }
    return {
      remoteness,
      decile,
      noDecile,
      original: { ra: origRa, notApplicable, unmatched },
    };
  }, [data, original]);

  const select = (code: string) => {
    setSelected(code);
    const bbox = data?.index?.bbox(code);
    if (bbox) setFocus({ key: `${code}-${Date.now()}`, bbox });
  };

  const suburb = selected && data ? data.byCode.get(selected) : null;
  const note = COLOR_OPTIONS.find((o) => o.value === colorBy)?.note;

  return (
    <div className="mx-auto grid max-w-7xl gap-5 px-4 sm:px-6 lg:grid-cols-[22rem_minmax(0,1fr)]">
      <aside className="space-y-4" aria-label="Map controls and suburb details">
        <div className="space-y-3 rounded-xl border bg-card p-4">
          <p className="text-sm font-medium" id={`${id}-shade`}>
            Shade suburbs by
          </p>
          <ToggleGroup
            type="single"
            variant="outline"
            value={colorBy}
            onValueChange={(v) => v && setColorBy(v as ColorBy)}
            aria-labelledby={`${id}-shade`}
            className="w-full"
          >
            {COLOR_OPTIONS.map((o) => (
              <ToggleGroupItem key={o.value} value={o.value} className="flex-1">
                {o.label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          <p className="text-xs leading-snug text-muted-foreground">{note}</p>
          {data ? (
            <MapLegend colorBy={colorBy} counts={counts} />
          ) : (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" aria-hidden /> Loading suburbs…
            </p>
          )}
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <form
          role="search"
          className="space-y-2 rounded-xl border bg-card p-4"
          onSubmit={(e) => {
            e.preventDefault();
            const hit = data?.byName.get(query.trim().toUpperCase());
            setNotFound(!hit);
            if (hit) select(hit.code);
          }}
        >
          <label htmlFor={`${id}-find`} className="text-sm font-medium">
            Find a suburb
          </label>
          <div className="flex gap-2">
            <Input
              id={`${id}-find`}
              list={`${id}-names`}
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setNotFound(false);
              }}
              placeholder="e.g. Coober Pedy"
              autoComplete="off"
              className="h-9"
            />
            <Button type="submit" size="lg" aria-label="Find suburb" disabled={!data}>
              <Search aria-hidden />
            </Button>
          </div>
          <datalist id={`${id}-names`}>
            {data?.rows.map((r) => (
              <option key={r.code} value={r.name} />
            ))}
          </datalist>
          {notFound && (
            <p role="alert" className="text-xs text-destructive">
              No suburb called &ldquo;{query}&rdquo;. Pick one from the list.
            </p>
          )}
          {!suburb && (
            <p className="text-xs text-muted-foreground">
              Or click any suburb on the map.
            </p>
          )}
        </form>

        {suburb && (
          <SuburbCard
            suburb={suburb}
            original={original ? (original.get(suburb.name) ?? null) : undefined}
          />
        )}
      </aside>

      <div className="h-[30rem] sm:h-[38rem] lg:sticky lg:top-20 lg:h-[calc(100vh-7rem)]">
        <SaMap
          label="Map of South Australian suburbs, shaded by the selected measure. Click a suburb for details."
          colorBy={colorBy}
          highlightCode={selected}
          focus={focus}
          onSuburbSelect={(code) => setSelected(code)}
        />
      </div>
    </div>
  );
}
