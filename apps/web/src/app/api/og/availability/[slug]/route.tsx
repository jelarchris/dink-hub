import { ImageResponse } from "next/og";
import QRCode from "qrcode";
import { z } from "zod";
import { env } from "@/lib/env";
import {
  getShareCardData,
  type ShareCardData,
  type ShareSlotRange,
} from "@/features/share";
import { formatPHP } from "@/lib/money";
import { captureException } from "@/lib/observability";

/**
 * Public OG image route for venue availability posters.
 *
 * GET /api/og/availability/<slug>?date=YYYY-MM-DD&court=<uuid>&format=fb|ig-portrait|ig-square
 *
 * Returns a PNG. Cacheable at the CDN — only inputs influence output and
 * underlying availability changes invalidate via the `date` boundary moving
 * past `now` (handled with short s-maxage).
 *
 * Data shown is already public on /venues/<slug>/book, so no auth.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FORMATS = {
  fb: { width: 1200, height: 630, label: "Facebook landscape" },
  "ig-portrait": { width: 1080, height: 1350, label: "Instagram portrait" },
  "ig-square": { width: 1080, height: 1080, label: "Instagram square" },
} as const;

type Format = keyof typeof FORMATS;

const querySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date must be YYYY-MM-DD"),
  court: z.string().uuid().optional(),
  format: z.enum(["fb", "ig-portrait", "ig-square"]).default("ig-portrait"),
});

// Brand palette (light theme) — hardcoded so Satori doesn't have to resolve CSS vars.
const COLORS = {
  brand: "#15803d",
  brandDark: "#14532d",
  brandLight: "#22c55e",
  accent: "#ea580c",
  accentLight: "#f97316",
  ink: "#0a0a0a",
  inkMuted: "#52525b",
  inkSubtle: "#a1a1aa",
  paper: "#fafaf7",
  border: "#e4e4e7",
  cardShadow: "rgba(15, 23, 42, 0.12)",
} as const;

// Satori only supports TTF/OTF (rejects woff2 with "Unsupported OpenType
// signature wOF2"). Google Fonts' CSS endpoint normally serves woff2, but
// with an ancient User-Agent it falls back to TTF — the canonical Vercel OG
// recipe. The intermediate gstatic font URLs rotate, but the CSS endpoint
// itself is stable.
async function fetchGoogleFontTtf(family: string, weight: 400 | 700 | 900): Promise<ArrayBuffer> {
  const cssUrl = `https://fonts.googleapis.com/css?family=${encodeURIComponent(family)}:${weight}`;
  const cssRes = await fetch(cssUrl, {
    headers: {
      // Wget UA causes Google Fonts to return a src: url(...) ending in .ttf
      // (the IE6 trick returns a /l/font?kit= blob with no extension).
      "User-Agent": "Wget/1.20.3 (linux-gnu)",
    },
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

function buildBookingUrl(slug: string, dateIso: string, courtId: string): string {
  const url = new URL(`/venues/${slug}/book`, env.NEXT_PUBLIC_APP_URL);
  url.searchParams.set("date", dateIso);
  url.searchParams.set("court", courtId);
  return url.toString();
}

async function buildQrDataUrl(text: string): Promise<string> {
  // Small, brand-coloured, transparent background.
  return QRCode.toDataURL(text, {
    margin: 1,
    width: 240,
    errorCorrectionLevel: "M",
    color: { dark: "#0a0a0a", light: "#ffffff" },
  });
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const url = new URL(req.url);
  const parsed = querySchema.safeParse({
    date: url.searchParams.get("date") ?? "",
    court: url.searchParams.get("court") ?? undefined,
    format: url.searchParams.get("format") ?? undefined,
  });
  if (!parsed.success) {
    return new Response("Invalid query", { status: 400 });
  }

  const data = await getShareCardData({
    venueSlug: slug,
    dateIso: parsed.data.date,
    ...(parsed.data.court ? { courtId: parsed.data.court } : {}),
  });
  if (!data) return new Response("Not found", { status: 404 });

  const format = parsed.data.format as Format;
  const dim = FORMATS[format];

  const bookingUrl = buildBookingUrl(data.venue.slug, data.dateIso, data.court.id);
  const shortUrl = bookingUrl
    .replace(/^https?:\/\//, "")
    .replace(/\?.*$/, ""); // human-readable short version

  // Fonts and QR are independent best-efforts: if the font CDN is down we
  // still want to ship an image (Satori falls back to its bundled default).
  // If QR fails we render the short URL only.
  const [fontsResult, qrResult] = await Promise.allSettled([
    loadFonts(),
    buildQrDataUrl(bookingUrl),
  ]);
  if (fontsResult.status === "rejected") {
    captureException(fontsResult.reason, {
      scope: "share.og.fonts",
      extra: { slug, format },
    });
  }
  if (qrResult.status === "rejected") {
    captureException(qrResult.reason, {
      scope: "share.og.qr",
      extra: { slug, format },
    });
  }
  const fonts = fontsResult.status === "fulfilled" ? fontsResult.value : undefined;
  const qrDataUrl = qrResult.status === "fulfilled" ? qrResult.value : null;

  const node = renderForFormat(format, data, { qrDataUrl, shortUrl });

  // Allow the share-client to force a download (Content-Disposition: attachment)
  // so browsers save the PNG even when the user middle-clicks or shares via
  // the system share sheet.
  const isDownload = url.searchParams.get("download") === "1";
  const filename = `dinkhub-${data.venue.slug}-${data.dateIso}-${format}.png`;

  try {
    return new ImageResponse(node, {
      width: dim.width,
      height: dim.height,
      ...(fonts ? { fonts } : {}),
      headers: {
        // Edge cache 5min — availability for the picked date changes when
        // bookings come in. Owners regenerating to re-share will bust via
        // ?t=<timestamp> query param when previewing in the dashboard.
        "Cache-Control": "public, max-age=60, s-maxage=300, stale-while-revalidate=600",
        ...(isDownload
          ? { "Content-Disposition": `attachment; filename="${filename}"` }
          : {}),
      },
    });
  } catch (err) {
    captureException(err, {
      scope: "share.og.render",
      extra: { slug, format, date: parsed.data.date },
    });
    return new Response("Image render failed", { status: 500 });
  }
}

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------

interface RenderExtras {
  qrDataUrl: string | null;
  shortUrl: string;
}

function renderForFormat(format: Format, data: ShareCardData, extras: RenderExtras): React.ReactElement {
  switch (format) {
    case "fb":
      return <FbLandscape data={data} extras={extras} />;
    case "ig-square":
      return <IgSquare data={data} extras={extras} />;
    case "ig-portrait":
    default:
      return <IgPortrait data={data} extras={extras} />;
  }
}

// ---------------------------------------------------------------------------
// Shared atoms
// ---------------------------------------------------------------------------

function BrandWordmark({ size }: { size: number }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        fontSize: size,
        fontWeight: 900,
        letterSpacing: "-0.02em",
        lineHeight: 1,
      }}
    >
      <span style={{ color: COLORS.brand, display: "flex" }}>D</span>
      <span style={{ color: COLORS.brand, display: "flex", position: "relative" }}>
        {"\u0131"}
        <span
          style={{
            position: "absolute",
            left: "50%",
            top: -size * 0.18,
            width: size * 0.34,
            height: size * 0.34,
            transform: "translateX(-50%)",
            borderRadius: "50%",
            background: COLORS.accent,
            display: "flex",
            border: `${Math.max(1, size * 0.025)}px solid ${COLORS.accentLight}`,
          }}
        />
      </span>
      <span style={{ color: COLORS.brand, display: "flex" }}>nk</span>
      <span style={{ color: COLORS.accent, display: "flex" }}>Hub</span>
    </div>
  );
}

function HeroBackdrop({
  children,
  borderRadius,
}: {
  children?: React.ReactNode;
  borderRadius?: number;
}) {
  // Brand gradient unconditionally. Satori's image fetching is fragile across
  // formats (WebP/AVIF) and signed URLs, so we don't rely on the venue cover
  // here — the brand-gradient hero always looks crisp and stays on-brand.
  return (
    <div
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        width: "100%",
        height: "100%",
        display: "flex",
        backgroundColor: COLORS.brandDark,
        backgroundImage: `linear-gradient(135deg, ${COLORS.brandDark} 0%, ${COLORS.brand} 50%, ${COLORS.accent} 100%)`,
        borderRadius: borderRadius ?? 0,
        overflow: "hidden",
      }}
    >
      {/* Subtle radial highlight for depth */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          width: "100%",
          height: "100%",
          display: "flex",
          backgroundImage:
            "radial-gradient(ellipse at top right, rgba(255,255,255,0.18) 0%, rgba(255,255,255,0) 55%)",
        }}
      />
      {/* Bottom darken for caption legibility */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          width: "100%",
          height: "100%",
          display: "flex",
          backgroundImage:
            "linear-gradient(180deg, rgba(0,0,0,0) 40%, rgba(0,0,0,0.45) 100%)",
        }}
      />
      {children}
    </div>
  );
}

