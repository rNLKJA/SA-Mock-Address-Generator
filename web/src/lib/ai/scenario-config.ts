/**
 * "Describe a test scenario" (optional, bring-your-own-key).
 *
 * The visitor describes the test data they need in plain words; the model
 * proposes a generator configuration as structured output. The proposal is
 * validated twice: by zod against the same contract as the JSON schema sent to
 * the provider, then against the reference table (is that council real? is the
 * count in range?). Nothing is applied until the visitor reviews the proposed
 * changes field by field and chooses which to apply.
 *
 * What is sent: the scenario text, the current settings, and the catalogue of
 * allowed values (remoteness areas, deciles, the 71 council names). No suburb
 * list, no generated addresses, nothing about the visitor.
 */
import { z } from "zod";
import { MAX_COUNT } from "@/lib/generator/generate";
import type { OutputFormat } from "@/lib/generator/format";
import {
  WEIGHT_MODES,
  configDecileWeights,
  configRemotenessWeights,
  type Filters,
  type WeightMode,
  type Weights,
} from "@/lib/generator/weights";
import { RA_NAMES, RA_SHORT } from "@/lib/suburbs";

export const SCENARIO_FEATURE = "scenario-config";
export const SCENARIO_FEATURE_LABEL = "Describe a test scenario";
/** Longest scenario accepted (characters). */
export const MAX_SCENARIO_LENGTH = 1000;

const MODES = ["uniform", "remoteness", "seifa", "population", "stratified"] as const;
const FORMATS = ["text", "json", "csv"] as const;

/**
 * The contract, exactly as in SCENARIO_JSON_SCHEMA and nothing stricter.
 * Ranges, lengths and names are checked afterwards by `reviewProposal`, which
 * flags a bad field instead of throwing away a reply the visitor paid for.
 */
export const ProposalSchema = z.object({
  count: z.number(),
  seed: z.number().nullable(),
  mode: z.enum(MODES),
  remoteness_weights: z.array(z.number()).nullable(),
  decile_weights: z.array(z.number()).nullable(),
  filters: z.object({
    suburb: z.string().nullable(),
    council: z.string().nullable(),
    remoteness_area: z.enum(RA_NAMES).nullable(),
    seifa_decile: z.number().nullable(),
  }),
  coordinates: z.boolean(),
  output_format: z.enum(FORMATS),
  rationale: z.string(),
  assumptions: z.array(z.string()),
  unsupported: z.array(z.string()),
});

export type Proposal = z.infer<typeof ProposalSchema>;

const nullable = (schema: Record<string, unknown>) => ({
  anyOf: [schema, { type: "null" }],
});

/** The same contract as JSON Schema, for the providers' structured-output modes. */
export const SCENARIO_JSON_SCHEMA: Record<string, unknown> = {
  type: "object",
  additionalProperties: false,
  required: [
    "count",
    "seed",
    "mode",
    "remoteness_weights",
    "decile_weights",
    "filters",
    "coordinates",
    "output_format",
    "rationale",
    "assumptions",
    "unsupported",
  ],
  properties: {
    count: { type: "integer", description: `Number of addresses, 1 to ${MAX_COUNT}.` },
    seed: nullable({
      type: "integer",
      description: "A seed only if the scenario asks for one; otherwise null.",
    }),
    mode: { type: "string", enum: [...MODES] },
    remoteness_weights: nullable({
      type: "array",
      items: { type: "number" },
      description:
        "Five non-negative weights in remoteness order (Major Cities, Inner Regional, Outer Regional, Remote, Very Remote), for the remoteness or stratified modes; null to keep the current weights.",
    }),
    decile_weights: nullable({
      type: "array",
      items: { type: "number" },
      description:
        "Ten non-negative weights for IRSAD deciles 1 to 10, for the seifa mode; null to keep the current weights.",
    }),
    filters: {
      type: "object",
      additionalProperties: false,
      required: ["suburb", "council", "remoteness_area", "seifa_decile"],
      properties: {
        suburb: nullable({
          type: "string",
          description: "One South Australian suburb name in upper case, or null.",
        }),
        council: nullable({
          type: "string",
          description: "A council name copied exactly from the list, or null.",
        }),
        remoteness_area: nullable({ type: "string", enum: [...RA_NAMES] }),
        seifa_decile: nullable({ type: "integer", description: "1 to 10, or null." }),
      },
    },
    coordinates: { type: "boolean" },
    output_format: { type: "string", enum: [...FORMATS] },
    rationale: {
      type: "string",
      description: "Why these settings fit the scenario, in at most 80 words.",
    },
    assumptions: { type: "array", items: { type: "string" } },
    unsupported: {
      type: "array",
      items: { type: "string" },
      description: "Requirements in the scenario this generator cannot meet.",
    },
  },
};

