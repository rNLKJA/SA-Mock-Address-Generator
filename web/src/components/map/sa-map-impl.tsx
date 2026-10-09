"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import {
  MapLibreMap,
  Marker,
  NavigationControl,
  Popup,
  ScaleControl,
  setWorkerUrl,
  type ExpressionSpecification,
  type GeoJSONSource,
  type MapGeoJSONFeature,
  type StyleSpecification,
} from "maplibre-gl";
import { useTheme } from "next-themes";
import { useEffect, useRef, useState } from "react";
import { CloudOff, Loader2 } from "lucide-react";
import { SA_BBOX, type BBox, type LonLat } from "@/lib/geo";
import {
  BOUNDARY,
  DECILE_RAMP,
  FALLBACK_BASEMAP,
  NEUTRAL,
  POINT,
  REMOTENESS_RAMP,
  type ThemeName,
} from "@/lib/palette";
import { cn } from "@/lib/utils";

setWorkerUrl("/vendor/maplibre-gl-worker.mjs");

export type ColorBy = "remoteness" | "seifa" | "original" | "none";

export interface MapPoint {
  id: number;
  lon: number;
  lat: number;
  label: string;
}

export interface MapFocus {
  key: string;
  bbox?: BBox;
  center?: LonLat;
  zoom?: number;
}

export interface SaMapProps {
  label: string;
  colorBy?: ColorBy;
  points?: MapPoint[];
  marker?: LonLat | null;
  highlightCode?: string | null;
  focus?: MapFocus | null;
  onSuburbSelect?: (code: string, name: string) => void;
  onMapClick?: (lonLat: LonLat) => void;
  cooperative?: boolean;
  className?: string;
}

const OPENFREEMAP: Record<ThemeName, string> = {
  light: "https://tiles.openfreemap.org/styles/positron",
  dark: "https://tiles.openfreemap.org/styles/dark",
};
const SAL_ATTRIBUTION = "Suburbs, SEIFA: ABS 2021 (CC BY 4.0)";
const TILE_TIMEOUT_MS = 9000;

function fillColor(colorBy: ColorBy, theme: ThemeName): ExpressionSpecification | string {
  const ra = REMOTENESS_RAMP[theme];
  const neutral = NEUTRAL[theme];
  if (colorBy === "remoteness") {
    return [
      "match",
      ["get", "ra"],
      0,
      ra[0],
      1,
      ra[1],
      2,
      ra[2],
      3,
      ra[3],
      4,
      ra[4],
      neutral,
    ];
  }
  if (colorBy === "original") {
    return [
      "match",
      ["coalesce", ["get", "o"], -1],
      0,
      ra[0],
      1,
      ra[1],
      2,
      ra[2],
      3,
      ra[3],
      4,
      ra[4],
      5,
      neutral,
      "rgba(0,0,0,0)",
    ];
  }
  if (colorBy === "seifa") {
    const d = DECILE_RAMP[theme];
    return [
      "match",
      ["coalesce", ["get", "d"], -1],
      ...d.flatMap((c, i) => [i + 1, c]),
      neutral,
    ] as unknown as ExpressionSpecification;
  }
  return "rgba(0,0,0,0)";
}

function fallbackStyle(theme: ThemeName): StyleSpecification {
  const c = FALLBACK_BASEMAP[theme];
  return {
    version: 8,
    sources: {
      context: {
        type: "geojson",
        data: "/data/sa-context.geojson",
        attribution: "State outlines: ABS 2021 (CC BY 4.0)",
      },
    },
    layers: [
      { id: "fb-water", type: "background", paint: { "background-color": c.water } },
      {
        id: "fb-land",
        type: "fill",
        source: "context",
        paint: { "fill-color": ["case", ["==", ["get", "code"], "4"], c.landSa, c.land] },
      },
      {
        id: "fb-line",
        type: "line",
        source: "context",
        paint: { "line-color": c.line, "line-width": 0.8 },
      },
    ],
  };
}

