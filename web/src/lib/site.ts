export const site = {
  name: "SA Mock Address Lab",
  shortName: "Mock Address Lab",
  description:
    "Generate mock South Australian addresses for testing, weighted by remoteness, SEIFA or population, with coordinates sampled inside ABS suburb boundaries. A 2026 revival of a 2025 Python tool.",
  repo: "https://github.com/rNLKJA/SA-Mock-Address-Generator",
  author: "Sunchuangyu (Rin) Huang",
  authorUrl: "https://github.com/rNLKJA",
} as const;

export const nav = [
  { href: "/generate", label: "Generate" },
  { href: "/verify", label: "Verify" },
  { href: "/sampling", label: "Sampling" },
  { href: "/map", label: "Map" },
  { href: "/lookup", label: "Lookup" },
  { href: "/replay", label: "2025 replay" },
  { href: "/data", label: "Data" },
  { href: "/methods", label: "Methods" },
  { href: "/tour", label: "Tour" },
] as const;
