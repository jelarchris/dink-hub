import { ImageResponse } from "next/og";
import { z } from "zod";
import { captureException } from "@/lib/observability";

/**
 * Public social-carousel image route.
 *
 * GET /api/og/social/<slide>
 *
 * Renders one slide of the 10-slide DinkHub launch carousel as a 1080×1080
 * PNG. Each slide is content-only (no DB reads) so the response is cacheable
 * indefinitely at the CDN; we still set a long s-maxage with SWR.
 *
 * Slides:
 *   hero · loop · book · flow · open-play · vs-messenger · partners ·
 *   auto-move · trust · cta
 */

export const runtime = "nodejs";
export const dynamic = "force-static";
export const revalidate = 86400;

const SIZE = 1080;

// Brand palette tuned for the dark social treatment. Hardcoded so Satori
// doesn't have to resolve CSS vars.
const C = {
  bg: "#0B1F18",
  card: "#0F2A22",
  cardEdge: "#1A3B30",
  neon: "#34D399",
  neonSoft: "rgba(52, 211, 153, 0.12)",
  ink: "#FFFFFF",
  inkMuted: "rgba(255, 255, 255, 0.72)",
  inkSubtle: "rgba(255, 255, 255, 0.48)",
} as const;

const SLIDE_IDS = [
  "hero",
  "loop",
  "book",
  "flow",
  "open-play",
  "vs-messenger",
  "partners",
  "auto-move",
  "trust",
  "cta",
  "owner-pitch",
] as const;
type SlideId = (typeof SLIDE_IDS)[number];

// Per-slide canvas size. Default 1080x1080; owner-pitch is a tall sales sheet.
const SLIDE_DIMS: Partial<Record<SlideId, { width: number; height: number }>> = {
  "owner-pitch": { width: 1080, height: 1620 },
};

const paramsSchema = z.object({ slide: z.enum(SLIDE_IDS) });

// ─── font loading (same trick as the availability route) ────────────────────
async function fetchGoogleFontTtf(
  family: string,
  weight: 400 | 600 | 700 | 900,
): Promise<ArrayBuffer> {
  const cssUrl = `https://fonts.googleapis.com/css?family=${encodeURIComponent(
    family,
  )}:${weight}`;
  const cssRes = await fetch(cssUrl, {
    headers: { "User-Agent": "Wget/1.20.3 (linux-gnu)" },
    cache: "force-cache",
  });
  if (!cssRes.ok) throw new Error(`Font CSS fetch failed (${cssRes.status})`);
  const css = await cssRes.text();
  const match = /src:\s*url\((https:\/\/[^)]+\.ttf)\)/.exec(css);
  if (!match?.[1]) throw new Error(`No TTF URL for ${family} ${weight}`);
  const fontRes = await fetch(match[1], { cache: "force-cache" });
  if (!fontRes.ok) throw new Error(`Font TTF fetch failed (${fontRes.status})`);
  return fontRes.arrayBuffer();
}

type Font = {
  name: string;
  data: ArrayBuffer;
  weight: 400 | 600 | 700 | 900;
  style: "normal";
};

async function loadFonts(): Promise<Font[]> {
  const [r400, r600, r700, r900] = await Promise.all([
    fetchGoogleFontTtf("Inter", 400),
    fetchGoogleFontTtf("Inter", 600),
    fetchGoogleFontTtf("Inter", 700),
    fetchGoogleFontTtf("Inter", 900),
  ]);
  return [
    { name: "Inter", data: r400, weight: 400, style: "normal" },
    { name: "Inter", data: r600, weight: 600, style: "normal" },
    { name: "Inter", data: r700, weight: 700, style: "normal" },
    { name: "Inter", data: r900, weight: 900, style: "normal" },
  ];
}

// ─── shared pieces ──────────────────────────────────────────────────────────
const PADDING = 72;

function Logo() {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        fontSize: 34,
        fontWeight: 900,
        color: C.ink,
        letterSpacing: -1,
      }}
    >
      <div
        style={{
          width: 38,
          height: 38,
          borderRadius: 999,
          background: C.neon,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: C.bg,
          fontSize: 24,
          fontWeight: 900,
        }}
      >
        ●
      </div>
      dinkhub
    </div>
  );
}

function Eyebrow({ children }: { children: string }) {
  return (
    <div
      style={{
        display: "flex",
        color: C.neon,
        fontSize: 22,
        fontWeight: 700,
        letterSpacing: 6,
        textTransform: "uppercase",
      }}
    >
      {children}
    </div>
  );
}

function Bracketed({
  children,
  width,
}: {
  children: React.ReactNode;
  width: number | string;
}) {
  // Card with neon-tinted border. (Absolute corner brackets break Satori
  // when nested in flex parents — see AGENTS.md hard-won facts.)
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        background: C.card,
        border: `1.5px solid ${C.neonSoft}`,
        borderRadius: 18,
        padding: 24,
        width,
      }}
    >
      {children}
    </div>
  );
}