/** Suburb fill opacity: lower on the night map so place labels stay legible. */
const FILL_OPACITY: Record<ThemeName, number> = { light: 0.62, dark: 0.48 };

/**
 * Nudge the OpenFreeMap land and water colours toward the notebook palette.
 * On the night map the style's grey labels disappear over the ochre suburb
 * fill, so labels get a light ink with a dark halo.
 */
function tintBasemap(map: MapLibreMap, theme: ThemeName) {
  const c = FALLBACK_BASEMAP[theme];
  for (const layer of map.getStyle().layers ?? []) {
    try {
      if (layer.type === "background")
        map.setPaintProperty(layer.id, "background-color", c.landSa);
      else if (layer.type === "fill" && /^water/.test(layer.id))
        map.setPaintProperty(layer.id, "fill-color", c.water);
      else if (
        theme === "dark" &&
        layer.type === "symbol" &&
        layer.layout?.["text-field"]
      ) {
        map.setPaintProperty(layer.id, "text-color", "#efe8d8");
        map.setPaintProperty(layer.id, "text-halo-color", "rgba(13,21,32,0.9)");
        map.setPaintProperty(layer.id, "text-halo-width", 1.5);
      }
    } catch {
      // Unknown layer shapes are left as they are.
    }
  }
}

/** Phones: start with the attribution collapsed to its (i) button. */
function collapseAttributionOnSmallScreens(el: HTMLElement) {
  if (el.offsetWidth >= 640) return;
  el.querySelector(".maplibregl-ctrl-attrib.maplibregl-compact")?.classList.remove(
    "maplibregl-compact-show",
  );
}

function pointsCollection(points: MapPoint[] | undefined) {
  return {
    type: "FeatureCollection" as const,
    features: (points ?? []).map((p) => ({
      type: "Feature" as const,
      id: p.id,
      properties: { label: p.label },
      geometry: { type: "Point" as const, coordinates: [p.lon, p.lat] },
    })),
  };
}

