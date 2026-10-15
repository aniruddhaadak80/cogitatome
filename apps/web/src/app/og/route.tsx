import { ImageResponse } from "next/og";

/**
 * Dynamic social cards. The card is drawn from the same palette as the product,
 * so a shared link looks like the product.
 */
export const runtime = "edge";

export const alt = "cogitatome — an interpretability observatory and alignment laboratory";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export function GET(request: Request): ImageResponse {
  const { searchParams } = new URL(request.url);
  const title = (searchParams.get("title") ?? "Open the brain. Read the circuit.").slice(0, 80);
  const kind = (searchParams.get("kind") ?? "interpretability observatory").slice(0, 40);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          backgroundColor: "#05070f",
          backgroundImage:
            "radial-gradient(circle at 82% 18%, rgba(94,241,255,0.18), transparent 45%), radial-gradient(circle at 12% 88%, rgba(167,139,250,0.14), transparent 42%)",
          color: "#f4f6fb",
          padding: "72px",
          fontFamily: "sans-serif"
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 16, fontSize: 28, letterSpacing: 2 }}>
          <div style={{ width: 26, height: 26, background: "#5ef1ff", borderRadius: 4 }} />
          <span>COGITATOME</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <div style={{ fontSize: 78, fontWeight: 700, lineHeight: 1.05, maxWidth: 900 }}>{title}</div>
          <div style={{ fontSize: 30, color: "#8b93b0" }}>{kind}</div>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 24, color: "#5ef1ff" }}>
          <span>deterministic · offline · zero api keys</span>
          <span style={{ color: "#8b93b0" }}>github.com/aniruddhaadak80/cogitatome</span>
        </div>
      </div>
    ),
    size
  );
}
