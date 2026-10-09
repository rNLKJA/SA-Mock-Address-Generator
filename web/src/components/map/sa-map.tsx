"use client";

import dynamic from "next/dynamic";
import { Loader2 } from "lucide-react";
import type { SaMapProps } from "./sa-map-impl";

export type { ColorBy, MapFocus, MapPoint, SaMapProps } from "./sa-map-impl";

/** MapLibre is ~1 MB, so it is loaded on the client only, when a map is shown. */
export const SaMap = dynamic<SaMapProps>(() => import("./sa-map-impl"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full min-h-64 items-center justify-center gap-2 rounded-lg border bg-muted text-sm text-muted-foreground">
      <Loader2 className="size-4 animate-spin" aria-hidden /> Loading map&hellip;
    </div>
  ),
});
