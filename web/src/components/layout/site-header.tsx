import Link from "next/link";
import { site } from "@/lib/site";
import { TrigMark } from "./logo";
import { SiteNav } from "./site-nav";
import { ThemeToggle } from "./theme-toggle";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b bg-background/85 backdrop-blur supports-[backdrop-filter]:bg-background/70">
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-3 px-4 sm:px-6">
        <Link href="/" className="group flex items-center gap-2.5 rounded-md py-1 pr-2">
          <TrigMark className="size-7 text-foreground" />
          <span className="leading-none">
            <span className="block font-heading text-[1.05rem] font-semibold tracking-tight">
              {site.shortName}
            </span>
            <span className="block font-mono text-[0.6rem] tracking-[0.18em] text-muted-foreground uppercase">
              South Australia
            </span>
          </span>
        </Link>
        <div className="ml-auto flex items-center gap-1">
          <SiteNav />
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
