export { cn } from "cn";

const intFormat = new Intl.NumberFormat("en-AU");
const pctFormat = new Intl.NumberFormat("en-AU", {
  style: "percent",
  maximumFractionDigits: 1,
});

export const formatInt = (n: number) => intFormat.format(n);
export const formatPct = (p: number) => pctFormat.format(p);
