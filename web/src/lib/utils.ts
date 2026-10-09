export { cn } from "cn";

const intFormat = new Intl.NumberFormat("en-AU");
const pctFormat = new Intl.NumberFormat("en-AU", {
  style: "percent",
  maximumFractionDigits: 1,
});

export const formatInt = (n: number) => intFormat.format(n);
export const formatPct = (p: number) => pctFormat.format(p);

/** Percent with a fixed number of decimals, e.g. formatPctFixed(0.0123, 2) = "1.23%". */
export const formatPctFixed = (p: number, digits = 1) => `${(p * 100).toFixed(digits)}%`;

/** "p < 0.001" or "p = 0.44" (two significant figures). */
export function formatP(p: number): string {
  if (p < 0.001) return "p < 0.001";
  return `p = ${p.toPrecision(2)}`;
}
