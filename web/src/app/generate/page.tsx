import type { Metadata } from "next";
import { PageHeader } from "@/components/common/page-header";
import { GeneratorApp } from "@/components/generate/generator-app";
import { getFilterOptions } from "@/lib/server/data";

export const metadata: Metadata = {
  title: "Generate",
  description:
    "Generate up to 5,000 mock South Australian addresses with a seed, filters and remoteness, SEIFA or population weighting.",
};

export default function GeneratePage() {
  const options = getFilterOptions();
  return (
    <>
      <PageHeader eyebrow="Generator" title="Generate mock South Australian addresses">
        <p>
          The recipe is the 2025 one: pick a suburb, then a street number from 1 to 999
          and one of 49 Adelaide street names. What changed is the suburb table (rebuilt
          from ABS 2021 data), the weighting the original README promised, and coordinates
          drawn inside the real suburb boundary. Everything runs in your browser, seeded,
          so a seed always gives the same list.
        </p>
      </PageHeader>
      <GeneratorApp options={options} />
    </>
  );
}