function SlotPill({
  label,
  scale = 1,
}: {
  label: string;
  scale?: number;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        flexShrink: 0,
        padding: `${14 * scale}px ${22 * scale}px`,
        borderRadius: 999,
        background: "#ffffff",
        border: `2px solid ${COLORS.brandLight}`,
        color: COLORS.brandDark,
        fontWeight: 800,
        fontSize: 32 * scale,
        lineHeight: 1,
        boxShadow: `0 4px 12px ${COLORS.cardShadow}`,
      }}
    >
      {label}
    </div>
  );
}

function FullyBookedBanner({ scale = 1 }: { scale?: number }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: `${20 * scale}px ${28 * scale}px`,
        borderRadius: 16 * scale,
        background: "#fef2f2",
        border: `2px solid #fecaca`,
        color: "#991b1b",
        fontWeight: 800,
        fontSize: 32 * scale,
      }}
    >
      All booked for this day
    </div>
  );
}

function QrBlock({
  qrDataUrl,
  shortUrl,
  size,
}: {
  qrDataUrl: string | null;
  shortUrl: string;
  size: number;
}) {
  // Scale typography + spacing with QR size so the block reads well at any scale.
  const padding = Math.max(12, Math.round(size * 0.07));
  const eyebrowSize = Math.max(18, Math.round(size * 0.11));
  const urlSize = Math.max(22, Math.round(size * 0.13));
  const gap = Math.max(20, Math.round(size * 0.12));
  const maxUrlWidth = Math.max(280, Math.round(size * 2.2));
  return (
    <div style={{ display: "flex", alignItems: "center" }}>
      {qrDataUrl && (
        <div
          style={{
            display: "flex",
            padding,
            background: "#ffffff",
            borderRadius: 20,
            border: `2px solid ${COLORS.brand}`,
            boxShadow: `0 10px 28px ${COLORS.cardShadow}`,
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={qrDataUrl} alt="" width={size} height={size} style={{ display: "block" }} />
        </div>
      )}
      <div
        style={{
          marginLeft: gap,
          display: "flex",
          flexDirection: "column",
        }}
      >
        <span
          style={{
            fontSize: eyebrowSize,
            fontWeight: 800,
            color: COLORS.brandDark,
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            display: "flex",
          }}
        >
          Scan or tap to book
        </span>
        <span
          style={{
            marginTop: 6,
            fontSize: urlSize,
            fontWeight: 800,
            color: COLORS.ink,
            maxWidth: maxUrlWidth,
            lineHeight: 1.2,
            display: "flex",
          }}
        >
          {shortUrl}
        </span>
      </div>
    </div>
  );
}

// Expand merged ranges into hourly chips ("6\u20137 AM"). Caller decides cap.
function expandHourlySlots(ranges: ShareSlotRange[]): string[] {
  const out: string[] = [];
  for (const r of ranges) {
    for (let h = r.startHour; h < r.endHour; h++) out.push(formatHourSlotLabel(h));
  }
  return out;
}

// Chunk an array into N-sized rows so we can manually lay them out (Satori's
// flex-wrap is unreliable for variable-width pill rows inside nested flex).
function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function SlotGrid({
  labels,
  perRow,
  scale,
  extraCount,
}: {
  labels: string[];
  perRow: number;
  scale: number;
  extraCount: number;
}) {
  const rows = chunk(labels, perRow);
  const gap = Math.max(6, Math.round(12 * scale));
  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      {rows.map((row, ri) => (
        <div
          key={ri}
          style={{
            display: "flex",
            flexDirection: "row",
            marginTop: ri === 0 ? 0 : gap,
          }}
        >
          {row.map((label, ci) => (
            <div key={`${label}-${ci}`} style={{ display: "flex", marginRight: ci === row.length - 1 ? 0 : gap }}>
              <SlotPill label={label} scale={scale} />
            </div>
          ))}
        </div>
      ))}
      {extraCount > 0 && (
        <div style={{ display: "flex", marginTop: gap }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              padding: `${10 * scale}px ${18 * scale}px`,
              borderRadius: 999,
              background: COLORS.brand,
              color: "#ffffff",
              fontWeight: 900,
              fontSize: 24 * scale,
            }}
          >
            +{extraCount} more
          </div>
        </div>
      )}
    </div>
  );
}

