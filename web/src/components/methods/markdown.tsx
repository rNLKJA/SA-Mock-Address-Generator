import Link from "next/link";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ScrollTable } from "@/components/common/scroll-table";
import { rewriteDocHref } from "@/lib/content";
import { cn } from "@/lib/utils";

/**
 * Renders the repository's markdown docs (decision records, data card) on the
 * server. Headings shift down to nest under the page's own: markdown `##`
 * becomes an h3 (or h4 inside a decision record), and wide tables scroll.
 */
export function Markdown({
  children,
  className,
  sectionLevel = 3,
  label = "Document",
}: {
  children: string;
  className?: string;
  sectionLevel?: 3 | 4;
  /** names the document in table labels, e.g. "Data card" or "DR-002" */
  label?: string;
}) {
  const Section = sectionLevel === 3 ? "h3" : "h4";
  const Sub = sectionLevel === 3 ? "h4" : "h5";
  let tables = 0;
  return (
    <div className={cn("prose-doc", className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children }) => <Section className="doc-h">{children}</Section>,
          h2: ({ children }) => <Section className="doc-h">{children}</Section>,
          h3: ({ children }) => <Sub className="doc-sub">{children}</Sub>,
          a: ({ href = "", children }) => {
            const to = rewriteDocHref(href);
            return to.startsWith("/") || to.startsWith("#") ? (
              <Link href={to}>{children}</Link>
            ) : (
              <a href={to} target="_blank" rel="noreferrer noopener">
                {children}
              </a>
            );
          },
          table: ({ children }) => (
            <ScrollTable label={`${label} table ${++tables}`} className="doc-table">
              <table>{children}</table>
            </ScrollTable>
          ),
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