function FeatureCard({
  title,
  body,
  width = 420,
}: {
  title: string;
  body: string;
  width?: number;
}) {
  return (
    <Bracketed width={width}>
      <div
        style={{
          display: "flex",
          fontSize: 24,
          fontWeight: 900,
          color: C.ink,
          letterSpacing: -0.5,
          marginBottom: 10,
        }}
      >
        {title}
      </div>
      <div
        style={{
          display: "flex",
          fontSize: 19,
          color: C.inkMuted,
          lineHeight: 1.35,
        }}
      >
        {body}
      </div>
    </Bracketed>
  );
}

function Headline({
  white,
  green,
}: {
  white: string;
  green?: string;
}) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        fontSize: 96,
        fontWeight: 900,
        color: C.ink,
        lineHeight: 0.98,
        letterSpacing: -2,
        textTransform: "uppercase",
      }}
    >
      <span style={{ display: "flex" }}>{white}</span>
      {green && (
        <span style={{ display: "flex", color: C.neon }}>{green}</span>
      )}
    </div>
  );
}

function Body({ children }: { children: string }) {
  return (
    <div
      style={{
        display: "flex",
        fontSize: 24,
        color: C.inkMuted,
        lineHeight: 1.4,
        maxWidth: 720,
      }}
    >
      {children}
    </div>
  );
}

function Check({ children }: { children: string }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        fontSize: 22,
        color: C.ink,
      }}
    >
      <span style={{ display: "flex", color: C.neon, fontWeight: 900 }}>
        ✓
      </span>
      <span style={{ display: "flex" }}>{children}</span>
    </div>
  );
}

function Pill({
  children,
  filled,
}: {
  children: string;
  filled?: boolean;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        padding: "18px 32px",
        borderRadius: 999,
        background: filled ? C.neon : "transparent",
        color: filled ? C.bg : C.ink,
        border: filled ? "none" : `1.5px solid ${C.cardEdge}`,
        fontSize: 24,
        fontWeight: 700,
      }}
    >
      {children}
    </div>
  );
}

// ─── slide renderers ────────────────────────────────────────────────────────
function SlideHero(): React.ReactElement {
  return (
    <Frame>
      <Header />
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 28,
          marginTop: 110,
          width: 820,
        }}
      >
        <Headline white="PICKLEBALL," green="WITHOUT THE CHAOS." />
        <Body>
          Find a court. Book online. Pay via GCash. Owners run the schedule
          from one dashboard. Built for Philippines pickleball.
        </Body>
        <div style={{ display: "flex", gap: 16, marginTop: 8 }}>
          <Pill filled>Find a court  →</Pill>
          <Pill>List your venue</Pill>
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            marginTop: 24,
            fontSize: 18,
            color: C.inkSubtle,
            letterSpacing: 4,
            textTransform: "uppercase",
          }}
        >
          <span
            style={{
              width: 10,
              height: 10,
              borderRadius: 999,
              background: C.neon,
              display: "flex",
            }}
          />
          Live across the Philippines
        </div>
      </div>
    </Frame>
  );
}

function SlideLoop(): React.ReactElement {
  return (
    <Frame center>
      <Header />
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          marginTop: 60,
          gap: 14,
        }}
      >
        <Eyebrow>The Loop</Eyebrow>
        <div
          style={{
            display: "flex",
            fontSize: 84,
            fontWeight: 900,
            color: C.ink,
            letterSpacing: -2,
            textAlign: "center",
            lineHeight: 1,
            textTransform: "uppercase",
          }}
        >
          ONE APP, END-TO-END.
        </div>
        <div
          style={{
            display: "flex",
            fontSize: 22,
            color: C.inkMuted,
            textAlign: "center",
            maxWidth: 760,
            marginTop: 8,
          }}
        >
          Browse → book → pay → play. Owners track everything from one portal.
        </div>
      </div>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 18,
          marginTop: 48,
        }}
      >
        <div style={{ display: "flex", gap: 18 }}>
          <FeatureCard
            title="LIVE AVAILABILITY"
            body="Per-hour slots across every listed venue. Real-time."
          />
          <FeatureCard
            title="ONE-TAP GCASH"
            body="Upload your receipt. Auto-verified in minutes."
          />
        </div>
        <div style={{ display: "flex", gap: 18 }}>
          <FeatureCard
            title="OPEN PLAY"
            body="Drop in, get paired by skill, meet new players."
          />
          <FeatureCard
            title="SMART CLOSURES"
            body="Court down? We auto-move bookings first."
          />
        </div>
        <FeatureCard
          title="OWNER DASHBOARD"
          body="Bookings, schedule, payouts, reviews — one place."
          width={500}
        />
      </div>
    </Frame>
  );
}