// "6\u20137 AM", "11 AM\u201312 PM", "11 PM\u201312 AM". Hyphen is U+2013.
function formatHourSlotLabel(startHour: number): string {
  const start = ((startHour % 24) + 24) % 24;
  const end = (start + 1) % 24;
  const startPeriod = start < 12 ? "AM" : "PM";
  const endPeriod = end === 0 || end < 12 ? "AM" : "PM";
  const startDisplay = start % 12 === 0 ? 12 : start % 12;
  const endDisplay = end % 12 === 0 ? 12 : end % 12;
  return startPeriod === endPeriod
    ? `${startDisplay}\u2013${endDisplay} ${endPeriod}`
    : `${startDisplay} ${startPeriod}\u2013${endDisplay} ${endPeriod}`;
}

// Inter's Google Fonts TTF does not include U+20B1 (₱). Render as "PHP " in
// OG images to avoid tofu boxes — formatPHP() is unchanged everywhere else.
function formatPesoForOg(centavos: bigint): string {
  return formatPHP(centavos).replace(/\u20B1/g, "PHP ");
}

function priceSummary(data: ShareCardData): string {
  const all = data.available.flatMap((r) => r.rates);
  if (all.length === 0) {
    return `${formatPesoForOg(data.court.baseHourlyRateCentavos)} / hour`;
  }
  const min = all.reduce((a, b) => (a < b ? a : b));
  const max = all.reduce((a, b) => (a > b ? a : b));
  if (min === max) return `${formatPesoForOg(min)} / hour`;
  return `${formatPesoForOg(min)}\u2009\u2013\u2009${formatPesoForOg(max)} / hour`;
}

