import { ImageResponse } from "next/og";

export const alt =
  "SA Mock Address Lab: mock South Australian addresses, with the receipts";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const grid =
  "linear-gradient(rgba(31,78,140,0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(31,78,140,0.08) 1px, transparent 1px)";

export default function OpengraphImage() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: 72,
        background: "#f6f1e4",
        backgroundImage: grid,
        backgroundSize: "32px 32px",
        color: "#1c2630",
        fontFamily: "serif",
      }}
    >
      <div
        style={{
          display: "flex",
          fontSize: 26,
          letterSpacing: 6,
          color: "#5a6068",
          fontFamily: "monospace",
        }}
      >
        SA MOCK ADDRESS LAB
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ fontSize: 74, fontWeight: 700, lineHeight: 1.05 }}>
          Mock South Australian addresses,
        </div>
        <div
          style={{
            fontSize: 74,
            fontWeight: 700,
            lineHeight: 1.05,
            color: "#b8292f",
            fontStyle: "italic",
          }}
        >
          with the receipts.
        </div>
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 24,
          padding: "22px 28px",
          border: "2px dashed #c9bea4",
          borderRadius: 12,
          background: "#fbf8ef",
          fontFamily: "monospace",
          fontSize: 32,
        }}
      >
        <span>385 Unley Road, HOPE VALLEY SA 5090</span>
        <span
          style={{
            display: "flex",
            color: "#b8292f",
            border: "3px solid #b8292f",
            borderRadius: 6,
            padding: "2px 12px",
            fontSize: 24,
            letterSpacing: 4,
            transform: "rotate(-3deg)",
          }}
        >
          MOCK
        </span>
      </div>
    </div>,
    size,
  );
}
