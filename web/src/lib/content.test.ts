import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  loadDecisionRecords,
  loadDataCard,
  parseMarkdown,
  rewriteDocHref,
} from "./content";

const docs = path.resolve(process.cwd(), "..", "docs");

describe("docs content", () => {
  it("the copies in src/content match ../docs (run `pnpm sync:docs` after editing docs)", () => {
    // skipped only where the repository root is not available (e.g. a web/-only upload)
    if (!existsSync(docs)) return;
    const files = readdirSync(path.join(docs, "decisions")).filter((f) =>
      f.endsWith(".md"),
    );
    expect(files.length).toBeGreaterThanOrEqual(3);
    for (const f of files) {
      expect(
        readFileSync(path.join(process.cwd(), "src/content/decisions", f), "utf8"),
      ).toBe(readFileSync(path.join(docs, "decisions", f), "utf8"));
    }
    expect(
      readFileSync(path.join(process.cwd(), "src/content/data-card.md"), "utf8"),
    ).toBe(readFileSync(path.join(docs, "data-card.md"), "utf8"));
  });

  it("every decision record has the required sections, in order", () => {
    const records = loadDecisionRecords();
    expect(records.map((r) => r.id)).toEqual([
      "DR-001",
      "DR-002",
      "DR-003",
      "DR-004",
      "DR-005",
    ]);
    for (const r of records) {
      expect(r.summary.length).toBeGreaterThan(20);
      const order = [
        "## Context",
        "## Decision",
        "## Options considered",
        "## Why",
        "## What happened",
        "## What I'd change",
      ].map((h) => r.body.indexOf(h));
      expect(order.every((i) => i >= 0)).toBe(true);
      expect([...order].sort((a, b) => a - b)).toEqual(order);
      expect(r.body).not.toMatch(/—/); // house style: no em dashes
    }
  });

  it("parses front matter and rewrites links between docs", () => {
    const doc = parseMarkdown('---\nid: X\ntitle: "Quoted"\n---\n# Heading\n\nBody');
    expect(doc.meta).toEqual({ id: "X", title: "Quoted" });
    expect(doc.heading).toBe("Heading");
    expect(doc.body).toBe("Body");
    expect(
      rewriteDocHref("decisions/DR-003-synthetic-coordinates-not-geocoding.md"),
    ).toBe("/methods#dr-003");
    expect(rewriteDocHref("../data-card.md")).toBe("/methods#data-card");
    expect(rewriteDocHref("https://example.com")).toBe("https://example.com");
    expect(loadDataCard().heading).toMatch(/Data card/);
    expect(loadDataCard().body).not.toMatch(/—/);
  });
});
