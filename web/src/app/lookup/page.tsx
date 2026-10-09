import type { Metadata } from "next";
import { PageHeader } from "@/components/common/page-header";
import { LookupApp } from "@/components/lookup/lookup-app";

export const metadata: Metadata = {
  title: "Lookup",
  description:
    "Look up a real South Australian place with Photon, then find its ABS suburb, postcode, council, remoteness and SEIFA decile by point-in-polygon.",
};

export default function LookupPage() {
  return (
    <>
      <PageHeader eyebrow="Lookup" title="Which suburb is this point in?">
        <p>
          The 2025 tool sent addresses to the Mapbox Geocoding API, which needs a key.
          This version asks the free, keyless Photon geocoder for coordinates, then finds
          the suburb itself by testing the point against the ABS boundaries, and reports
          the council, postcode, remoteness and SEIFA decile from the rebuilt table.
        </p>
      </PageHeader>
      <LookupApp />
    </>
  );
}
