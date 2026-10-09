import type { SamplingEvidence } from "@/lib/server/sampling";
import type { XY } from "@/lib/stats";
import { formatInt } from "@/lib/utils";

type Figure = SamplingEvidence["uniformity"]["figure"];

const W = 220;
const PAD = 8;

/** One small multiple: the suburb outline and a point pattern, north up. */
function Panel({
  figure,
  points,
  title,
  caption,
}: {
  figure: Figure;
  points: XY[];
  title: string;
  caption: string;
}) {
  const all = figure.rings.flat();
  const minX = Math.min(...all.map((p) => p[0]));
  const maxX = Math.max(...all.map((p) => p[0]));
  const minY = Math.min(...all.map((p) => p[1]));
  const maxY = Math.max(...all.map((p) => p[1]));
  const scale = (W - 2 * PAD) / Math.max(maxX - minX, maxY - minY);
  const h = Math.round((maxY - minY) * scale + 2 * PAD);
  const sx = (x: number) => PAD + (x - minX) * scale;
  const sy = (y: number) => h - PAD - (y - minY) * scale;
  const path = figure.rings
    .map(
      (ring) =>
        `M${ring.map(([x, y]) => `${sx(x).toFixed(1)},${sy(y).toFixed(1)}`).join("L")}Z`,
    )
    .join("");
  return (
    <figure className="min-w-0 space-y-2">
      <svg
        viewBox={`0 0 ${W} ${h}`}
        role="img"
        aria-label={`${title}: ${caption}`}
        className="h-auto w-full rounded-lg border bg-[var(--viz-surface)]"
      >
        <path
          d={path}
          fillRule="evenodd"
          fill="color-mix(in oklch, var(--viz-grid) 55%, transparent)"
          stroke="var(--viz-axis)"
          strokeWidth="1"
        />
        {points.map(([x, y], i) => (
          <circle
            key={i}
            cx={sx(x)}
            cy={sy(y)}
            r={points.length === 1 ? 5 : 2.4}
            fill="var(--point)"
            stroke="var(--viz-surface)"
            strokeWidth="1"
          />
        ))}
      </svg>
      <figcaption className="space-y-0.5 text-xs">
        <span className="block font-medium text-foreground">{title}</span>
        <span className="block text-muted-foreground">{caption}</span>
      </figcaption>
    </figure>
  );
}

export function PointPatternFigure({
  figure,
  results,
}: {
  figure: Figure;
  /** R for the generator, the 2025 approach and the clustered control. */
  results: { generator: number; geocoded: number; clustered: number; n: number };
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-3">
      <Panel
        figure={figure}
        points={figure.uniform}
        title="This generator (seed 2025)"
        caption={`${formatInt(results.n)} points, R = ${results.generator.toFixed(2)}: no sign of clustering or regular spacing.`}
      />
      <Panel
        figure={figure}
        points={[figure.geocoded]}
        title="2025 approach"
        caption={`All ${formatInt(results.n)} addresses on one geocoded point, R = ${results.geocoded.toFixed(2)}.`}
      />
      <Panel
        figure={figure}
        points={figure.clustered}
        title="Clustered control"
        caption={`${formatInt(results.n)} points around five centres, R = ${results.clustered.toFixed(2)}: flagged, as it should be.`}
      />
    </div>
  );
}