export default function SaMapImpl({
  label,
  colorBy = "none",
  points,
  marker,
  highlightCode,
  focus,
  onSuburbSelect,
  onMapClick,
  cooperative = false,
  className,
}: SaMapProps) {
  const { resolvedTheme } = useTheme();
  const theme: ThemeName = resolvedTheme === "dark" ? "dark" : "light";
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markerRef = useRef<Marker | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "fallback" | "unsupported">(
    "loading",
  );
  const fallbackRef = useRef(false);

  // Latest props, read when overlays are (re)built after a style change.
  const latest = useRef({
    colorBy,
    points,
    highlightCode,
    theme,
    onSuburbSelect,
    onMapClick,
  });
  useEffect(() => {
    latest.current = {
      colorBy,
      points,
      highlightCode,
      theme,
      onSuburbSelect,
      onMapClick,
    };
  });

  useEffect(() => {
    if (!container.current) return;
    let map: MapLibreMap;
    try {
      map = new MapLibreMap({
        container: container.current,
        style: OPENFREEMAP[latest.current.theme],
        bounds: SA_BBOX as [number, number, number, number],
        fitBoundsOptions: { padding: 16 },
        attributionControl: { compact: true },
        cooperativeGestures: cooperative,
        maxBounds: [
          [110, -48],
          [160, -8],
        ],
      });
    } catch {
      // No WebGL: report it after this effect instead of synchronously.
      void Promise.resolve().then(() => setStatus("unsupported"));
      return;
    }
    mapRef.current = map;
    map.addControl(new NavigationControl({ showCompass: false }), "top-right");
    map.addControl(new ScaleControl({ unit: "metric" }), "bottom-left");

    let loaded = false;
    const goFallback = () => {
      if (fallbackRef.current) return;
      fallbackRef.current = true;
      setStatus("fallback");
      map.setStyle(fallbackStyle(latest.current.theme));
    };
    const timer = window.setTimeout(() => {
      if (!loaded) goFallback();
    }, TILE_TIMEOUT_MS);

    const addOverlays = () => {
      const { colorBy: cb, points: pts, highlightCode: hl, theme: th } = latest.current;
      if (map.getSource("sal")) return;
      if (!fallbackRef.current) tintBasemap(map, th);
      const firstSymbol = map.getStyle().layers?.find((l) => l.type === "symbol")?.id;
      map.addSource("sal", {
        type: "geojson",
        data: "/data/sal-sa.geojson",
        promoteId: "c",
        attribution: SAL_ATTRIBUTION,
      });
      map.addLayer(
        {
          id: "sal-fill",
          type: "fill",
          source: "sal",
          paint: {
            "fill-color": fillColor(cb, th),
            "fill-opacity": cb === "none" ? 0 : FILL_OPACITY[th],
          },
        },
        firstSymbol,
      );
      map.addLayer(
        {
          id: "sal-line",
          type: "line",
          source: "sal",
          paint: {
            "line-color": BOUNDARY[th].line,
            "line-opacity": [
              "interpolate",
              ["linear"],
              ["zoom"],
              4,
              0.18,
              9,
              0.45,
              13,
              0.7,
            ],
            "line-width": ["interpolate", ["linear"], ["zoom"], 4, 0.3, 10, 0.8, 14, 1.4],
          },
        },
        firstSymbol,
      );
      map.addLayer(
        {
          id: "sal-hover",
          type: "line",
          source: "sal",
          paint: {
            "line-color": BOUNDARY[th].highlight,
            "line-width": [
              "case",
              ["boolean", ["feature-state", "hover"], false],
              1.8,
              0,
            ],
          },
        },
        firstSymbol,
      );
      map.addLayer({
        id: "sal-highlight",
        type: "line",
        source: "sal",
        filter: ["==", ["get", "c"], hl ?? ""],
        paint: { "line-color": BOUNDARY[th].highlight, "line-width": 2.6 },
      });
      map.addSource("pts", { type: "geojson", data: pointsCollection(pts) });
      map.addLayer({
        id: "pts",
        type: "circle",
        source: "pts",
        paint: {
          "circle-radius": ["interpolate", ["linear"], ["zoom"], 4, 3.2, 10, 5, 14, 7],
          "circle-color": POINT[th].fill,
          "circle-stroke-color": POINT[th].ring,
          "circle-stroke-width": 1.5,
        },
      });
    };

    map.on("style.load", addOverlays);
    // The OpenFreeMap dark style names an icon ("circle-11") that its sprite does
    // not contain. Register a transparent 1x1 stand-in so MapLibre does not warn.
    map.setMissingStyleImageResolver((id) => {
      if (!map.hasImage(id))
        map.addImage(id, { width: 1, height: 1, data: new Uint8Array(4) });
    });
    map.on("load", () => {
      loaded = true;
      window.clearTimeout(timer);
      collapseAttributionOnSmallScreens(map.getContainer());
      if (!fallbackRef.current) setStatus("ready");
    });
    map.on("error", (event) => {
      if (!loaded && !fallbackRef.current) {
        console.warn("Basemap failed, using the bundled outline basemap.", event.error);
        goFallback();
      }
    });

    let hoverId: string | number | undefined;
    const hoverPopup = new Popup({ closeButton: false, closeOnClick: false, offset: 10 });
    const clearHover = () => {
      if (hoverId !== undefined)
        map.setFeatureState({ source: "sal", id: hoverId }, { hover: false });
      hoverId = undefined;
      hoverPopup.remove();
    };
    map.on("mousemove", "sal-fill", (e) => {
      const f = e.features?.[0] as MapGeoJSONFeature | undefined;
      if (!f) return;
      if (hoverId !== f.id) {
        clearHover();
        hoverId = f.id;
        if (hoverId !== undefined)
          map.setFeatureState({ source: "sal", id: hoverId }, { hover: true });
      }
      map.getCanvas().style.cursor = "pointer";
      hoverPopup
        .setLngLat(e.lngLat)
        .setText(String(f.properties?.n ?? ""))
        .addTo(map);
    });
    map.on("mouseleave", "sal-fill", () => {
      map.getCanvas().style.cursor = "";
      clearHover();
    });
    map.on("click", (e) => {
      const { onSuburbSelect: select, onMapClick: click } = latest.current;
      const pt = map.queryRenderedFeatures(e.point, { layers: ["pts"] })[0];
      if (pt) {
        new Popup({ offset: 8 })
          .setLngLat(e.lngLat)
          .setText(String(pt.properties?.label ?? ""))
          .addTo(map);
        return;
      }
      click?.([e.lngLat.lng, e.lngLat.lat]);
      if (select) {
        const f = map.queryRenderedFeatures(e.point, { layers: ["sal-fill"] })[0];
        if (f) select(String(f.properties?.c), String(f.properties?.n ?? ""));
      }
    });

    return () => {
      window.clearTimeout(timer);
      hoverPopup.remove();
      markerRef.current?.remove();
      markerRef.current = null;
      map.remove();
      mapRef.current = null;
    };
    // The map is created once; prop changes are applied by the effects below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Theme switch: swap the basemap and rebuild overlays in the new palette.
  const themeRef = useRef(theme);
  useEffect(() => {
    const map = mapRef.current;
    if (!map || themeRef.current === theme) return;
    themeRef.current = theme;
    map.setStyle(fallbackRef.current ? fallbackStyle(theme) : OPENFREEMAP[theme]);
  }, [theme]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map?.getLayer("sal-fill")) return;
    map.setPaintProperty("sal-fill", "fill-color", fillColor(colorBy, theme));
    map.setPaintProperty(
      "sal-fill",
      "fill-opacity",
      colorBy === "none" ? 0 : FILL_OPACITY[theme],
    );
  }, [colorBy, theme, status]);

  useEffect(() => {
    const src = mapRef.current?.getSource("pts") as GeoJSONSource | undefined;
    src?.setData(pointsCollection(points));
  }, [points, status]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map?.getLayer("sal-highlight")) return;
    map.setFilter("sal-highlight", ["==", ["get", "c"], highlightCode ?? ""]);
  }, [highlightCode, status]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (!marker) {
      markerRef.current?.remove();
      markerRef.current = null;
      return;
    }
    if (!markerRef.current) {
      markerRef.current = new Marker({ color: POINT[theme].fill })
        .setLngLat(marker)
        .addTo(map);
    } else {
      markerRef.current.setLngLat(marker);
    }
  }, [marker, theme]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !focus) return;
    if (focus.bbox) {
      map.fitBounds(focus.bbox as [number, number, number, number], {
        padding: 48,
        maxZoom: 13,
        duration: 800,
      });
    } else if (focus.center) {
      map.flyTo({ center: focus.center, zoom: focus.zoom ?? 12, duration: 800 });
    }
    // focus.key identifies a request; re-run only when it changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus?.key]);

  return (
    <div
      className={cn(
        "relative h-full w-full overflow-hidden rounded-lg border bg-muted",
        className,
      )}
    >
      {/* Inline position: maplibre-gl.css (unlayered) would override a Tailwind utility. */}
      <div
        ref={container}
        role="region"
        aria-label={label}
        style={{ position: "absolute", inset: 0 }}
      />
      {status === "loading" && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" aria-hidden /> Loading map&hellip;
        </div>
      )}
      {status === "fallback" && (
        <p className="absolute top-2 left-2 flex max-w-[75%] items-center gap-1.5 rounded-md border bg-card/95 px-2 py-1 text-xs text-muted-foreground">
          <CloudOff className="size-3.5 shrink-0" aria-hidden />
          Map tiles unavailable: showing the bundled outline basemap.
        </p>
      )}
      {status === "unsupported" && (
        <div className="absolute inset-0 flex items-center justify-center p-6 text-center text-sm text-muted-foreground">
          This browser can&apos;t draw the interactive map (WebGL is unavailable).
          Everything else on this page still works.
        </div>
      )}
    </div>
  );
}
