// MapLibre GL v6 loads its worker from a URL computed at runtime, which bundlers
// cannot see. Copy the worker into public/vendor so the app can point at it with
// maplibregl.setWorkerUrl(). Runs on postinstall, dev and build.
import { copyFileSync, mkdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const pkgPath = require.resolve("maplibre-gl/package.json");
const { version } = JSON.parse(readFileSync(pkgPath, "utf8"));
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "public", "vendor");
mkdirSync(outDir, { recursive: true });
copyFileSync(
  join(dirname(pkgPath), "dist", "maplibre-gl-worker.mjs"),
  join(outDir, "maplibre-gl-worker.mjs"),
);
console.log(`[copy-maplibre-worker] maplibre-gl ${version} worker -> public/vendor/`);
