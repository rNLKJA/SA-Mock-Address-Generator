import type { Metadata } from "next";
import { VerificationApp } from "@/components/verify/verification-app";

export const metadata: Metadata = {
  title: "Verify",
  description:
    "Upload or paste a generated CSV to verify mock South Australian address generation results with comprehensive validation checks.",
};

export default function VerifyPage() {
  return <VerificationApp />;
}
