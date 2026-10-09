import Link from "next/link";
import { site } from "@/lib/site";

export function SiteFooter() {
  return (
    <footer className="mt-24 border-t bg-background/80">
      <div className="mx-auto grid max-w-7xl gap-8 px-4 py-10 text-sm sm:px-6 md:grid-cols-[1.4fr_1fr_1fr]">
        <div className="space-y-3">
          <p className="font-heading text-base font-semibold">{site.name}</p>
          <p className="max-w-md text-muted-foreground">
            Every address on this site is synthetic test data. A generated address can
            match a real one by chance, so never use it for mail, identity checks or to
            stand in for a person.
          </p>
          <p className="font-mono text-xs text-muted-foreground">
            Personal project, 2025 &middot; revived 2026 &middot; MIT licence
          </p>
        </div>
        <div className="space-y-2">
          <p className="eyebrow">Data &amp; services</p>
          <ul className="space-y-1.5 text-muted-foreground">
            <li>Suburbs, boundaries, SEIFA: ABS, CC BY 4.0</li>
            <li>
              Basemap:{" "}
              <a
                className="underline-offset-2 hover:underline"
                href="https://openfreemap.org"
              >
                OpenFreeMap
              </a>
              , &copy; OpenStreetMap contributors
            </li>
            <li>
              Geocoding:{" "}
              <a
                className="underline-offset-2 hover:underline"
                href="https://photon.komoot.io"
              >
                Photon
              </a>{" "}
              by komoot
            </li>
          </ul>
        </div>
        <div className="space-y-2">
          <p className="eyebrow">Project</p>
          <ul className="space-y-1.5">
            <li>
              <a
                className="text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                href={site.repo}
              >
                Source on GitHub
              </a>
            </li>
            <li>
              <Link
                className="text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                href="/data"
              >
                Data provenance
              </Link>
            </li>
            <li>
              <Link
                className="text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                href="/methods"
              >
                Methods and decision records
              </Link>
            </li>
            <li>
              <Link
                className="text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                href="/ai-log"
              >
                AI audit log
              </Link>
            </li>
            <li>
              <Link
                className="text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                href="/tour"
              >
                Guided tour
              </Link>
            </li>
            <li>
              <Link
                className="text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                href="/#about"
              >
                About this project
              </Link>
            </li>
          </ul>
        </div>
      </div>
    </footer>
  );
}