/** The generator settings the proposal can change. */
export interface GeneratorSettings {
  count: number;
  seed: number;
  mode: WeightMode;
  weights: Weights;
  filters: Filters;
  coordinates: boolean;
  format: OutputFormat;
}

/** What the model may choose from (the suburb list is used locally, never sent). */
export interface ScenarioCatalogue {
  councils: { name: string; count: number }[];
  suburbs: string[];
  raCounts: number[];
  decileCounts: number[];
  noDecile: number;
  total: number;
}

export function buildSystemPrompt(catalogue: ScenarioCatalogue): string {
  const areas = RA_NAMES.map((n, i) => `- ${n}: ${catalogue.raCounts[i]} suburbs`).join(
    "\n",
  );
  const councils = catalogue.councils.map((c) => c.name).join("; ");
  const modes = WEIGHT_MODES.map((m) => `- ${m.value}: ${m.hint}`).join("\n");
  return [
    "You configure a mock address generator for software testing. It produces synthetic South Australian addresses (a random street number and one of 49 street names in a real suburb), each stamped MOCK. Your only output is a proposed configuration that a person will review before applying it.",
    "",
    "The generator:",
    `- count: 1 to ${MAX_COUNT} addresses per run.`,
    "- seed: whole number 0 to 4294967295; the same seed and settings give the same output.",
    "- mode (how suburbs are drawn):",
    modes,
    `- remoteness weights (remoteness and stratified modes): five numbers in this order; config.py defaults ${configRemotenessWeights().join(", ")}.`,
    `- decile weights (seifa mode): ten numbers for IRSAD deciles 1 to 10; defaults ${configDecileWeights()
      .map((w) => Number(w.toFixed(4)))
      .join(", ")}.`,
    "- filters, combined with AND: one suburb, one council, one remoteness area, one SEIFA decile (1 = most disadvantaged, 10 = most advantaged, ranked within South Australia).",
    "- coordinates: a random point inside the suburb boundary.",
    "- output_format: text, json or csv.",
    "",
    `Remoteness areas (${catalogue.total} suburbs in total):`,
    areas,
    "",
    `Councils (copy names exactly): ${councils}`,
    "",
    "Rules:",
    "- Propose the smallest set of changes that meets the scenario; keep a current setting when the scenario does not mention it.",
    "- Use a filter only when the scenario restricts the data to that place or group. Name a suburb only if you are confident it is a real South Australian suburb; otherwise use null and say so in assumptions.",
    "- Prefer the stratified mode when the scenario needs every remoteness area represented or exact counts per area; weighted modes when it wants a realistic random mix; population when it wants addresses where people live.",
    "- List in unsupported anything this generator cannot do (for example unit or lot numbers, PO boxes, real or verified addresses, other states, specific streets, people's names or any personal information). Never invent a capability.",
    "- The data are synthetic test data: never suggest using them for mail, identity checks, or to represent real people.",
    "- Plain Australian English. rationale: at most 80 words. assumptions and unsupported: short items, at most four each.",
  ].join("\n");
}

function describeFilters(f: Filters) {
  return {
    suburb: f.suburb ?? null,
    council: f.council ?? null,
    remoteness_area: f.ra === null || f.ra === undefined ? null : RA_NAMES[f.ra],
    seifa_decile: f.decile ?? null,
  };
}

