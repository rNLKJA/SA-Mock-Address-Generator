/**
 * Build-time access to the decision records and the data card.
 *
 * The canonical files live in the repository's `docs/` folder. The site is
 * deployed from `web/` alone, so `pnpm sync:docs` copies them into
 * `src/content/` (and content.test.ts fails if the copies drift).
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

const CONTENT_DIR = path.join(process.cwd(), "src", "content");

export interface MarkdownDoc {
  /** front-matter fields (simple `key: value` lines) */
  meta: Record<string, string>;
  /** markdown body without the front matter and without the leading H1 */
  body: string;
  /** the leading H1 text, if any */
  heading: string | null;
  file: string;
}

export function parseMarkdown(source: string, file = ""): MarkdownDoc {
  let text = source.replace(/\r\n/g, "\n");
  const meta: Record<string, string> = {};
  const fm = /^---\n([\s\S]*?)\n---\n/.exec(text);
  if (fm) {
    for (const line of fm[1].split("\n")) {
      const m = /^([A-Za-z][\w-]*):\s*(.*)$/.exec(line);
      if (m) meta[m[1]] = m[2].trim().replace(/^"(.*)"$/, "$1");
    }
    text = text.slice(fm[0].length);
  }
  text = text.replace(/^\s+/, "");
  let heading: string | null = null;
  const h1 = /^# (.+)\n/.exec(text);
  if (h1) {
    heading = h1[1].trim();
    text = text.slice(h1[0].length).replace(/^\s+/, "");
  }
  return { meta, body: text, heading, file };
}

export interface DecisionRecord extends MarkdownDoc {
  id: string;
  /** anchor on /methods, e.g. "dr-001" */
  anchor: string;
  title: string;
  status: string;
  date: string;
  /** the "Decision in one line" sentence, without its label */
  summary: string;
}

export function capitalise(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function loadDecisionRecords(dir = CONTENT_DIR): DecisionRecord[] {
  const decisions = path.join(dir, "decisions");
  return readdirSync(decisions)
    .filter((f) => /^DR-\d{3}-.+\.md$/.test(f))
    .sort()
    .map((f) => {
      const doc = parseMarkdown(readFileSync(path.join(decisions, f), "utf8"), f);
      const id = doc.meta.id ?? f.slice(0, 6);
      const oneLine = /^\*\*Decision in one line:\*\*\s*(.+)$/m.exec(doc.body);
      return {
        ...doc,
        id,
        anchor: id.toLowerCase(),
        title: doc.meta.title ?? doc.heading ?? id,
        status: doc.meta.status ?? "",
        date: doc.meta.date ?? "",
        // the markdown reads "Decision in one line: every fit…"; on its own in the callout
        // the sentence needs a capital
        summary: oneLine ? capitalise(oneLine[1].trim()) : "",
        body: oneLine ? doc.body.replace(oneLine[0], "").replace(/^\s+/, "") : doc.body,
      };
    });
}

export function loadDataCard(dir = CONTENT_DIR): MarkdownDoc {
  return parseMarkdown(
    readFileSync(path.join(dir, "data-card.md"), "utf8"),
    "data-card.md",
  );
}

/**
 * Links between the docs point at sibling .md files; on the site they become
 * anchors on /methods (e.g. decisions/DR-003-...md -> #dr-003).
 */
export function rewriteDocHref(href: string): string {
  const dr = /(?:^|\/)(DR-\d{3})-[^/]*\.md(#.*)?$/.exec(href);
  if (dr) return `/methods#${dr[1].toLowerCase()}`;
  if (/(?:^|\/)data-card\.md$/.test(href)) return "/methods#data-card";
  return href;
}