function SlideBook(): React.ReactElement {
  return (
    <Frame>
      <Header />
      <div
        style={{
          display: "flex",
          marginTop: 90,
          gap: 36,
          alignItems: "flex-start",
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 20,
            width: 540,
          }}
        >
          <Eyebrow>Book a court</Eyebrow>
          <Headline white="YOUR NEXT" green="GAME, ONE TAP." />
          <Body>
            Browse venues near you, pick your date, lock the hours you need.
            Pay via GCash. Confirmation in minutes.
          </Body>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 10,
              marginTop: 8,
            }}
          >
            <Check>Live availability, every listed venue</Check>
            <Check>1-hour slots, transparent rates</Check>
            <Check>Upload GCash receipt → auto-verified</Check>
            <Check>Free reschedule if the venue closes</Check>
          </div>
        </div>
        {/* Mock slot picker */}
        <Bracketed width={400}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              fontSize: 14,
              letterSpacing: 4,
              color: C.inkSubtle,
              textTransform: "uppercase",
              marginBottom: 8,
            }}
          >
            <span style={{ display: "flex" }}>Date</span>
            <span style={{ display: "flex" }}>Rates</span>
          </div>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              fontSize: 18,
              fontWeight: 700,
              color: C.ink,
              marginBottom: 18,
            }}
          >
            <span style={{ display: "flex" }}>SAT · MAY 23</span>
            <span style={{ display: "flex", color: C.neon }}>PHP 350/hr</span>
          </div>
          {[
            { t: "5 PM", a: "BOOKED", b: "SELECTED" },
            { t: "6 PM", a: "BOOKED", b: "SELECTED" },
            { t: "7 PM", a: "BOOKED", b: "BOOKED" },
            { t: "8 PM", a: "OPEN", b: "OPEN" },
            { t: "9 PM", a: "OPEN", b: "OPEN" },
          ].map((row) => (
            <div
              key={row.t}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                marginBottom: 8,
              }}
            >
              <div
                style={{
                  display: "flex",
                  width: 64,
                  fontSize: 16,
                  color: C.inkSubtle,
                }}
              >
                {row.t}
              </div>
              <SlotCell label={row.a} />
              <SlotCell label={row.b} />
            </div>
          ))}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              marginTop: 14,
              padding: "12px 16px",
              borderRadius: 12,
              border: `1.5px solid ${C.neon}`,
              background: C.neonSoft,
            }}
          >
            <div
              style={{
                display: "flex",
                fontSize: 13,
                letterSpacing: 3,
                color: C.inkSubtle,
                textTransform: "uppercase",
              }}
            >
              Court 2 · 2 hrs
            </div>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginTop: 4,
              }}
            >
              <div
                style={{
                  display: "flex",
                  fontSize: 22,
                  fontWeight: 700,
                  color: C.ink,
                }}
              >
                6–8 PM
              </div>
              <div
                style={{
                  display: "flex",
                  fontSize: 28,
                  fontWeight: 900,
                  color: C.neon,
                }}
              >
                PHP 700
              </div>
            </div>
          </div>
        </Bracketed>
      </div>
    </Frame>
  );
}

function SlotCell({ label }: { label: string }) {
  const selected = label === "SELECTED";
  const booked = label === "BOOKED";
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flex: 1,
        height: 36,
        borderRadius: 8,
        fontSize: 13,
        fontWeight: 700,
        letterSpacing: 1.5,
        background: selected ? C.neon : booked ? "rgba(255,255,255,0.04)" : "transparent",
        color: selected ? C.bg : booked ? C.inkSubtle : C.ink,
        border: selected
          ? "none"
          : `1px solid ${booked ? "rgba(255,255,255,0.08)" : C.cardEdge}`,
      }}
    >
      {label}
    </div>
  );
}

function SlideFlow(): React.ReactElement {
  const steps = [
    { n: "01", t: "PICK A SLOT", b: "Hourly grid. Real-time availability." },
    { n: "02", t: "PAY VIA GCASH", b: "One-tap transfer. Upload your receipt." },
    { n: "03", t: "PLAY", b: "We verify. Venue notified. Court locked." },
  ];
  return (
    <Frame center>
      <Header />
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          marginTop: 80,
          gap: 14,
        }}
      >
        <Eyebrow>The Flow</Eyebrow>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            fontSize: 84,
            fontWeight: 900,
            lineHeight: 0.98,
            letterSpacing: -2,
            textTransform: "uppercase",
            color: C.ink,
            textAlign: "center",
          }}
        >
          <span style={{ display: "flex" }}>FROM TAP TO COURT.</span>
          <span style={{ display: "flex", color: C.neon }}>TWO MINUTES.</span>
        </div>
      </div>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 18,
          marginTop: 56,
          alignItems: "center",
        }}
      >
        <div style={{ display: "flex", gap: 18 }}>
          {steps.slice(0, 2).map((s) => (
            <FlowCard key={s.n} {...s} />
          ))}
        </div>
        <FlowCard {...steps[2]!} wide />
      </div>
    </Frame>
  );
}

