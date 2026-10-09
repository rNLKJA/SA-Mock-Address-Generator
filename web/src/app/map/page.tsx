import type { Metadata } from "next";
import { PageHeader } from "@/components/common/page-header";
import { AtlasApp } from "@/components/map/atlas-app";

export const metadata: Metadata = {
  title: "Suburb map",
  description:
    "Every South Australian suburb and locality, shaded by ABS remoteness, SEIFA IRSAD decile, or the remoteness recorded in the 2025 table.",
};

export default function MapPage() {
  return (
    <>
      <PageHeader eyebrow="Atlas" title="1,695 suburbs, three ways of seeing them">
        <p>
          The boundaries are the ABS 2021 Suburbs and Localities, simplified with
          mapshaper to about 470 KB gzipped (1.8 MB raw). Switch to the 2025 table to see
          how much of the state the original data left as &ldquo;Not Applicable&rdquo;.
        </p>
      </PageHeader>
      <AtlasApp />
    </>
  );
}
