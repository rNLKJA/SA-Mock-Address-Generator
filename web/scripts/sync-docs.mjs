// Copy the decision records and the data card from ../docs into src/content so
// the site (deployed from web/ alone) can render them. content.test.ts fails if
// the copies drift; edit ../docs, then run `pnpm sync:docs`.
import { copyFileSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const web = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const docs = path.resolve(web, "..", "docs");
const out = path.join(web, "src", "content");

rmSync(path.join(out, "decisions"), { recursive: true, force: true });
mkdirSync(path.join(out, "decisions"), { recursive: true });
for (const f of readdirSync(path.join(docs, "decisions")).filter((f) =>
  f.endsWith(".md"),
)) {
  copyFileSync(path.join(docs, "decisions", f), path.join(out, "decisions", f));
  console.log(`synced docs/decisions/${f}`);
}
copyFileSync(path.join(docs, "data-card.md"), path.join(out, "data-card.md"));
console.log("synced docs/data-card.md");