function FlowCard({
  n,
  t,
  b,
  wide,
}: {
  n: string;
  t: string;
  b: string;
  wide?: boolean;
}) {
  return (
    <Bracketed width={wide ? 500 : 420}>
      <div
        style={{
          display: "flex",
          fontSize: 14,
          letterSpacing: 4,
          color: C.neon,
          marginBottom: 12,
        }}
      >
        {n}
      </div>
      <div
        style={{
          display: "flex",
          fontSize: 28,
          fontWeight: 900,
          color: C.ink,
          letterSpacing: -0.5,
          marginBottom: 8,
        }}
      >
        {t}
      </div>
      <div style={{ display: "flex", fontSize: 19, color: C.inkMuted }}>
        {b}
      </div>
    </Bracketed>
  );
}

function SlideOpenPlay(): React.ReactElement {
  return (
    <Frame>
      <Header />
      <div
        style={{
          display: "flex",
          marginTop: 90,
          gap: 36,
          alignItems: "flex-start",
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 20,
            width: 540,
          }}
        >
          <Eyebrow>Open Play</Eyebrow>
          <Headline white="DROP IN." green="JUST PLAY." />
          <Body>
            Join scheduled Open Play sessions at any partner venue. One price,
            all rounds. Meet new players. Get on a court.
          </Body>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 10,
              marginTop: 8,
            }}
          >
            <Check>One fee covers court + balls + paddles</Check>
            <Check>Skill-tier filters so games stay fun</Check>
            <Check>Live spot counter, instant sign-up</Check>
            <Check>GCash payment, instant confirmation</Check>
          </div>
        </div>
        {/* Open Play card mock */}
        <Bracketed width={400}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 16,
            }}
          >
            <div
              style={{
                display: "flex",
                padding: "6px 12px",
                borderRadius: 999,
                background: C.neonSoft,
                color: C.neon,
                fontSize: 13,
                fontWeight: 700,
                letterSpacing: 2,
              }}
            >
              ALL LEVELS
            </div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                color: C.neon,
                fontSize: 13,
                fontWeight: 700,
                letterSpacing: 2,
              }}
            >
              ● LIVE
            </div>
          </div>
          <div
            style={{
              display: "flex",
              fontSize: 28,
              fontWeight: 900,
              color: C.ink,
              marginBottom: 4,
            }}
          >
            Sunday Open Play
          </div>
          <div
            style={{
              display: "flex",
              fontSize: 17,
              color: C.inkMuted,
              marginBottom: 2,
            }}
          >
            MAY 24 · 7–9 PM
          </div>
          <div
            style={{
              display: "flex",
              fontSize: 16,
              color: C.inkSubtle,
              marginBottom: 22,
            }}
          >
            📍 Bayugan Pickleball Courts
          </div>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 8,
            }}
          >
            <div
              style={{
                display: "flex",
                fontSize: 14,
                letterSpacing: 3,
                color: C.inkSubtle,
              }}
            >
              8/16 SPOTS
            </div>
            <div
              style={{
                display: "flex",
                fontSize: 26,
                fontWeight: 900,
                color: C.neon,
              }}
            >
              PHP 250
            </div>
          </div>
          <div
            style={{
              display: "flex",
              height: 8,
              borderRadius: 999,
              background: "rgba(255,255,255,0.08)",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                display: "flex",
                width: "50%",
                background: C.neon,
              }}
            />
          </div>
          <div
            style={{
              display: "flex",
              marginTop: 18,
              padding: "12px 16px",
              borderRadius: 12,
              background: C.neon,
              color: C.bg,
              fontSize: 18,
              fontWeight: 900,
              justifyContent: "center",
            }}
          >
            SIGN UP
          </div>
        </Bracketed>
      </div>
    </Frame>
  );
}

function SlideVsMessenger(): React.ReactElement {
  const items = [
    {
      t: "NO DOUBLE-BOOKING",
      b: "Database-enforced — two players physically can't claim the same slot.",
    },
    {
      t: "NO MANUAL TALLY",
      b: "Weekly statements show every booking, every peso.",
    },
    {
      t: "AUTO-COMMS",
      b: "Confirmations, reminders, receipts — handled for you.",
    },
    {
      t: "SMART RESCHEDULES",
      b: "Closing a court? We try to move players first.",
    },
    {
      t: "CLEAN RECEIPTS",
      b: "Every booking, one page, ready to forward.",
    },
    {
      t: "LIVE DASHBOARD",
      b: "Today's bookings, this week's revenue, on demand.",
    },
  ];
  return (
    <Frame center>
      <Header />
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          marginTop: 70,
          marginBottom: 30,
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            fontSize: 76,
            fontWeight: 900,
            lineHeight: 0.98,
            letterSpacing: -2,
            textTransform: "uppercase",
            color: C.ink,
            textAlign: "center",
          }}
        >
          <span style={{ display: "flex" }}>WHAT MESSENGER</span>
          <span style={{ display: "flex", color: C.neon }}>CAN&apos;T DO.</span>
        </div>
      </div>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 18,
          alignItems: "center",
        }}
      >
        {[0, 2, 4].map((start) => (
          <div key={start} style={{ display: "flex", gap: 18 }}>
            {items.slice(start, start + 2).map((it) => (
              <FeatureCard key={it.t} title={it.t} body={it.b} width={420} />
            ))}
          </div>
        ))}
      </div>
    </Frame>
  );
}