/** The user message: the scenario and the current settings, as JSON. */
export function buildUserMessage(scenario: string, current: GeneratorSettings): string {
  return JSON.stringify(
    {
      scenario: scenario.trim(),
      current_settings: {
        count: current.count,
        seed: current.seed,
        mode: current.mode,
        remoteness_weights: current.weights.remoteness,
        decile_weights: current.weights.decile.map((w) => Number(w.toFixed(4))),
        filters: describeFilters(current.filters),
        coordinates: current.coordinates,
        output_format: current.format,
      },
    },
    null,
    2,
  );
}

/* ---------------------------------------------------------------------------
 * Review: validate against the reference table and diff with the current settings
 * ------------------------------------------------------------------------- */

export type FieldKey =
  | "count"
  | "seed"
  | "mode"
  | "remoteness_weights"
  | "decile_weights"
  | "suburb"
  | "council"
  | "remoteness_area"
  | "seifa_decile"
  | "coordinates"
  | "output_format";

export interface ReviewedField {
  key: FieldKey;
  label: string;
  current: string;
  proposed: string;
  /** False when the proposal equals the current value. */
  changed: boolean;
  /** False when the proposed value failed a check; it cannot be applied. */
  valid: boolean;
  /** Ticked by default: changed, valid and relevant. */
  recommended: boolean;
  note?: string;
}

/** The proposal's values after checks, ready to apply. */
export interface NormalisedProposal {
  count: number;
  seed: number | null;
  mode: WeightMode;
  remoteness: number[] | null;
  decile: number[] | null;
  filters: Filters;
  coordinates: boolean;
  format: OutputFormat;
}

export interface Review {
  fields: ReviewedField[];
  normalised: NormalisedProposal;
  /** Machine-readable outcome of the checks, stored in the audit log. */
  checks: {
    invalid_fields: FieldKey[];
    unknown_suburb: string | null;
    unknown_council: string | null;
    clamped_count: boolean;
  };
}

const MODE_LABEL = Object.fromEntries(
  WEIGHT_MODES.map((m) => [m.value, m.label]),
) as Record<WeightMode, string>;

const pctList = (w: readonly number[]) => {
  const total = w.reduce((a, b) => a + Math.max(0, b), 0) || 1;
  return w.map((v) => `${Math.round((Math.max(0, v) / total) * 1000) / 10}%`).join(" / ");
};

const sameList = (a: readonly number[], b: readonly number[]) =>
  a.length === b.length && a.every((v, i) => Math.abs(v - b[i]) < 1e-9);

function validWeights(w: number[] | null, length: number): w is number[] {
  return (
    w !== null &&
    w.length === length &&
    w.every((v) => Number.isFinite(v) && v >= 0) &&
    w.some((v) => v > 0)
  );
}

