/**
 * Main verification orchestration.
 */
import type { MockAddress } from "@/lib/generator/generate";
import type { Suburb } from "@/lib/suburbs";
import type { VerificationResult, RecordCheck } from "./types";
import {
  checkRequiredFields,
  checkPostcodeFormat,
  checkAddressFormat,
  checkMockStamp,
  checkStreetNumberRange,
  checkSeifaDecileRange,
  checkRemotenessLevel,
  checkCoordinateConsistency,
  checkPostcodeMatchesSuburb,
  checkSuburbMetadata,
  checkDuplicateAddresses,
  checkDuplicateCoordinates,
} from "./checks";

export async function runVerification(
  addresses: MockAddress[],
  suburbs: Suburb[],
  seed?: number,
): Promise<VerificationResult> {
  const recordChecks: RecordCheck[] = [];

  // Build suburb lookup map
  const suburbsByName = new Map<string, Suburb>();
  for (const s of suburbs) {
    suburbsByName.set(s.name, s);
  }

  recordChecks.push(checkRequiredFields(addresses));
  recordChecks.push(checkPostcodeFormat(addresses));
  recordChecks.push(checkAddressFormat(addresses));
  recordChecks.push(checkMockStamp(addresses));
  recordChecks.push(checkStreetNumberRange(addresses));
  recordChecks.push(checkSeifaDecileRange(addresses));
  recordChecks.push(checkRemotenessLevel(addresses));
  recordChecks.push(checkCoordinateConsistency(addresses));
  recordChecks.push(checkPostcodeMatchesSuburb(addresses, suburbsByName));
  recordChecks.push(checkSuburbMetadata(addresses, suburbs));
  recordChecks.push(checkDuplicateAddresses(addresses));
  recordChecks.push(checkDuplicateCoordinates(addresses));

  const allFailedSet = new Set<number>();
  for (const check of recordChecks) {
    for (const id of check.failedIds) {
      allFailedSet.add(id);
    }
  }
  const allFailedIds = Array.from(allFailedSet).sort((a, b) => a - b);

  return {
    timestamp: new Date().toISOString(),
    seed: seed ?? null,
    count: addresses.length,
    recordChecks,
    setChecks: [],
    totalFailedRows: allFailedIds.length,
    allFailedIds,
  };
}