function SlidePartners(): React.ReactElement {
  return (
    <Frame>
      <Header />
      <div
        style={{
          display: "flex",
          marginTop: 80,
          gap: 36,
          alignItems: "flex-start",
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 18,
            width: 540,
          }}
        >
          <Eyebrow>For venue partners</Eyebrow>
          <Headline white="LIST YOUR" green="COURTS. FILL YOUR SLOTS." />
          <Body>
            Self-serve owner portal. Publish a venue in minutes, set your
            hours and rates, start taking online bookings today.
          </Body>
          <div
            style={{
              display: "flex",
              padding: "14px 18px",
              borderRadius: 12,
              background: C.neonSoft,
              border: `1.5px solid ${C.neon}`,
              fontSize: 18,
              fontWeight: 700,
              color: C.neon,
              marginTop: 4,
              alignSelf: "flex-start",
            }}
          >
            FREE TO LIST · 0% FEE FOR YOUR FIRST 2 MONTHS
          </div>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 10,
              marginTop: 10,
            }}
          >
            <Check>Live in minutes — no onboarding calls</Check>
            <Check>Per-court hourly rates, weekly schedule</Check>
            <Check>Auto-verified GCash receipts</Check>
            <Check>Weekly payouts, full booking history</Check>
          </div>
        </div>
        {/* Owner dashboard mock */}
        <Bracketed width={400}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-start",
              marginBottom: 4,
            }}
          >
            <div style={{ display: "flex", flexDirection: "column" }}>
              <div
                style={{
                  display: "flex",
                  fontSize: 22,
                  fontWeight: 900,
                  color: C.ink,
                  letterSpacing: -0.5,
                }}
              >
                BAYUGAN PICKLEBALL
              </div>
              <div
                style={{
                  display: "flex",
                  fontSize: 12,
                  letterSpacing: 3,
                  color: C.inkSubtle,
                  marginTop: 2,
                }}
              >
                PARTNER PORTAL
              </div>
            </div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                padding: "4px 10px",
                borderRadius: 999,
                background: C.neonSoft,
                color: C.neon,
                fontSize: 12,
                fontWeight: 700,
                letterSpacing: 2,
              }}
            >
              ● ACTIVE
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 18 }}>
            <Stat label="TODAY" value="PHP 1,750" />
            <Stat label="BOOKINGS" value="8" />
            <Stat label="RATED" value="4.9★" />
          </div>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 8,
              marginTop: 18,
            }}
          >
            {[
              { who: "Miguel R.", what: "COURT 1 · 7–9 PM", tag: "CONFIRMED" },
              { who: "Sofia L.", what: "COURT 2 · 6–8 PM", tag: "RECEIPT" },
              { who: "Rafael D.", what: "COURT 1 · 9–10 PM", tag: "REVIEW" },
            ].map((r) => (
              <BookingRow key={r.who} {...r} />
            ))}
          </div>
        </Bracketed>
      </div>
    </Frame>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        flex: 1,
        padding: "10px 12px",
        borderRadius: 10,
        background: "rgba(255,255,255,0.04)",
        border: `1px solid ${C.cardEdge}`,
      }}
    >
      <div
        style={{
          display: "flex",
          fontSize: 11,
          letterSpacing: 2,
          color: C.inkSubtle,
        }}
      >
        {label}
      </div>
      <div
        style={{
          display: "flex",
          fontSize: 19,
          fontWeight: 900,
          color: C.ink,
          marginTop: 2,
        }}
      >
        {value}
      </div>
    </div>
  );
}

function BookingRow({
  who,
  what,
  tag,
}: {
  who: string;
  what: string;
  tag: string;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "8px 10px",
        borderRadius: 10,
        background: "rgba(255,255,255,0.03)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: 26,
          height: 26,
          borderRadius: 999,
          background: C.neonSoft,
          color: C.neon,
          fontSize: 13,
          fontWeight: 900,
        }}
      >
        {who[0]}
      </div>
      <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
        <div
          style={{
            display: "flex",
            fontSize: 14,
            color: C.ink,
            fontWeight: 700,
          }}
        >
          {who}
        </div>
        <div
          style={{
            display: "flex",
            fontSize: 11,
            color: C.inkSubtle,
            letterSpacing: 1.5,
          }}
        >
          {what}
        </div>
      </div>
      <div
        style={{
          display: "flex",
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: 2,
          color: C.neon,
        }}
      >
        {tag}
      </div>
    </div>
  );
}

