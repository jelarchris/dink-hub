import { ImageResponse } from "next/og";
import { z } from "zod";
import { captureException } from "@/lib/observability";

/**
 * Public OG image route for DinkHub social-media slides.
 *
 * GET /api/og/social/<slide>?format=square|portrait|fb
 *
 * Renders evergreen marketing slides (no DB lookup). One PNG per slide,
 * matching the brand: deep forest background + neon emerald accent +
 * white headlines + corner-bracketed cards.
 *
 * Slide IDs:
 *   1 hero          5 open-play       9  trust
 *   2 loop          6 vs-messenger    10 closer
 *   3 book          7 owners
 *   4 flow          8 auto-move
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FORMATS = {
  square: { width: 1080, height: 1080 },
  portrait: { width: 1080, height: 1350 },
  fb: { width: 1200, height: 630 },
} as const;

type Format = keyof typeof FORMATS;

const SLIDE_IDS = [
  "1",
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
  "10",
] as const;

const querySchema = z.object({
  format: z.enum(["square", "portrait", "fb"]).default("square"),
});

const paramsSchema = z.object({
  slide: z.enum(SLIDE_IDS),
});

// Palette — inline hex only (Satori can't resolve CSS vars).
const C = {
  bg: "#062018",
  bgCard: "#0E2A22",
  bgCardEdge: "#13362C",
  accent: "#34D399",
  accentDim: "#1F8765",
  ink: "#FFFFFF",
  inkMuted: "#9AB3A8",
  inkSubtle: "#6B847A",
  border: "#1F4538",
  badgeBg: "#0E3A2C",
  pillBg: "#34D399",
  pillInk: "#062018",
};

// Satori only supports TTF/OTF. The Wget UA trick on Google Fonts CSS forces
// a TTF src.
async function fetchGoogleFontTtf(family: string, weight: 400 | 700 | 900): Promise<ArrayBuffer> {
  const cssUrl = `https://fonts.googleapis.com/css?family=${encodeURIComponent(family)}:${weight}`;
  const cssRes = await fetch(cssUrl, {
    headers: { "User-Agent": "Wget/1.20.3 (linux-gnu)" },
    cache: "force-cache",
  });
  if (!cssRes.ok) throw new Error(`Font CSS fetch failed (${cssRes.status})`);
  const css = await cssRes.text();
  const match = /src:\s*url\((https:\/\/[^)]+\.ttf)\)/.exec(css);
  if (!match?.[1]) throw new Error(`No TTF URL found in CSS for ${family} ${weight}`);
  const fontRes = await fetch(match[1], { cache: "force-cache" });
  if (!fontRes.ok) throw new Error(`Font TTF fetch failed (${fontRes.status})`);
  return fontRes.arrayBuffer();
}

async function loadFonts(): Promise<Array<{ name: string; data: ArrayBuffer; weight: 400 | 700 | 900; style: "normal" }>> {
  const [r400, r700, r900] = await Promise.all([
    fetchGoogleFontTtf("Inter", 400),
    fetchGoogleFontTtf("Inter", 700),
    fetchGoogleFontTtf("Inter", 900),
  ]);
  return [
    { name: "Inter", data: r400, weight: 400, style: "normal" },
    { name: "Inter", data: r700, weight: 700, style: "normal" },
    { name: "Inter", data: r900, weight: 900, style: "normal" },
  ];
}

// ──────────────────────────────────────────────────────────────────────
// Shared atoms
// ──────────────────────────────────────────────────────────────────────

function Logo() {
  return (
    <div style={{ display: "flex", alignItems: "center" }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: 56,
          height: 56,
          borderRadius: 14,
          backgroundColor: C.accent,
          color: C.bg,
          fontSize: 36,
          fontWeight: 900,
          marginRight: 14,
        }}
      >
        D
      </div>
      <div
        style={{
          display: "flex",
          color: C.ink,
          fontSize: 32,
          fontWeight: 900,
          letterSpacing: -0.5,
        }}
      >
        dinkhub
      </div>
    </div>
  );
}

function Eyebrow({ text }: { text: string }) {
  return (
    <div
      style={{
        display: "flex",
        color: C.accent,
        fontSize: 22,
        fontWeight: 700,
        letterSpacing: 6,
        textTransform: "uppercase",
        marginBottom: 18,
      }}
    >
      {text}
    </div>
  );
}

function Headline({ lines, sizes }: { lines: Array<{ text: string; accent?: boolean }>; sizes?: { fontSize?: number; lineHeight?: number } }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        fontSize: sizes?.fontSize ?? 96,
        lineHeight: sizes?.lineHeight ?? 1.02,
        fontWeight: 900,
        letterSpacing: -2,
        textTransform: "uppercase",
        marginBottom: 24,
      }}
    >
      {lines.map((l, i) => (
        <div key={i} style={{ display: "flex", color: l.accent ? C.accent : C.ink }}>
          {l.text}
        </div>
      ))}
    </div>
  );
}

function SubCopy({ text, maxWidth }: { text: string; maxWidth?: number }) {
  return (
    <div
      style={{
        display: "flex",
        color: C.inkMuted,
        fontSize: 28,
        lineHeight: 1.42,
        fontWeight: 400,
        maxWidth: maxWidth ?? 760,
        marginBottom: 28,
      }}
    >
      {text}
    </div>
  );
}

function Check({ text }: { text: string }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", marginBottom: 14 }}>
      <div
        style={{
          display: "flex",
          color: C.accent,
          fontSize: 26,
          fontWeight: 900,
          marginRight: 14,
          lineHeight: 1,
        }}
      >
        ✓
      </div>
      <div style={{ display: "flex", color: C.ink, fontSize: 26, fontWeight: 400, lineHeight: 1.35 }}>{text}</div>
    </div>
  );
}

function Pill({ children }: { children: string }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: C.pillBg,
        color: C.pillInk,
        fontSize: 28,
        fontWeight: 900,
        letterSpacing: 0.5,
        padding: "20px 36px",
        borderRadius: 999,
        textTransform: "uppercase",
      }}
    >
      {children}
    </div>
  );
}

function GhostPill({ children }: { children: string }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "transparent",
        color: C.ink,
        fontSize: 26,
        fontWeight: 700,
        letterSpacing: 0.5,
        padding: "18px 32px",
        borderRadius: 999,
        border: `2px solid ${C.border}`,
        textTransform: "uppercase",
      }}
    >
      {children}
    </div>
  );
}

function Bracket({ corner }: { corner: "tl" | "tr" | "bl" | "br" }) {
  const size = 22;
  const thickness = 3;
  const offset = 14;
  const base: Record<string, string | number> = {
    position: "absolute",
    width: size,
    height: size,
    borderColor: C.accent,
    borderStyle: "solid",
    borderTopWidth: 0,
    borderRightWidth: 0,
    borderBottomWidth: 0,
    borderLeftWidth: 0,
  };
  if (corner === "tl") {
    base.top = offset;
    base.left = offset;
    base.borderTopWidth = thickness;
    base.borderLeftWidth = thickness;
  } else if (corner === "tr") {
    base.top = offset;
    base.right = offset;
    base.borderTopWidth = thickness;
    base.borderRightWidth = thickness;
  } else if (corner === "bl") {
    base.bottom = offset;
    base.left = offset;
    base.borderBottomWidth = thickness;
    base.borderLeftWidth = thickness;
  } else {
    base.bottom = offset;
    base.right = offset;
    base.borderBottomWidth = thickness;
    base.borderRightWidth = thickness;
  }
  return <div style={base} />;
}

function Card({
  children,
  width,
  height,
  marginRight,
  marginBottom,
}: {
  children: React.ReactNode;
  width: number;
  height: number;
  marginRight?: number;
  marginBottom?: number;
}) {
  return (
    <div
      style={{
        position: "relative",
        display: "flex",
        flexDirection: "column",
        width,
        height,
        padding: 32,
        backgroundColor: C.bgCard,
        border: `1px solid ${C.border}`,
        borderRadius: 18,
        marginRight: marginRight ?? 0,
        marginBottom: marginBottom ?? 0,
      }}
    >
      <Bracket corner="tl" />
      <Bracket corner="tr" />
      <Bracket corner="bl" />
      <Bracket corner="br" />
      {children}
    </div>
  );
}

function FeatureCard({ title, body, width, height, marginRight, marginBottom, icon }: {
  title: string;
  body: string;
  width: number;
  height: number;
  marginRight?: number;
  marginBottom?: number;
  icon: string;
}) {
  return (
    <Card width={width} height={height} {...(marginRight !== undefined ? { marginRight } : {})} {...(marginBottom !== undefined ? { marginBottom } : {})}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: 56,
          height: 56,
          borderRadius: 14,
          backgroundColor: C.badgeBg,
          color: C.accent,
          fontSize: 30,
          fontWeight: 900,
          marginBottom: 16,
        }}
      >
        {icon}
      </div>
      <div style={{ display: "flex", color: C.ink, fontSize: 26, fontWeight: 900, marginBottom: 10, textTransform: "uppercase", letterSpacing: 0.5 }}>{title}</div>
      <div style={{ display: "flex", color: C.inkMuted, fontSize: 21, fontWeight: 400, lineHeight: 1.4 }}>{body}</div>
    </Card>
  );
}

// Wrapper for the whole slide — sets background and provides a top bar.
function Frame({ width, height, children }: { width: number; height: number; children: React.ReactNode }) {
  return (
    <div
      style={{
        position: "relative",
        display: "flex",
        flexDirection: "column",
        width,
        height,
        backgroundColor: C.bg,
        backgroundImage: `radial-gradient(circle at 20% 0%, ${C.accentDim}26 0%, transparent 55%), radial-gradient(circle at 100% 100%, ${C.accentDim}1A 0%, transparent 50%)`,
        padding: 56,
      }}
    >
      <div style={{ display: "flex", marginBottom: 36 }}>
        <Logo />
      </div>
      {children}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────
// Slide-specific mock UIs
// ──────────────────────────────────────────────────────────────────────

function VenueCardMock() {
  return (
    <div
      style={{
        position: "relative",
        display: "flex",
        flexDirection: "column",
        width: 380,
        backgroundColor: C.bgCard,
        border: `1px solid ${C.border}`,
        borderRadius: 22,
        padding: 28,
      }}
    >
      <Bracket corner="tl" />
      <Bracket corner="tr" />
      <Bracket corner="bl" />
      <Bracket corner="br" />
      <div style={{ display: "flex", color: C.accent, fontSize: 18, fontWeight: 700, letterSpacing: 3, textTransform: "uppercase", marginBottom: 10 }}>Featured venue</div>
      <div style={{ display: "flex", color: C.ink, fontSize: 32, fontWeight: 900, marginBottom: 6 }}>Bayugan Pickleball</div>
      <div style={{ display: "flex", color: C.inkMuted, fontSize: 20, marginBottom: 18 }}>★ 4.9 · 2 courts · Open today</div>
      <div style={{ display: "flex", flexDirection: "column", marginBottom: 18 }}>
        <div style={{ display: "flex", justifyContent: "space-between", color: C.inkMuted, fontSize: 18, marginBottom: 6 }}>
          <div style={{ display: "flex" }}>5 PM</div>
          <div style={{ display: "flex", color: C.accent, fontWeight: 700 }}>OPEN</div>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", color: C.inkMuted, fontSize: 18, marginBottom: 6 }}>
          <div style={{ display: "flex" }}>6 PM</div>
          <div style={{ display: "flex", color: C.accent, fontWeight: 700 }}>OPEN</div>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", color: C.inkMuted, fontSize: 18 }}>
          <div style={{ display: "flex" }}>7 PM</div>
          <div style={{ display: "flex", color: C.inkSubtle }}>BOOKED</div>
        </div>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: 18, borderTop: `1px solid ${C.border}` }}>
        <div style={{ display: "flex", color: C.ink, fontSize: 28, fontWeight: 900 }}>PHP 300/hr</div>
        <div
          style={{
            display: "flex",
            backgroundColor: C.accent,
            color: C.bg,
            fontSize: 18,
            fontWeight: 900,
            padding: "10px 18px",
            borderRadius: 999,
            letterSpacing: 0.5,
            textTransform: "uppercase",
          }}
        >
          Book
        </div>
      </div>
    </div>
  );
}

function SlotGridMock() {
  // 3 cols × 5 rows of slot cells
  const rows: Array<Array<{ label: string; state: "open" | "booked" | "selected" }>> = [
    [
      { label: "BOOKED", state: "booked" },
      { label: "SELECTED", state: "selected" },
      { label: "OPEN", state: "open" },
    ],
    [
      { label: "BOOKED", state: "booked" },
      { label: "SELECTED", state: "selected" },
      { label: "OPEN", state: "open" },
    ],
    [
      { label: "BOOKED", state: "booked" },
      { label: "BOOKED", state: "booked" },
      { label: "OPEN", state: "open" },
    ],
    [
      { label: "OPEN", state: "open" },
      { label: "OPEN", state: "open" },
      { label: "OPEN", state: "open" },
    ],
  ];
  const times = ["5 PM", "6 PM", "7 PM", "8 PM"];
  return (
    <div
      style={{
        position: "relative",
        display: "flex",
        flexDirection: "column",
        width: 460,
        backgroundColor: C.bgCard,
        border: `1px solid ${C.border}`,
        borderRadius: 22,
        padding: 28,
      }}
    >
      <Bracket corner="tl" />
      <Bracket corner="tr" />
      <Bracket corner="bl" />
      <Bracket corner="br" />
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 18 }}>
        <div style={{ display: "flex", color: C.accent, fontSize: 18, fontWeight: 700, letterSpacing: 3, textTransform: "uppercase" }}>Date</div>
        <div style={{ display: "flex", color: C.accent, fontSize: 18, fontWeight: 700, letterSpacing: 3, textTransform: "uppercase" }}>Rates</div>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 22 }}>
        <div style={{ display: "flex", color: C.ink, fontSize: 22, fontWeight: 900 }}>SAT · MAY 23</div>
        <div style={{ display: "flex", color: C.inkMuted, fontSize: 20 }}>PHP 300/hr</div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", marginBottom: 18 }}>
        {rows.map((row, ri) => (
          <div key={ri} style={{ display: "flex", marginBottom: 10 }}>
            <div style={{ display: "flex", alignItems: "center", width: 80, color: C.inkMuted, fontSize: 20, fontWeight: 700 }}>{times[ri]}</div>
            {row.map((cell, ci) => {
              const bg = cell.state === "selected" ? C.accent : cell.state === "booked" ? "#0A2017" : C.bgCardEdge;
              const fg = cell.state === "selected" ? C.bg : cell.state === "booked" ? C.inkSubtle : C.ink;
              return (
                <div
                  key={ci}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    width: 108,
                    height: 46,
                    borderRadius: 10,
                    backgroundColor: bg,
                    color: fg,
                    fontSize: 15,
                    fontWeight: 900,
                    letterSpacing: 1,
                    marginRight: ci < row.length - 1 ? 8 : 0,
                  }}
                >
                  {cell.label}
                </div>
              );
            })}
          </div>
        ))}
      </div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "16px 18px",
          backgroundColor: "#0A2017",
          borderRadius: 12,
          border: `2px solid ${C.accent}`,
        }}
      >
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", color: C.accent, fontSize: 14, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase", marginBottom: 4 }}>2 hrs · 5–7 PM</div>
          <div style={{ display: "flex", color: C.ink, fontSize: 18, fontWeight: 700 }}>Court 1</div>
        </div>
        <div style={{ display: "flex", color: C.ink, fontSize: 30, fontWeight: 900 }}>PHP 600</div>
      </div>
    </div>
  );
}

function OpenPlayCardMock() {
  return (
    <div
      style={{
        position: "relative",
        display: "flex",
        flexDirection: "column",
        width: 380,
        backgroundColor: C.bgCard,
        border: `1px solid ${C.border}`,
        borderRadius: 22,
        padding: 28,
      }}
    >
      <Bracket corner="tl" />
      <Bracket corner="tr" />
      <Bracket corner="bl" />
      <Bracket corner="br" />
      <div style={{ display: "flex", alignItems: "center", marginBottom: 18 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: C.badgeBg,
            color: C.accent,
            fontSize: 14,
            fontWeight: 900,
            letterSpacing: 2,
            padding: "6px 12px",
            borderRadius: 999,
            marginRight: 10,
          }}
        >
          ● LIVE
        </div>
        <div style={{ display: "flex", color: C.inkMuted, fontSize: 16, fontWeight: 700, letterSpacing: 2 }}>ALL LEVELS</div>
      </div>
      <div style={{ display: "flex", color: C.ink, fontSize: 30, fontWeight: 900, marginBottom: 8 }}>Sunday Open Play</div>
      <div style={{ display: "flex", color: C.inkMuted, fontSize: 20, marginBottom: 6 }}>MAY 24 · 7–9 PM</div>
      <div style={{ display: "flex", color: C.inkMuted, fontSize: 18, marginBottom: 22 }}>Bayugan Pickleball</div>
      <div style={{ display: "flex", flexDirection: "column", marginBottom: 22 }}>
        <div style={{ display: "flex", justifyContent: "space-between", color: C.inkMuted, fontSize: 18, marginBottom: 6 }}>
          <div style={{ display: "flex" }}>8 / 16 SPOTS</div>
          <div style={{ display: "flex", color: C.accent, fontWeight: 700 }}>FILLING</div>
        </div>
        <div style={{ display: "flex", height: 8, backgroundColor: "#0A2017", borderRadius: 999 }}>
          <div style={{ display: "flex", width: 180, height: 8, backgroundColor: C.accent, borderRadius: 999 }} />
        </div>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: 18, borderTop: `1px solid ${C.border}` }}>
        <div style={{ display: "flex", color: C.ink, fontSize: 28, fontWeight: 900 }}>PHP 250</div>
        <div
          style={{
            display: "flex",
            backgroundColor: C.accent,
            color: C.bg,
            fontSize: 18,
            fontWeight: 900,
            padding: "10px 20px",
            borderRadius: 999,
            letterSpacing: 0.5,
            textTransform: "uppercase",
          }}
        >
          Sign up
        </div>
      </div>
    </div>
  );
}

function OwnerDashboardMock() {
  return (
    <div
      style={{
        position: "relative",
        display: "flex",
        flexDirection: "column",
        width: 460,
        backgroundColor: C.bgCard,
        border: `1px solid ${C.border}`,
        borderRadius: 22,
        padding: 28,
      }}
    >
      <Bracket corner="tl" />
      <Bracket corner="tr" />
      <Bracket corner="bl" />
      <Bracket corner="br" />
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 22 }}>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", color: C.ink, fontSize: 24, fontWeight: 900, marginBottom: 4 }}>BAYUGAN PICKLEBALL</div>
          <div style={{ display: "flex", color: C.accent, fontSize: 14, fontWeight: 700, letterSpacing: 2 }}>PARTNER PORTAL</div>
        </div>
        <div
          style={{
            display: "flex",
            backgroundColor: C.badgeBg,
            color: C.accent,
            fontSize: 14,
            fontWeight: 900,
            letterSpacing: 1.5,
            padding: "6px 12px",
            borderRadius: 999,
          }}
        >
          ● ACTIVE
        </div>
      </div>
      <div style={{ display: "flex", marginBottom: 22 }}>
        {[
          { label: "TODAY", value: "PHP 1,750" },
          { label: "BOOKINGS", value: "8" },
          { label: "RATED", value: "4.9★" },
        ].map((stat, i) => (
          <div
            key={i}
            style={{
              display: "flex",
              flexDirection: "column",
              flex: 1,
              padding: 14,
              backgroundColor: "#0A2017",
              borderRadius: 12,
              marginRight: i < 2 ? 10 : 0,
            }}
          >
            <div style={{ display: "flex", color: C.inkSubtle, fontSize: 12, fontWeight: 700, letterSpacing: 1.5, marginBottom: 6 }}>{stat.label}</div>
            <div style={{ display: "flex", color: C.ink, fontSize: 22, fontWeight: 900 }}>{stat.value}</div>
          </div>
        ))}
      </div>
      <div style={{ display: "flex", flexDirection: "column" }}>
        {[
          { initial: "M", name: "Miguel R.", meta: "COURT 1 · 7–9 PM", status: "CONFIRMED", color: C.accent },
          { initial: "S", name: "Sofia L.", meta: "COURT 2 · 6–8 PM", status: "RECEIPT", color: "#F59E0B" },
          { initial: "R", name: "Rafael D.", meta: "COURT 1 · 9–10 PM", status: "REVIEW", color: C.inkMuted },
        ].map((row, i) => (
          <div
            key={i}
            style={{
              display: "flex",
              alignItems: "center",
              padding: "12px 14px",
              backgroundColor: i % 2 === 0 ? "#0A2017" : "transparent",
              borderRadius: 10,
              marginBottom: 6,
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: 36,
                height: 36,
                borderRadius: 999,
                backgroundColor: C.badgeBg,
                color: C.accent,
                fontSize: 16,
                fontWeight: 900,
                marginRight: 12,
              }}
            >
              {row.initial}
            </div>
            <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
              <div style={{ display: "flex", color: C.ink, fontSize: 17, fontWeight: 700 }}>{row.name}</div>
              <div style={{ display: "flex", color: C.inkSubtle, fontSize: 13, letterSpacing: 1 }}>{row.meta}</div>
            </div>
            <div style={{ display: "flex", color: row.color, fontSize: 13, fontWeight: 900, letterSpacing: 1.5 }}>{row.status}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────
// Slide renderers
// ──────────────────────────────────────────────────────────────────────

function Slide1Hero({ w, h }: { w: number; h: number }) {
  return (
    <Frame width={w} height={h}>
      <div style={{ display: "flex", flex: 1, alignItems: "center" }}>
        <div style={{ display: "flex", flexDirection: "column", flex: 1, paddingRight: 32 }}>
          <Headline
            lines={[
              { text: "PICKLEBALL," },
              { text: "WITHOUT THE", accent: false },
              { text: "MESSENGER CHAOS.", accent: true },
            ]}
            sizes={{ fontSize: 82 }}
          />
          <SubCopy text="Find a court near you. Book online. Pay via GCash. Confirmed in minutes — built for Philippines pickleball." />
          <div style={{ display: "flex", marginTop: 12 }}>
            <div style={{ display: "flex", marginRight: 16 }}>
              <Pill>Find a court →</Pill>
            </div>
            <GhostPill>List your venue</GhostPill>
          </div>
          <div style={{ display: "flex", marginTop: 36, alignItems: "center" }}>
            <div style={{ display: "flex", width: 10, height: 10, borderRadius: 999, backgroundColor: C.accent, marginRight: 12 }} />
            <div style={{ display: "flex", color: C.inkMuted, fontSize: 18, fontWeight: 700, letterSpacing: 3, textTransform: "uppercase" }}>
              dinkhub.ph
            </div>
          </div>
        </div>
        <VenueCardMock />
      </div>
    </Frame>
  );
}

function Slide2Loop({ w, h }: { w: number; h: number }) {
  const cardW = 440;
  const cardH = 180;
  return (
    <Frame width={w} height={h}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flex: 1 }}>
        <Eyebrow text="The loop" />
        <Headline lines={[{ text: "ONE APP, BOOKING" }, { text: "TO PAYOUT.", accent: true }]} sizes={{ fontSize: 72 }} />
        <SubCopy text="Browse → book → pay via GCash → play. Owners track every booking from one dashboard." />
        <div style={{ display: "flex", marginBottom: 16 }}>
          <FeatureCard icon="📅" title="Live availability" body="Per-hour slots across every listed venue, in real time." width={cardW} height={cardH} marginRight={16} />
          <FeatureCard icon="💳" title="GCash payments" body="Upload receipt, auto-verified, court locked in minutes." width={cardW} height={cardH} />
        </div>
        <div style={{ display: "flex" }}>
          <FeatureCard icon="🎾" title="Open Play" body="Drop in, get paired, meet new players at any partner." width={cardW} height={cardH} marginRight={16} />
          <FeatureCard icon="🔄" title="Smart closures" body="Court closed? We auto-move bookings to a free court." width={cardW} height={cardH} />
        </div>
      </div>
    </Frame>
  );
}

function Slide3Book({ w, h }: { w: number; h: number }) {
  return (
    <Frame width={w} height={h}>
      <div style={{ display: "flex", flex: 1, alignItems: "center" }}>
        <div style={{ display: "flex", flexDirection: "column", flex: 1, paddingRight: 32 }}>
          <Eyebrow text="Book a court" />
          <Headline lines={[{ text: "YOUR NEXT" }, { text: "GAME," }, { text: "ONE TAP", accent: true }, { text: "AWAY.", accent: true }]} sizes={{ fontSize: 84 }} />
          <SubCopy text="Browse venues, pick your date, lock the hours you need. Pay via GCash. Confirmation in minutes." />
          <Check text="Live availability across every listed venue" />
          <Check text="1-hour slots, transparent per-court rates" />
          <Check text="Upload GCash receipt → auto-verified" />
          <Check text="Free reschedule if the venue closes" />
        </div>
        <SlotGridMock />
      </div>
    </Frame>
  );
}

function Slide4Flow({ w, h }: { w: number; h: number }) {
  return (
    <Frame width={w} height={h}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flex: 1 }}>
        <Eyebrow text="The flow" />
        <Headline lines={[{ text: "FROM TAP TO COURT." }, { text: "TWO MINUTES.", accent: true }]} sizes={{ fontSize: 70 }} />
        <SubCopy text="No phone calls. No waiting on a chat reply. No double-bookings." />
        <div style={{ display: "flex", marginBottom: 18 }}>
          <Card width={420} height={220} marginRight={18}>
            <div style={{ display: "flex", color: C.inkSubtle, fontSize: 18, fontWeight: 900, letterSpacing: 4, marginBottom: 16 }}>01</div>
            <div style={{ display: "flex", color: C.ink, fontSize: 28, fontWeight: 900, marginBottom: 12, textTransform: "uppercase" }}>Pick a slot</div>
            <div style={{ display: "flex", color: C.inkMuted, fontSize: 21, lineHeight: 1.4 }}>Hourly grid shows real-time availability. Choose 1–4 hours.</div>
          </Card>
          <Card width={420} height={220}>
            <div style={{ display: "flex", color: C.inkSubtle, fontSize: 18, fontWeight: 900, letterSpacing: 4, marginBottom: 16 }}>02</div>
            <div style={{ display: "flex", color: C.ink, fontSize: 28, fontWeight: 900, marginBottom: 12, textTransform: "uppercase" }}>Pay via GCash</div>
            <div style={{ display: "flex", color: C.inkMuted, fontSize: 21, lineHeight: 1.4 }}>One-tap transfer to the venue. Upload your receipt right after.</div>
          </Card>
        </div>
        <Card width={420} height={220}>
          <div style={{ display: "flex", color: C.inkSubtle, fontSize: 18, fontWeight: 900, letterSpacing: 4, marginBottom: 16 }}>03</div>
          <div style={{ display: "flex", color: C.ink, fontSize: 28, fontWeight: 900, marginBottom: 12, textTransform: "uppercase" }}>Play</div>
          <div style={{ display: "flex", color: C.inkMuted, fontSize: 21, lineHeight: 1.4 }}>Receipt auto-verified. Venue notified. Court locked in.</div>
        </Card>
      </div>
    </Frame>
  );
}

function Slide5OpenPlay({ w, h }: { w: number; h: number }) {
  return (
    <Frame width={w} height={h}>
      <div style={{ display: "flex", flex: 1, alignItems: "center" }}>
        <div style={{ display: "flex", flexDirection: "column", flex: 1, paddingRight: 32 }}>
          <Eyebrow text="Open Play" />
          <Headline lines={[{ text: "DROP IN." }, { text: "GET PAIRED.", accent: true }, { text: "JUST PLAY." }]} sizes={{ fontSize: 84 }} />
          <SubCopy text="Join scheduled Open Play sessions at any partner venue. One price covers the whole window — show up, meet players, get on a court." />
          <Check text="Single fee — pay once, play all rounds" />
          <Check text="Live spot counter, instant sign-up" />
          <Check text="GCash payment, instant confirmation" />
          <Check text="Cancel up to 24h before, full credit" />
        </div>
        <OpenPlayCardMock />
      </div>
    </Frame>
  );
}

function Slide6VsMessenger({ w, h }: { w: number; h: number }) {
  const cardW = 440;
  const cardH = 170;
  return (
    <Frame width={w} height={h}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flex: 1 }}>
        <Eyebrow text="Built for owners" />
        <Headline lines={[{ text: "WHAT MESSENGER" }, { text: "BOOKINGS CAN'T DO.", accent: true }]} sizes={{ fontSize: 64 }} />
        <div style={{ display: "flex", height: 24 }} />
        <div style={{ display: "flex", marginBottom: 16 }}>
          <FeatureCard icon="🔒" title="Never double-book" body="Database-enforced — two players physically can't claim the same slot." width={cardW} height={cardH} marginRight={16} />
          <FeatureCard icon="📊" title="Clean weekly statement" body="Every booking, every peso, in one report ready to forward." width={cardW} height={cardH} />
        </div>
        <div style={{ display: "flex", marginBottom: 16 }}>
          <FeatureCard icon="✉️" title="Auto-comms" body="Confirmations, reminders, receipts — handled automatically." width={cardW} height={cardH} marginRight={16} />
          <FeatureCard icon="🔄" title="Smart reschedules" body="Close a court? We try to move bookings first, email second." width={cardW} height={cardH} />
        </div>
        <div style={{ display: "flex" }}>
          <FeatureCard icon="🧾" title="Receipts in one place" body="GCash receipts stored privately, deleted on request." width={cardW} height={cardH} marginRight={16} />
          <FeatureCard icon="⚡" title="Live dashboard" body="Today's revenue, this week's bookings, on demand." width={cardW} height={cardH} />
        </div>
      </div>
    </Frame>
  );
}

function Slide7Owners({ w, h }: { w: number; h: number }) {
  return (
    <Frame width={w} height={h}>
      <div style={{ display: "flex", flex: 1, alignItems: "center" }}>
        <div style={{ display: "flex", flexDirection: "column", flex: 1, paddingRight: 32 }}>
          <Eyebrow text="For venue partners" />
          <Headline lines={[{ text: "LIST YOUR" }, { text: "COURTS." }, { text: "FILL YOUR", accent: true }, { text: "SLOTS.", accent: true }]} sizes={{ fontSize: 80 }} />
          <SubCopy text="Self-serve partner portal. Publish your venue in minutes, set your own hours and rates, start taking bookings today." />
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: C.accent,
              color: C.bg,
              fontSize: 24,
              fontWeight: 900,
              letterSpacing: 0.5,
              padding: "16px 24px",
              borderRadius: 12,
              marginBottom: 24,
              textTransform: "uppercase",
            }}
          >
            FREE TO LIST · 0% PLATFORM FEE FOR YOUR FIRST 2 MONTHS
          </div>
          <Check text="Live in minutes — no onboarding calls" />
          <Check text="Per-court hourly rates, day-of-week schedule" />
          <Check text="Auto-verified GCash receipts" />
          <Check text="Weekly payouts, full booking history" />
        </div>
        <OwnerDashboardMock />
      </div>
    </Frame>
  );
}

function Slide8AutoMove({ w, h }: { w: number; h: number }) {
  return (
    <Frame width={w} height={h}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flex: 1 }}>
        <Eyebrow text="Weather. Closures. Stuff happens." />
        <Headline lines={[{ text: "WE MOVE THE" }, { text: "BOOKING.", accent: true }, { text: "NOT THE PLAYER." }]} sizes={{ fontSize: 78 }} />
        <SubCopy text="Close a court for repairs? DinkHub tries every other court at the same time first. Players keep their slot. You don't process a single refund." maxWidth={900} />
        <div style={{ display: "flex" }}>
          <Card width={920} height={280}>
            <div style={{ display: "flex", color: C.accent, fontSize: 18, fontWeight: 700, letterSpacing: 3, textTransform: "uppercase", marginBottom: 16 }}>Closure preview</div>
            <div style={{ display: "flex", color: C.ink, fontSize: 30, fontWeight: 900, marginBottom: 18 }}>Court 1 closed · Sat 6 PM – 9 PM</div>
            <div style={{ display: "flex", alignItems: "center", marginBottom: 12 }}>
              <div style={{ display: "flex", color: C.accent, fontSize: 26, fontWeight: 900, marginRight: 14 }}>✓</div>
              <div style={{ display: "flex", color: C.ink, fontSize: 24 }}>
                <span style={{ fontWeight: 900, marginRight: 8 }}>6</span> of 8 bookings auto-moved to Court 2 — same time
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", marginBottom: 12 }}>
              <div style={{ display: "flex", color: C.accent, fontSize: 26, fontWeight: 900, marginRight: 14 }}>✓</div>
              <div style={{ display: "flex", color: C.ink, fontSize: 24 }}>
                <span style={{ fontWeight: 900, marginRight: 8 }}>2</span> emailed a one-tap reschedule link
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center" }}>
              <div style={{ display: "flex", color: C.accent, fontSize: 26, fontWeight: 900, marginRight: 14 }}>✓</div>
              <div style={{ display: "flex", color: C.ink, fontSize: 24 }}>
                <span style={{ fontWeight: 900, marginRight: 8 }}>0</span> refunds to process
              </div>
            </div>
          </Card>
        </div>
      </div>
    </Frame>
  );
}

function Slide9Trust({ w, h }: { w: number; h: number }) {
  return (
    <Frame width={w} height={h}>
      <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
        <Eyebrow text="Built for PH pickleball" />
        <Headline lines={[{ text: "BANK-GRADE" }, { text: "BOOKING." }, { text: "BARANGAY-LEVEL", accent: true }, { text: "PRICES.", accent: true }]} sizes={{ fontSize: 86 }} />
        <div style={{ display: "flex", height: 12 }} />
        <div style={{ display: "flex", flexDirection: "column", marginTop: 8 }}>
          <Check text="Real-time double-booking prevention" />
          <Check text="GCash payments — what you already use" />
          <Check text="Receipts stored privately, deleted on request" />
          <Check text="Email notifications, no spam" />
          <Check text="Free to list, free to play — pay only court rates" />
          <Check text="Owner-controlled cancellation windows" />
        </div>
      </div>
    </Frame>
  );
}

function Slide10Closer({ w, h }: { w: number; h: number }) {
  return (
    <Frame width={w} height={h}>
      <div style={{ display: "flex", flexDirection: "column", flex: 1, justifyContent: "center" }}>
        <Headline lines={[{ text: "YOUR COURT" }, { text: "IS WAITING.", accent: true }]} sizes={{ fontSize: 132, lineHeight: 1.0 }} />
        <div style={{ display: "flex", height: 24 }} />
        <SubCopy text="Find a court near you, or list your venue free for 2 months." maxWidth={820} />
        <div style={{ display: "flex", marginTop: 16, marginBottom: 32 }}>
          <div style={{ display: "flex", marginRight: 16 }}>
            <Pill>Find a court →</Pill>
          </div>
          <GhostPill>List your venue</GhostPill>
        </div>
        <div style={{ display: "flex", color: C.accent, fontSize: 30, fontWeight: 900, letterSpacing: 4, textTransform: "uppercase" }}>
          dinkhub.ph
        </div>
      </div>
    </Frame>
  );
}

// ──────────────────────────────────────────────────────────────────────
// Route handler
// ──────────────────────────────────────────────────────────────────────

export async function GET(
  req: Request,
  { params }: { params: Promise<{ slide: string }> },
) {
  const rawParams = await params;
  const parsedParams = paramsSchema.safeParse(rawParams);
  if (!parsedParams.success) return new Response("Invalid slide id", { status: 400 });

  const url = new URL(req.url);
  const parsedQuery = querySchema.safeParse({
    format: url.searchParams.get("format") ?? undefined,
  });
  if (!parsedQuery.success) return new Response("Invalid format", { status: 400 });

  const format = parsedQuery.data.format as Format;
  const { width: w, height: h } = FORMATS[format];

  const fontsResult = await Promise.allSettled([loadFonts()]);
  const fontsItem = fontsResult[0];
  if (fontsItem.status === "rejected") {
    captureException(fontsItem.reason, { scope: "social.og.fonts" });
  }
  const fonts = fontsItem.status === "fulfilled" ? fontsItem.value : undefined;

  const slide = parsedParams.data.slide;
  let node: React.ReactElement;
  switch (slide) {
    case "1":
      node = <Slide1Hero w={w} h={h} />;
      break;
    case "2":
      node = <Slide2Loop w={w} h={h} />;
      break;
    case "3":
      node = <Slide3Book w={w} h={h} />;
      break;
    case "4":
      node = <Slide4Flow w={w} h={h} />;
      break;
    case "5":
      node = <Slide5OpenPlay w={w} h={h} />;
      break;
    case "6":
      node = <Slide6VsMessenger w={w} h={h} />;
      break;
    case "7":
      node = <Slide7Owners w={w} h={h} />;
      break;
    case "8":
      node = <Slide8AutoMove w={w} h={h} />;
      break;
    case "9":
      node = <Slide9Trust w={w} h={h} />;
      break;
    case "10":
      node = <Slide10Closer w={w} h={h} />;
      break;
  }

  return new ImageResponse(node, {
    width: w,
    height: h,
    ...(fonts ? { fonts } : {}),
    headers: {
      // Marketing slides are evergreen — cache hard at the CDN, allow stale.
      "Cache-Control": "public, max-age=300, s-maxage=86400, stale-while-revalidate=604800",
    },
  });
}