function rangesOrFallback(data: ShareCardData): ShareSlotRange[] {
  return data.available;
}

// ---------------------------------------------------------------------------
// Instagram Portrait (1080 x 1350) — primary layout
// ---------------------------------------------------------------------------

function IgPortrait({ data, extras }: { data: ShareCardData; extras: RenderExtras }) {
  const ranges = rangesOrFallback(data);
  return (
    <div
      style={{
        position: "relative",
        width: 1080,
        height: 1350,
        display: "flex",
        flexDirection: "column",
        background: COLORS.paper,
        fontFamily: "Inter",
      }}
    >
      {/* Hero (top 52%) */}
      <div style={{ position: "relative", width: 1080, height: 700, display: "flex" }}>
        <HeroBackdrop />
        {/* Top-left brand + kicker */}
        <div
          style={{
            position: "absolute",
            top: 48,
            left: 56,
            right: 56,
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              padding: "10px 18px",
              borderRadius: 999,
              background: "rgba(255,255,255,0.92)",
              boxShadow: `0 4px 14px ${COLORS.cardShadow}`,
            }}
          >
            <BrandWordmark size={36} />
          </div>
          <div
            style={{
              display: "flex",
              padding: "10px 20px",
              borderRadius: 999,
              background: COLORS.accent,
              color: "#ffffff",
              fontWeight: 800,
              fontSize: 22,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
            }}
          >
            Open Courts
          </div>
        </div>
        {/* Venue name + city overlay (positioned above the card overlap) */}
        <div
          style={{
            position: "absolute",
            left: 56,
            right: 56,
            bottom: 200,
            display: "flex",
            flexDirection: "column",
            color: "#ffffff",
          }}
        >
          <div
            style={{
              fontSize: 24,
              fontWeight: 700,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              color: "#fafaf7",
              opacity: 0.9,
              display: "flex",
            }}
          >
            {data.venue.city}
            {data.venue.province ? `, ${data.venue.province}` : ""}
          </div>
          <div
            style={{
              marginTop: 10,
              fontSize: 64,
              fontWeight: 900,
              lineHeight: 1.05,
              letterSpacing: "-0.02em",
              color: "#ffffff",
              display: "flex",
              textShadow: "0 2px 18px rgba(0,0,0,0.45)",
            }}
          >
            {data.venue.name}
          </div>
        </div>
      </div>

      {/* Card (overlapping hero) */}
      <div
        style={{
          position: "absolute",
          left: 56,
          right: 56,
          top: 620,
          bottom: 56,
          display: "flex",
          flexDirection: "column",
          background: "#ffffff",
          borderRadius: 32,
          padding: 44,
          boxShadow: `0 16px 48px ${COLORS.cardShadow}`,
        }}
      >
        {/* Date row */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <span
              style={{
                fontSize: 22,
                fontWeight: 700,
                color: COLORS.inkMuted,
                letterSpacing: "0.12em",
                textTransform: "uppercase",
              }}
            >
              Available
            </span>
            <span
              style={{
                marginTop: 4,
                fontSize: 44,
                fontWeight: 900,
                color: COLORS.ink,
                letterSpacing: "-0.02em",
                display: "flex",
              }}
            >
              {data.dateLongLabel}
            </span>
          </div>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "flex-end",
              padding: "12px 22px",
              borderRadius: 18,
              background: "#f0fdf4",
              border: `2px solid #bbf7d0`,
            }}
          >
            <span style={{ fontSize: 18, color: COLORS.brandDark, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase" }}>
              {data.court.name}
            </span>
            <span style={{ marginTop: 4, fontSize: 24, color: COLORS.brandDark, fontWeight: 800 }}>
              {priceSummary(data)}
            </span>
          </div>
        </div>

        {/* Hourly slot chips */}
        <div
          style={{
            marginTop: 28,
            display: "flex",
            flex: 1,
            alignItems: "flex-start",
          }}
        >
          {data.fullyUnavailable ? (
            <div style={{ display: "flex", width: "100%", marginTop: 24 }}>
              <FullyBookedBanner scale={1.1} />
            </div>
          ) : (() => {
            const slots = expandHourlySlots(ranges);
            const cap = 12;
            return (
              <SlotGrid
                labels={slots.slice(0, cap)}
                perRow={4}
                scale={0.7}
                extraCount={Math.max(0, slots.length - cap)}
              />
            );
          })()}
        </div>

        {/* Footer: QR + wordmark */}
        <div
          style={{
            marginTop: 20,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            borderTop: `1px solid ${COLORS.border}`,
            paddingTop: 24,
          }}
        >
          <QrBlock qrDataUrl={extras.qrDataUrl} shortUrl={extras.shortUrl} size={200} />
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
            <BrandWordmark size={42} />
            <span
              style={{
                marginTop: 8,
                fontSize: 18,
                color: COLORS.inkMuted,
                fontWeight: 600,
                letterSpacing: "0.04em",
              }}
            >
              Book pickleball courts, instantly.
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Instagram Square (1080 x 1080)
// ---------------------------------------------------------------------------

function IgSquare({ data, extras }: { data: ShareCardData; extras: RenderExtras }) {
  const ranges = rangesOrFallback(data);
  return (
    <div
      style={{
        position: "relative",
        width: 1080,
        height: 1080,
        display: "flex",
        flexDirection: "column",
        background: COLORS.paper,
        fontFamily: "Inter",
      }}
    >
      <div style={{ position: "relative", width: 1080, height: 520, display: "flex" }}>
        <HeroBackdrop />
        <div
          style={{
            position: "absolute",
            top: 40,
            left: 48,
            right: 48,
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", padding: "10px 16px", borderRadius: 999, background: "rgba(255,255,255,0.92)" }}>
            <BrandWordmark size={32} />
          </div>
          <div
            style={{
              display: "flex",
              padding: "10px 18px",
              borderRadius: 999,
              background: COLORS.accent,
              color: "#ffffff",
              fontWeight: 800,
              fontSize: 20,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
            }}
          >
            Open Courts
          </div>
        </div>
        <div
          style={{
            position: "absolute",
            left: 48,
            right: 48,
            bottom: 140,
            display: "flex",
            flexDirection: "column",
            color: "#ffffff",
          }}
        >
          <div
            style={{
              fontSize: 22,
              fontWeight: 700,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              color: "#fafaf7",
              opacity: 0.9,
              display: "flex",
            }}
          >
            {data.venue.city}
          </div>
          <div
            style={{
              marginTop: 8,
              fontSize: 54,
              fontWeight: 900,
              lineHeight: 1.05,
              letterSpacing: "-0.02em",
              color: "#ffffff",
              display: "flex",
              textShadow: "0 2px 16px rgba(0,0,0,0.45)",
            }}
          >
            {data.venue.name}
          </div>
        </div>
      </div>

      <div
        style={{
          position: "absolute",
          left: 48,
          right: 48,
          top: 460,
          bottom: 48,
          display: "flex",
          flexDirection: "column",
          background: "#ffffff",
          borderRadius: 28,
          padding: 36,
          boxShadow: `0 14px 40px ${COLORS.cardShadow}`,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <span
              style={{
                fontSize: 18,
                fontWeight: 700,
                color: COLORS.inkMuted,
                letterSpacing: "0.12em",
                textTransform: "uppercase",
              }}
            >
              Available
            </span>
            <span style={{ marginTop: 4, fontSize: 38, fontWeight: 900, color: COLORS.ink, letterSpacing: "-0.02em", display: "flex" }}>
              {data.dateLongLabel}
            </span>
          </div>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "flex-end",
              padding: "10px 18px",
              borderRadius: 14,
              background: "#f0fdf4",
              border: `2px solid #bbf7d0`,
            }}
          >
            <span style={{ fontSize: 16, color: COLORS.brandDark, fontWeight: 700 }}>{data.court.name}</span>
            <span style={{ marginTop: 2, fontSize: 22, color: COLORS.brandDark, fontWeight: 800 }}>
              {priceSummary(data)}
            </span>
          </div>
        </div>

        <div
          style={{
            marginTop: 22,
            display: "flex",
            flex: 1,
            alignItems: "flex-start",
          }}
        >
          {data.fullyUnavailable ? (
            <div style={{ display: "flex", width: "100%", marginTop: 18 }}>
              <FullyBookedBanner />
            </div>
          ) : (() => {
            const slots = expandHourlySlots(ranges);
            const cap = 12;
            return (
              <SlotGrid
                labels={slots.slice(0, cap)}
                perRow={4}
                scale={0.82}
                extraCount={Math.max(0, slots.length - cap)}
              />
            );
          })()}
        </div>

        <div
          style={{
            marginTop: 18,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            borderTop: `1px solid ${COLORS.border}`,
            paddingTop: 22,
          }}
        >
          <QrBlock qrDataUrl={extras.qrDataUrl} shortUrl={extras.shortUrl} size={180} />
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
            <BrandWordmark size={36} />
            <span style={{ marginTop: 6, fontSize: 16, color: COLORS.inkMuted, fontWeight: 600 }}>
              Book pickleball, instantly.
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Facebook Landscape (1200 x 630)
// ---------------------------------------------------------------------------

function FbLandscape({ data, extras }: { data: ShareCardData; extras: RenderExtras }) {
  const ranges = rangesOrFallback(data);
  return (
    <div
      style={{
        position: "relative",
        width: 1200,
        height: 630,
        display: "flex",
        background: COLORS.paper,
        fontFamily: "Inter",
      }}
    >
      {/* Left hero (50%) */}
      <div style={{ position: "relative", width: 600, height: 630, display: "flex" }}>
        <HeroBackdrop />
        <div
          style={{
            position: "absolute",
            top: 32,
            left: 32,
            display: "flex",
            padding: "8px 14px",
            borderRadius: 999,
            background: "rgba(255,255,255,0.92)",
          }}
        >
          <BrandWordmark size={28} />
        </div>
        <div
          style={{
            position: "absolute",
            left: 32,
            right: 32,
            bottom: 36,
            display: "flex",
            flexDirection: "column",
            color: "#ffffff",
          }}
        >
          <div
            style={{
              display: "flex",
              alignSelf: "flex-start",
              padding: "6px 14px",
              borderRadius: 999,
              background: COLORS.accent,
              color: "#ffffff",
              fontWeight: 800,
              fontSize: 16,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              marginBottom: 14,
            }}
          >
            Open Courts
          </div>
          <div
            style={{
              fontSize: 20,
              fontWeight: 700,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              color: "#fafaf7",
              opacity: 0.9,
              display: "flex",
            }}
          >
            {data.venue.city}
          </div>
          <div
            style={{
              marginTop: 6,
              fontSize: 44,
              fontWeight: 900,
              lineHeight: 1.05,
              letterSpacing: "-0.02em",
              color: "#ffffff",
              display: "flex",
              textShadow: "0 2px 14px rgba(0,0,0,0.45)",
            }}
          >
            {data.venue.name}
          </div>
        </div>
      </div>

      {/* Right card */}
      <div
        style={{
          position: "relative",
          width: 600,
          height: 630,
          display: "flex",
          flexDirection: "column",
          padding: 40,
          background: COLORS.paper,
        }}
      >
        <div style={{ display: "flex", flexDirection: "column" }}>
          <span
            style={{
              fontSize: 16,
              fontWeight: 700,
              color: COLORS.inkMuted,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
            }}
          >
            Available
          </span>
          <span style={{ marginTop: 4, fontSize: 36, fontWeight: 900, color: COLORS.ink, letterSpacing: "-0.02em", display: "flex" }}>
            {data.dateLongLabel}
          </span>
          <div
            style={{
              marginTop: 10,
              display: "flex",
              alignSelf: "flex-start",
              padding: "8px 14px",
              borderRadius: 12,
              background: "#f0fdf4",
              border: `2px solid #bbf7d0`,
              color: COLORS.brandDark,
              fontWeight: 800,
              fontSize: 20,
            }}
          >
            {data.court.name} · {priceSummary(data)}
          </div>
        </div>

        <div
          style={{
            marginTop: 22,
            display: "flex",
            flex: 1,
            alignItems: "flex-start",
          }}
        >
          {data.fullyUnavailable ? (
            <div style={{ display: "flex", width: "100%", marginTop: 12 }}>
              <FullyBookedBanner />
            </div>
          ) : (() => {
            const slots = expandHourlySlots(ranges);
            const cap = 9;
            return (
              <SlotGrid
                labels={slots.slice(0, cap)}
                perRow={3}
                scale={0.7}
                extraCount={Math.max(0, slots.length - cap)}
              />
            );
          })()}
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            borderTop: `1px solid ${COLORS.border}`,
            paddingTop: 18,
          }}
        >
          <QrBlock qrDataUrl={extras.qrDataUrl} shortUrl={extras.shortUrl} size={150} />
        </div>
      </div>
    </div>
  );
}
