import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Clapperboard, ShieldAlert } from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { LazyVideo } from "@/components/tour/lazy-video";
import { ScreenshotGallery } from "@/components/tour/screenshot-gallery";
import { Button } from "@/components/ui/button";
import {
  MOCK_ANSWER_PREFIX,
  MOCK_LABEL,
  SCREENSHOTS,
  WALKTHROUGHS,
  walkthroughMedia,
  type Walkthrough,
} from "@/lib/showcase";
import { site } from "@/lib/site";

export const metadata: Metadata = {
  title: "Guided tour",
  description:
    "Three short captioned walkthroughs (generate a seeded test set, check whether the sample hit its target, look up a real address) and screenshots of every key feature, recorded by a reproducible Playwright script.",
};

export default function TourPage() {
  return (
    <>
      <PageHeader eyebrow="Guided tour" title="The lab in three short walkthroughs">
        <p>
          Each video follows one workflow from start to finish, with the step shown on
          screen, as captions and in the list beside it. A Playwright script recorded them
          from this site and checked every step on the way (the seeded sample, the
          interval and test statistic it quotes, the CSV it downloads, the suburb a lookup
          lands in), so a broken feature would fail the recording rather than appear in
          it.
        </p>
      </PageHeader>

      <div className="mx-auto max-w-7xl space-y-20 px-4 sm:px-6">
        <nav
          aria-label="On this page"
          className="-mt-2 flex flex-wrap gap-x-5 gap-y-1.5 text-sm"
        >
          {WALKTHROUGHS.map((w, i) => (
            <a
              key={w.id}
              href={`#${w.id}`}
              className="text-primary underline decoration-primary/40 underline-offset-2 hover:decoration-primary"
            >
              {i + 1}. {w.title}
            </a>
          ))}
          <a
            href="#screenshots"
            className="text-primary underline decoration-primary/40 underline-offset-2 hover:decoration-primary"
          >
            Screenshots
          </a>
        </nav>

        {WALKTHROUGHS.map((w, i) => (
          <WalkthroughSection key={w.id} walkthrough={w} index={i} />
        ))}

        <section aria-labelledby="screenshots" className="scroll-mt-20 space-y-5">
          <div className="max-w-3xl space-y-2">
            <p className="eyebrow">Screenshots</p>
            <h2 id="screenshots" className="text-2xl font-semibold sm:text-3xl">
              Every key feature at a glance
            </h2>
            <div className="prose-notebook text-sm">
              <p>
                Captured by the same script, in light mode at 1440 × 900 (the landing page
                also in dark mode) and on a 390 px phone. Select one to enlarge it; the
                arrow keys step through the set.
              </p>
            </div>
          </div>
          <ScreenshotGallery items={SCREENSHOTS} />
        </section>

        <section
          aria-labelledby="how-made"
          className="grid gap-4 rounded-xl border bg-card p-5 sm:p-6 md:grid-cols-[auto_1fr]"
        >
          <Clapperboard className="size-6 text-sa-blue" aria-hidden />
          <div className="space-y-2 text-sm leading-relaxed text-ink-soft">
            <h2
              id="how-made"
              className="font-heading text-xl font-semibold text-foreground"
            >
              How these were made
            </h2>
            <p>
              <code className="rounded bg-muted px-1 py-px font-mono text-[0.85em]">
                pnpm showcase
              </code>{" "}
              runs{" "}
              <code className="rounded bg-muted px-1 py-px font-mono text-[0.85em]">
                web/e2e/showcase.spec.ts
              </code>{" "}
              from the{" "}
              <a
                href={site.repo}
                className="text-primary underline decoration-primary/40 underline-offset-2"
              >
                repository
              </a>{" "}
              on the system Chrome: it plays each journey at a human pace with an
              on-screen caption and cursor, asserts what it shows, and records it at 1280
              × 800. ffmpeg then encodes the H.264 videos on this page and the GIFs in the
              README. The captions and the step lists here are the same text as the
              on-screen steps, and a unit test recomputes every number they quote.
            </p>
            <p>
              No real API key is used anywhere. The AI screenshots use a placeholder key,
              every request to the provider is intercepted in the browser, and the reply
              is a labelled mock whose rationale starts with &ldquo;{MOCK_ANSWER_PREFIX}
              &rdquo;
            </p>
          </div>
        </section>
      </div>
    </>
  );
}

function WalkthroughSection({
  walkthrough: w,
  index,
}: {
  walkthrough: Walkthrough;
  index: number;
}) {
  const media = walkthroughMedia(w.id);
  const mocked = new Set(w.mockedSteps ?? []);
  const stepsId = `${w.id}-steps`;
  return (
    <section aria-labelledby={w.id} className="scroll-mt-20 space-y-5">
      <div className="max-w-3xl space-y-2">
        <p className="eyebrow">
          Walkthrough {index + 1} of {WALKTHROUGHS.length} · {w.route}
        </p>
        <h2 id={w.id} className="text-2xl font-semibold sm:text-3xl">
          {w.title}
        </h2>
        <div className="prose-notebook text-sm">
          <p>{w.summary}</p>
        </div>
      </div>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <figure className="min-w-0 space-y-3">
          <LazyVideo
            src={media.mp4}
            poster={media.poster}
            captions={media.captions}
            label={`${w.title}: a ${w.steps.length}-step walkthrough with captions`}
            width={1280}
            height={800}
          />
          <figcaption className="flex flex-wrap items-start gap-x-4 gap-y-1 text-xs leading-relaxed text-muted-foreground">
            <span className="min-w-0 flex-1">
              <span className="font-medium text-foreground">Setup:</span> {w.setup}
            </span>
            <a
              href={media.mp4}
              className="text-primary underline decoration-primary/40 underline-offset-2"
            >
              Open the MP4
            </a>
          </figcaption>
          {mocked.size > 0 ? (
            <p className="flex gap-2.5 rounded-lg border border-sa-gold/40 bg-sa-gold/[0.08] px-3.5 py-3 text-sm">
              <ShieldAlert
                className="mt-0.5 size-4 shrink-0 text-amber-800 dark:text-sa-gold"
                aria-hidden
              />
              <span>
                <strong className="font-medium">{MOCK_LABEL}.</strong> These steps use a
                placeholder key; requests to the provider are intercepted in the browser
                and answered by a mock, so no model was called.
              </span>
            </p>
          ) : null}
        </figure>

        <div className="space-y-4">
          <h3 id={stepsId} className="font-heading text-lg font-semibold">
            Steps{" "}
            <span className="font-sans text-sm font-normal text-muted-foreground">
              (transcript)
            </span>
          </h3>
          <ol aria-labelledby={stepsId} className="space-y-2.5">
            {w.steps.map((step, k) => (
              <li key={step} className="flex gap-3 text-sm leading-relaxed">
                <span className="flex h-6 min-w-6 shrink-0 items-center justify-center rounded bg-sa-blue/10 px-1 font-mono text-xs font-semibold text-sa-blue tabular-nums">
                  {k + 1}
                </span>
                <span>
                  {step}
                  {mocked.has(k + 1) ? (
                    <span className="block text-xs text-amber-800 dark:text-sa-gold">
                      {MOCK_LABEL}
                    </span>
                  ) : null}
                </span>
              </li>
            ))}
          </ol>
          <Button asChild variant="outline">
            <Link href={w.route}>
              Try it yourself <ArrowRight aria-hidden />
            </Link>
          </Button>
        </div>
      </div>
    </section>
  );
}