function SlideAutoMove(): React.ReactElement {
  return (
    <Frame center>
      <Header />
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          marginTop: 70,
          gap: 16,
        }}
      >
        <Eyebrow>Weather. Closures. Stuff happens.</Eyebrow>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            fontSize: 76,
            fontWeight: 900,
            lineHeight: 0.98,
            letterSpacing: -2,
            textTransform: "uppercase",
            color: C.ink,
            textAlign: "center",
          }}
        >
          <span style={{ display: "flex" }}>WE MOVE THE BOOKING.</span>
          <span style={{ display: "flex", color: C.neon }}>
            NOT THE PLAYER.
          </span>
        </div>
        <Body>
          Close a court for repairs and DinkHub tries every other court at the
          same time first. Players keep their slot. You don&apos;t process a
          single refund.
        </Body>
      </div>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          marginTop: 44,
          alignSelf: "center",
        }}
      >
        <Bracketed width={680}>
          <div
            style={{
              display: "flex",
              fontSize: 14,
              letterSpacing: 4,
              color: C.neon,
              marginBottom: 14,
            }}
          >
            CLOSURE PREVIEW · COURT 1 · MAY 25
          </div>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 12,
              fontSize: 22,
              color: C.ink,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <span style={{ display: "flex", color: C.neon }}>✓</span>
              <span style={{ display: "flex" }}>
                6 of 8 bookings auto-moved to Court 2 · same time
              </span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <span style={{ display: "flex", color: C.neon }}>✓</span>
              <span style={{ display: "flex" }}>
                2 emailed a free one-tap reschedule link
              </span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <span style={{ display: "flex", color: C.neon }}>✓</span>
              <span style={{ display: "flex" }}>0 refunds to process</span>
            </div>
          </div>
        </Bracketed>
      </div>
    </Frame>
  );
}

function SlideTrust(): React.ReactElement {
  const items = [
    "Real-time double-booking prevention",
    "GCash payments — what you already use",
    "Receipts stored privately, deleted on request",
    "Email & SMS notifications, no spam",
    "Free to list, free to play — pay only court rates",
    "Owner-controlled cancellation windows",
  ];
  return (
    <Frame>
      <Header />
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          marginTop: 90,
          gap: 18,
          width: 880,
        }}
      >
        <Eyebrow>Built for PH pickleball</Eyebrow>
        <Headline white="BANK-GRADE BOOKING." green="BARANGAY-LEVEL PRICES." />
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 14,
            marginTop: 20,
          }}
        >
          {items.map((t) => (
            <Check key={t}>{t}</Check>
          ))}
        </div>
      </div>
    </Frame>
  );
}

function SlideCta(): React.ReactElement {
  return (
    <Frame center>
      <Header />
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          flex: 1,
          gap: 40,
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            fontSize: 128,
            fontWeight: 900,
            lineHeight: 0.96,
            letterSpacing: -3,
            textTransform: "uppercase",
            color: C.ink,
            textAlign: "center",
          }}
        >
          <span style={{ display: "flex" }}>YOUR COURT</span>
          <span style={{ display: "flex", color: C.neon }}>IS WAITING.</span>
        </div>
        <div style={{ display: "flex", gap: 16 }}>
          <Pill filled>Find a court  →</Pill>
          <Pill>List your venue</Pill>
        </div>
        <div
          style={{
            display: "flex",
            fontSize: 26,
            fontWeight: 700,
            color: C.inkSubtle,
            letterSpacing: 4,
            textTransform: "uppercase",
            marginTop: 24,
          }}
        >
          dinkhub.ph
        </div>
      </div>
    </Frame>
  );
}

// ─── owner pitch (tall 1080×1620 sales sheet) ───────────────────────────────
function PitchRow({ pain, fix }: { pain: string; fix: string }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "stretch",
        gap: 14,
        width: "100%",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          flex: 1,
          padding: "14px 18px",
          borderRadius: 12,
          backgroundColor: "rgba(255,255,255,0.04)",
          border: `1px solid ${C.cardEdge}`,
          fontSize: 19,
          color: C.inkMuted,
          lineHeight: 1.3,
        }}
      >
        <span style={{ display: "flex", marginRight: 12, color: "#F87171" }}>
          ✕
        </span>
        <span style={{ display: "flex", flex: 1 }}>{pain}</span>
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          color: C.inkSubtle,
          fontSize: 22,
        }}
      >
        →
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          flex: 1,
          padding: "14px 18px",
          borderRadius: 12,
          backgroundColor: C.neonSoft,
          border: `1.5px solid ${C.neon}`,
          fontSize: 19,
          color: C.ink,
          fontWeight: 600,
          lineHeight: 1.3,
        }}
      >
        <span style={{ display: "flex", marginRight: 12, color: C.neon, fontWeight: 900 }}>
          ✓
        </span>
        <span style={{ display: "flex", flex: 1 }}>{fix}</span>
      </div>
    </div>
  );
}