export function reviewProposal(
  proposal: Proposal,
  current: GeneratorSettings,
  catalogue: ScenarioCatalogue,
): Review {
  const fields: ReviewedField[] = [];
  const invalid: FieldKey[] = [];
  const push = (f: Omit<ReviewedField, "recommended"> & { recommended?: boolean }) => {
    if (!f.valid) invalid.push(f.key);
    fields.push({ ...f, recommended: f.recommended ?? (f.changed && f.valid) });
  };

  // count: clamp to the generator's range rather than reject
  const rawCount = Math.round(proposal.count);
  const count = Math.min(
    MAX_COUNT,
    Math.max(1, Number.isFinite(rawCount) ? rawCount : 1),
  );
  const clamped = count !== proposal.count;
  push({
    key: "count",
    label: "How many",
    current: current.count.toLocaleString("en-AU"),
    proposed: count.toLocaleString("en-AU"),
    changed: count !== current.count,
    valid: Number.isFinite(proposal.count),
    note: clamped
      ? `The proposal asked for ${proposal.count.toLocaleString("en-AU")}; one run makes 1 to ${MAX_COUNT.toLocaleString("en-AU")}.`
      : undefined,
  });

  const seedOk =
    proposal.seed === null ||
    (Number.isInteger(proposal.seed) &&
      proposal.seed >= 0 &&
      proposal.seed <= 0xffffffff);
  push({
    key: "seed",
    label: "Seed",
    current: String(current.seed),
    proposed: proposal.seed === null ? `${current.seed} (kept)` : String(proposal.seed),
    changed: proposal.seed !== null && proposal.seed !== current.seed,
    valid: seedOk,
    note: seedOk ? undefined : "Seeds are whole numbers from 0 to 4,294,967,295.",
  });

  push({
    key: "mode",
    label: "Weighting",
    current: MODE_LABEL[current.mode],
    proposed: MODE_LABEL[proposal.mode],
    changed: proposal.mode !== current.mode,
    valid: true,
  });

  const usesRemoteness = proposal.mode === "remoteness" || proposal.mode === "stratified";
  if (proposal.remoteness_weights !== null) {
    const ok = validWeights(proposal.remoteness_weights, 5);
    push({
      key: "remoteness_weights",
      label: proposal.mode === "stratified" ? "Quota shares" : "Remoteness weights",
      current: pctList(current.weights.remoteness),
      proposed: ok
        ? pctList(proposal.remoteness_weights)
        : proposal.remoteness_weights.join(", "),
      changed: !ok || !sameList(proposal.remoteness_weights, current.weights.remoteness),
      valid: ok,
      recommended:
        ok &&
        usesRemoteness &&
        !sameList(proposal.remoteness_weights, current.weights.remoteness),
      note: !ok
        ? "Needs five non-negative numbers, not all zero."
        : usesRemoteness
          ? undefined
          : "Only used by the remoteness and stratified modes.",
    });
  }
  if (proposal.decile_weights !== null) {
    const ok = validWeights(proposal.decile_weights, 10);
    push({
      key: "decile_weights",
      label: "Decile weights",
      current: pctList(current.weights.decile),
      proposed: ok
        ? pctList(proposal.decile_weights)
        : proposal.decile_weights.join(", "),
      changed: !ok || !sameList(proposal.decile_weights, current.weights.decile),
      valid: ok,
      recommended:
        ok &&
        proposal.mode === "seifa" &&
        !sameList(proposal.decile_weights, current.weights.decile),
      note: !ok
        ? "Needs ten non-negative numbers, not all zero."
        : proposal.mode === "seifa"
          ? undefined
          : "Only used by the SEIFA mode.",
    });
  }

  // filters: names must exist in the reference table
  const f = proposal.filters;
  const suburbName = f.suburb?.trim().toUpperCase() || null;
  const suburbKnown = suburbName === null || catalogue.suburbs.includes(suburbName);
  push({
    key: "suburb",
    label: "Suburb filter",
    current: current.filters.suburb ?? "Any",
    proposed: suburbName ?? "Any",
    changed: suburbName !== (current.filters.suburb ?? null),
    valid: suburbKnown,
    note: suburbKnown
      ? undefined
      : `${suburbName} is not a suburb in the ABS 2021 table.`,
  });
  const councilQuery = f.council?.trim() || null;
  const council =
    councilQuery === null
      ? null
      : (catalogue.councils.find(
          (c) => c.name.toLowerCase() === councilQuery.toLowerCase(),
        )?.name ?? undefined);
  push({
    key: "council",
    label: "Council filter",
    current: current.filters.council ?? "Any",
    proposed: council === undefined ? (councilQuery ?? "Any") : (council ?? "Any"),
    changed: council === undefined || council !== (current.filters.council ?? null),
    valid: council !== undefined,
    note:
      council === undefined
        ? `${councilQuery} is not one of the 71 councils.`
        : undefined,
  });
  const ra = f.remoteness_area === null ? null : RA_NAMES.indexOf(f.remoteness_area);
  push({
    key: "remoteness_area",
    label: "Remoteness filter",
    current:
      current.filters.ra === null || current.filters.ra === undefined
        ? "Any"
        : RA_SHORT[current.filters.ra],
    proposed: ra === null ? "Any" : RA_SHORT[ra],
    changed: ra !== (current.filters.ra ?? null),
    valid: true,
  });
  const decileOk =
    f.seifa_decile === null ||
    (Number.isInteger(f.seifa_decile) && f.seifa_decile >= 1 && f.seifa_decile <= 10);
  push({
    key: "seifa_decile",
    label: "SEIFA decile filter",
    current: current.filters.decile ? String(current.filters.decile) : "Any",
    proposed: f.seifa_decile === null ? "Any" : String(f.seifa_decile),
    changed: f.seifa_decile !== (current.filters.decile ?? null),
    valid: decileOk,
    note: decileOk ? undefined : "Deciles run from 1 to 10.",
  });

  push({
    key: "coordinates",
    label: "Coordinates",
    current: current.coordinates ? "On" : "Off",
    proposed: proposal.coordinates ? "On" : "Off",
    changed: proposal.coordinates !== current.coordinates,
    valid: true,
  });
  push({
    key: "output_format",
    label: "Output format",
    current: current.format.toUpperCase(),
    proposed: proposal.output_format.toUpperCase(),
    changed: proposal.output_format !== current.format,
    valid: true,
  });

  return {
    fields,
    normalised: {
      count,
      seed: seedOk ? proposal.seed : null,
      mode: proposal.mode,
      remoteness: validWeights(proposal.remoteness_weights, 5)
        ? proposal.remoteness_weights
        : null,
      decile: validWeights(proposal.decile_weights, 10) ? proposal.decile_weights : null,
      filters: {
        suburb: suburbKnown ? suburbName : null,
        council: council ?? null,
        ra,
        decile: decileOk ? f.seifa_decile : null,
      },
      coordinates: proposal.coordinates,
      format: proposal.output_format,
    },
    checks: {
      invalid_fields: invalid,
      unknown_suburb: suburbKnown ? null : suburbName,
      unknown_council: council === undefined ? councilQuery : null,
      clamped_count: clamped,
    },
  };
}

/** Apply the selected (valid) fields of a reviewed proposal to the settings. */
export function applyFields(
  current: GeneratorSettings,
  review: Review,
  selected: ReadonlySet<FieldKey>,
): GeneratorSettings {
  const n = review.normalised;
  const valid = new Set(review.fields.filter((f) => f.valid).map((f) => f.key));
  const take = (k: FieldKey) => selected.has(k) && valid.has(k);
  return {
    count: take("count") ? n.count : current.count,
    seed: take("seed") && n.seed !== null ? n.seed : current.seed,
    mode: take("mode") ? n.mode : current.mode,
    weights: {
      remoteness:
        take("remoteness_weights") && n.remoteness
          ? n.remoteness
          : current.weights.remoteness,
      decile: take("decile_weights") && n.decile ? n.decile : current.weights.decile,
    },
    filters: {
      suburb: take("suburb") ? n.filters.suburb : (current.filters.suburb ?? null),
      council: take("council") ? n.filters.council : (current.filters.council ?? null),
      ra: take("remoteness_area") ? n.filters.ra : (current.filters.ra ?? null),
      decile: take("seifa_decile") ? n.filters.decile : (current.filters.decile ?? null),
    },
    coordinates: take("coordinates") ? n.coordinates : current.coordinates,
    format: take("output_format") ? n.format : current.format,
  };
}

/**
 * The human decision for the audit log: "accepted" when every recommended
 * change was applied as proposed, "edited" when the visitor changed the
 * selection, "rejected" when nothing was applied.
 */
export function decisionFor(
  review: Review,
  selected: ReadonlySet<FieldKey>,
): "accepted" | "edited" | "rejected" {
  const applied = review.fields.filter(
    (f) => f.valid && f.changed && selected.has(f.key),
  );
  const recommended = review.fields.filter((f) => f.recommended).map((f) => f.key);
  // A proposal that changes nothing, applied as is, is agreement.
  if (applied.length === 0) return recommended.length === 0 ? "accepted" : "rejected";
  const same =
    recommended.length === applied.length && recommended.every((k) => selected.has(k));
  return same ? "accepted" : "edited";
}