function SectionLabel({ children }: { children: string }) {
  return (
    <div
      style={{
        display: "flex",
        fontSize: 16,
        letterSpacing: 5,
        color: C.neon,
        fontWeight: 700,
        textTransform: "uppercase",
        marginBottom: 14,
      }}
    >
      {children}
    </div>
  );
}

function SlideOwnerPitch(): React.ReactElement {
  const pains: Array<{ pain: string; fix: string }> = [
    {
      pain: "50 Messenger threads to track",
      fix: "One dashboard, every booking visible",
    },
    {
      pain: "Manually checking GCash receipts",
      fix: "Receipts upload & auto-verify",
    },
    {
      pain: "Double-bookings & angry players",
      fix: "Database-enforced — impossible to double-book",
    },
    {
      pain: "Calculating weekly earnings by hand",
      fix: "Weekly statement, ready to forward",
    },
    {
      pain: "Repairs = manual refunds & chaos",
      fix: "Auto-reschedule players to your other courts",
    },
  ];

  const getList = [
    "Free public venue page with photos & map",
    "Per-court hourly rates + weekly schedule editor",
    "Open Play sessions with one-tap sign-up",
    "Auto email confirmations & 2-hour reminders",
    "Owner mobile dashboard — today, this week, ratings",
    "Closure auto-move (your players keep their slot)",
  ];

  return (
    <Frame height={1620}>
      <Header />

      {/* Headline */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          marginTop: 36,
          gap: 14,
        }}
      >
        <div
          style={{
            display: "flex",
            color: C.neon,
            fontSize: 18,
            fontWeight: 700,
            letterSpacing: 6,
            textTransform: "uppercase",
          }}
        >
          For Pickleball Court Owners
        </div>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            fontSize: 76,
            fontWeight: 900,
            color: C.ink,
            lineHeight: 0.96,
            letterSpacing: -2,
            textTransform: "uppercase",
          }}
        >
          <span style={{ display: "flex" }}>STOP RUNNING</span>
          <span style={{ display: "flex" }}>YOUR COURT FROM</span>
          <span style={{ display: "flex", color: C.neon }}>MESSENGER.</span>
        </div>
        <div
          style={{
            display: "flex",
            fontSize: 22,
            color: C.inkMuted,
            lineHeight: 1.35,
            maxWidth: 880,
            marginTop: 4,
          }}
        >
          List on DinkHub. Start taking online bookings today — keep your
          rates, your rules, and every peso you earn.
        </div>
      </div>

      {/* Pain vs Fix */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          marginTop: 40,
          width: "100%",
        }}
      >
        <SectionLabel>What you stop doing → What we do for you</SectionLabel>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 10,
            width: "100%",
          }}
        >
          {pains.map((p) => (
            <PitchRow key={p.pain} pain={p.pain} fix={p.fix} />
          ))}
        </div>
      </div>

      {/* What you get */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          marginTop: 36,
          width: "100%",
        }}
      >
        <SectionLabel>What you get</SectionLabel>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 10,
          }}
        >
          {[0, 2, 4].map((start) => (
            <div key={start} style={{ display: "flex", gap: 12, width: "100%" }}>
              {getList.slice(start, start + 2).map((t) => (
                <div
                  key={t}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    flex: 1,
                    padding: "12px 16px",
                    borderRadius: 10,
                    backgroundColor: "rgba(255,255,255,0.03)",
                    border: `1px solid ${C.cardEdge}`,
                    fontSize: 17,
                    color: C.ink,
                    lineHeight: 1.3,
                  }}
                >
                  <span style={{ display: "flex", marginRight: 10, color: C.neon, fontWeight: 900 }}>
                    ✓
                  </span>
                  <span style={{ display: "flex", flex: 1 }}>{t}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* Offer banner */}
      <div
        style={{
          display: "flex",
          marginTop: 36,
          padding: "20px 28px",
          borderRadius: 16,
          backgroundColor: C.neon,
          color: C.bg,
          width: "100%",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div
            style={{
              display: "flex",
              fontSize: 14,
              letterSpacing: 4,
              fontWeight: 700,
            }}
          >
            LAUNCH OFFER
          </div>
          <div
            style={{
              display: "flex",
              fontSize: 32,
              fontWeight: 900,
              letterSpacing: -1,
              marginTop: 2,
            }}
          >
            FREE TO LIST · 0% PLATFORM FEE
          </div>
          <div
            style={{
              display: "flex",
              fontSize: 18,
              fontWeight: 600,
              marginTop: 2,
            }}
          >
            for your first 2 months
          </div>
        </div>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "flex-end",
          }}
        >
          <div style={{ display: "flex", fontSize: 14, letterSpacing: 3, fontWeight: 700 }}>
            LIVE IN
          </div>
          <div style={{ display: "flex", fontSize: 44, fontWeight: 900, letterSpacing: -1 }}>
            10 MIN
          </div>
        </div>
      </div>

      {/* 3 steps */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          marginTop: 30,
          width: "100%",
        }}
      >
        <SectionLabel>How it works</SectionLabel>
        <div style={{ display: "flex", gap: 12, width: "100%" }}>
          {[
            { n: "01", t: "Sign up", b: "Create your owner account in 60 seconds" },
            { n: "02", t: "Add your venue", b: "Courts, hours, hourly rates" },
            { n: "03", t: "Share & earn", b: "Post your booking link — done" },
          ].map((s) => (
            <div
              key={s.n}
              style={{
                display: "flex",
                flexDirection: "column",
                flex: 1,
                padding: 18,
                borderRadius: 14,
                backgroundColor: C.card,
                border: `1.5px solid ${C.neonSoft}`,
              }}
            >
              <div
                style={{
                  display: "flex",
                  fontSize: 13,
                  letterSpacing: 3,
                  color: C.neon,
                  fontWeight: 700,
                }}
              >
                {s.n}
              </div>
              <div
                style={{
                  display: "flex",
                  fontSize: 22,
                  fontWeight: 900,
                  color: C.ink,
                  marginTop: 6,
                }}
              >
                {s.t}
              </div>
              <div
                style={{
                  display: "flex",
                  fontSize: 15,
                  color: C.inkMuted,
                  marginTop: 4,
                  lineHeight: 1.3,
                }}
              >
                {s.b}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* CTA bar */}
      <div
        style={{
          display: "flex",
          marginTop: "auto",
          paddingTop: 28,
          alignItems: "center",
          justifyContent: "space-between",
          width: "100%",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div
            style={{
              display: "flex",
              fontSize: 30,
              fontWeight: 900,
              color: C.ink,
              letterSpacing: -0.5,
            }}
          >
            List your venue today.
          </div>
          <div
            style={{
              display: "flex",
              fontSize: 18,
              color: C.inkSubtle,
              letterSpacing: 4,
              fontWeight: 700,
              textTransform: "uppercase",
              marginTop: 4,
            }}
          >
            dinkhub.ph/host
          </div>
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            padding: "20px 32px",
            borderRadius: 999,
            backgroundColor: C.neon,
            color: C.bg,
            fontSize: 22,
            fontWeight: 900,
            letterSpacing: -0.5,
          }}
        >
          Get started  →
        </div>
      </div>
    </Frame>
  );
}

// ─── frame wrapper ──────────────────────────────────────────────────────────
function Frame({
  children,
  center,
  height,
  width,
}: {
  children: React.ReactNode;
  center?: boolean;
  height?: number;
  width?: number;
}) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        width: width ?? SIZE,
        height: height ?? SIZE,
        backgroundColor: C.bg,
        backgroundImage: `radial-gradient(circle at 80% 10%, rgba(52,211,153,0.08), transparent 50%)`,
        padding: PADDING,
        fontFamily: "Inter",
        color: C.ink,
        alignItems: center ? "center" : "flex-start",
        position: "relative",
      }}
    >
      {children}
    </div>
  );
}

function Header() {
  return (
    <div
      style={{
        display: "flex",
        width: "100%",
        justifyContent: "space-between",
        alignItems: "center",
      }}
    >
      <Logo />
    </div>
  );
}

// ─── route ──────────────────────────────────────────────────────────────────
const RENDERERS: Record<SlideId, () => React.ReactElement> = {
  hero: SlideHero,
  loop: SlideLoop,
  book: SlideBook,
  flow: SlideFlow,
  "open-play": SlideOpenPlay,
  "vs-messenger": SlideVsMessenger,
  partners: SlidePartners,
  "auto-move": SlideAutoMove,
  trust: SlideTrust,
  cta: SlideCta,
  "owner-pitch": SlideOwnerPitch,
};

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slide: string }> },
) {
  const { slide } = await params;
  const parsed = paramsSchema.safeParse({ slide });
  if (!parsed.success) {
    return new Response("Unknown slide", { status: 404 });
  }

  const fontsResult = await Promise.allSettled([loadFonts()]);
  const fonts =
    fontsResult[0].status === "fulfilled" ? fontsResult[0].value : undefined;
  if (fontsResult[0].status === "rejected") {
    captureException(fontsResult[0].reason, {
      scope: "social.og.fonts",
      extra: { slide },
    });
  }

  const node = RENDERERS[parsed.data.slide]();
  const dim = SLIDE_DIMS[parsed.data.slide] ?? { width: SIZE, height: SIZE };

  return new ImageResponse(node, {
    width: dim.width,
    height: dim.height,
    ...(fonts ? { fonts } : {}),
    headers: {
      "cache-control":
        "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800",
    },
  });
}
