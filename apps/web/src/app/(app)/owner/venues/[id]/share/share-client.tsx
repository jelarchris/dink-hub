"use client";

import { useMemo, useState } from "react";
import { Check, Copy, Download, Link as LinkIcon, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";

function FacebookIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      className={className}
    >
      <path d="M22 12a10 10 0 1 0-11.563 9.876v-6.987H7.898V12h2.539V9.798c0-2.506 1.493-3.89 3.776-3.89 1.094 0 2.238.195 2.238.195v2.46h-1.261c-1.243 0-1.63.771-1.63 1.562V12h2.773l-.443 2.89h-2.33v6.987A10.003 10.003 0 0 0 22 12Z" />
    </svg>
  );
}

/**
 * Share-card composer.
 *
 * State:
 * - selected date (ISO YYYY-MM-DD)
 * - selected court id
 * - selected format (fb | ig-portrait | ig-square)
 * - cache-busting nonce (so "Refresh" re-fetches the image after slot data changes)
 *
 * Image src points at /api/og/availability/<slug>?date&court&format. The server
 * route reads only public booking data so no auth is needed and the resulting
 * PNG is shareable as-is.
 */

type Format = "ig-portrait" | "ig-square" | "fb";

const FORMATS: ReadonlyArray<{ id: Format; label: string; sublabel: string; aspect: string }> = [
  { id: "ig-portrait", label: "Instagram Story", sublabel: "1080 × 1350", aspect: "4/5" },
  { id: "ig-square", label: "Instagram Post", sublabel: "1080 × 1080", aspect: "1/1" },
  { id: "fb", label: "Facebook / Link Preview", sublabel: "1200 × 630", aspect: "1200/630" },
];

interface DayChoice {
  isoDate: string;
  label: string;
  isToday: boolean;
}

interface CourtChoice {
  id: string;
  name: string;
}

export interface ShareCardClientProps {
  venueSlug: string;
  venueName: string;
  days: ReadonlyArray<DayChoice>;
  courts: ReadonlyArray<CourtChoice>;
  appUrl: string;
}

export function ShareCardClient({
  venueSlug,
  venueName,
  days,
  courts,
  appUrl,
}: ShareCardClientProps) {
  const [dateIso, setDateIso] = useState<string>(days[1]?.isoDate ?? days[0]!.isoDate);
  const [courtId, setCourtId] = useState<string>(courts[0]!.id);
  const [format, setFormat] = useState<Format>("ig-portrait");
  const [nonce, setNonce] = useState<number>(() => Date.now());

  const imageUrl = useMemo(() => {
    const url = new URL(`/api/og/availability/${encodeURIComponent(venueSlug)}`, appUrl);
    url.searchParams.set("date", dateIso);
    url.searchParams.set("court", courtId);
    url.searchParams.set("format", format);
    url.searchParams.set("t", String(nonce));
    return url.toString();
  }, [appUrl, venueSlug, dateIso, courtId, format, nonce]);

  const downloadUrl = useMemo(() => {
    const u = new URL(imageUrl);
    u.searchParams.set("download", "1");
    return u.toString();
  }, [imageUrl]);

  const bookingUrl = useMemo(() => {
    const url = new URL(`/venues/${encodeURIComponent(venueSlug)}/book`, appUrl);
    url.searchParams.set("date", dateIso);
    url.searchParams.set("court", courtId);
    return url.toString();
  }, [appUrl, venueSlug, dateIso, courtId]);

  const selectedDayLabel =
    days.find((d) => d.isoDate === dateIso)?.label ?? dateIso;
  const selectedCourtName =
    courts.find((c) => c.id === courtId)?.name ?? "Court";

  const caption = useMemo(() => {
    return (
      `🏓 Open courts at ${venueName} — ${selectedDayLabel} (${selectedCourtName})\n` +
      `Grab a slot before they go:\n${bookingUrl}\n\n` +
      `#pickleballPH #DinkHub`
    );
  }, [venueName, selectedDayLabel, selectedCourtName, bookingUrl]);

  const fbShareUrl = useMemo(() => {
    const u = new URL("https://www.facebook.com/sharer/sharer.php");
    u.searchParams.set("u", bookingUrl);
    return u.toString();
  }, [bookingUrl]);

  return (
    <div className="mt-4 grid gap-5 lg:grid-cols-[1fr_360px]">
      {/* Preview */}
      <div className="flex flex-col">
        <div className="mb-2 flex items-center justify-between">
          <FormatTabs value={format} onChange={setFormat} />
          <button
            type="button"
            onClick={() => setNonce(Date.now())}
            className="inline-flex items-center gap-1.5 rounded-md border border-[var(--color-border-default)] bg-[var(--color-bg)] px-2.5 py-1.5 text-xs font-semibold text-[var(--color-fg-muted)] hover:bg-[var(--color-bg-muted)]"
            title="Re-render with fresh availability"
          >
            <RefreshCw className="size-3.5" /> Refresh
          </button>
        </div>
        <PreviewFrame format={format} imageUrl={imageUrl} />
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <a
            href={downloadUrl}
            download={`dinkhub-${venueSlug}-${dateIso}-${format}.png`}
            className="inline-flex h-10 items-center gap-2 rounded-[var(--radius-md)] bg-[var(--color-brand-600)] px-4 text-sm font-semibold text-white shadow-sm hover:bg-[var(--color-brand-700)]"
          >
            <Download className="size-4" /> Download image
          </a>
          <a
            href={fbShareUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-10 items-center gap-2 rounded-[var(--radius-md)] bg-[#1877F2] px-4 text-sm font-semibold text-white shadow-sm hover:opacity-90"
          >
            <FacebookIcon className="size-4" /> Share to Facebook
          </a>
          <CopyChip label="Copy booking link" value={bookingUrl} icon={<LinkIcon className="size-4" />} />
        </div>
        <p className="mt-2 text-xs text-[var(--color-fg-muted)]">
          Facebook Share opens the share dialog where you pick the page or group to post to.
          Tip: download the image first, then attach it inside the FB dialog so the preview is your branded card,
          not the auto-generated link card.
        </p>
      </div>

      {/* Controls + caption */}
      <div className="flex flex-col gap-4">
        <ControlGroup label="Date">
          <div className="flex flex-wrap gap-1.5">
            {days.slice(0, 7).map((d) => (
              <button
                key={d.isoDate}
                type="button"
                onClick={() => setDateIso(d.isoDate)}
                className={cn(
                  "flex flex-col items-center rounded-lg border px-3 py-2 text-xs font-semibold transition",
                  d.isoDate === dateIso
                    ? "border-[var(--color-brand-600)] bg-[var(--color-brand-500)]/10 text-[var(--color-brand-700)]"
                    : "border-[var(--color-border-default)] bg-[var(--color-bg)] text-[var(--color-fg-muted)] hover:border-[var(--color-border-strong)]",
                )}
              >
                <span className="text-[10px] uppercase tracking-wider opacity-75">{d.label}</span>
                <span className="mt-0.5 text-sm font-bold tabular-nums">{d.isoDate.slice(5)}</span>
              </button>
            ))}
          </div>
          <input
            type="date"
            value={dateIso}
            min={days[0]?.isoDate}
            max={days[days.length - 1]?.isoDate}
            onChange={(e) => setDateIso(e.currentTarget.value)}
            className="mt-2 h-9 w-full rounded-md border border-[var(--color-border-default)] bg-[var(--color-bg)] px-2 text-sm"
          />
        </ControlGroup>

        <ControlGroup label="Court">
          <div className="flex flex-wrap gap-1.5">
            {courts.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setCourtId(c.id)}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-xs font-semibold transition",
                  c.id === courtId
                    ? "border-[var(--color-brand-600)] bg-[var(--color-brand-500)]/10 text-[var(--color-brand-700)]"
                    : "border-[var(--color-border-default)] bg-[var(--color-bg)] text-[var(--color-fg-muted)] hover:border-[var(--color-border-strong)]",
                )}
              >
                {c.name}
              </button>
            ))}
          </div>
        </ControlGroup>

        <ControlGroup label="Caption">
          <textarea
            value={caption}
            readOnly
            rows={6}
            className="w-full resize-none rounded-md border border-[var(--color-border-default)] bg-[var(--color-bg)] p-2.5 text-xs leading-relaxed"
            onFocus={(e) => e.currentTarget.select()}
          />
          <div className="mt-1.5">
            <CopyChip label="Copy caption" value={caption} icon={<Copy className="size-4" />} />
          </div>
        </ControlGroup>
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------------

function ControlGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-[var(--color-border-default)] bg-[var(--color-bg)] p-3">
      <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--color-fg-subtle)]">
        {label}
      </div>
      {children}
    </div>
  );
}

function FormatTabs({ value, onChange }: { value: Format; onChange: (v: Format) => void }) {
  return (
    <div className="inline-flex rounded-lg border border-[var(--color-border-default)] bg-[var(--color-bg)] p-1">
      {FORMATS.map((f) => (
        <button
          key={f.id}
          type="button"
          onClick={() => onChange(f.id)}
          className={cn(
            "rounded-md px-3 py-1.5 text-xs font-semibold transition",
            value === f.id
              ? "bg-[var(--color-brand-600)] text-white shadow-sm"
              : "text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]",
          )}
        >
          <div className="leading-tight">{f.label}</div>
          <div className="text-[10px] font-normal opacity-75">{f.sublabel}</div>
        </button>
      ))}
    </div>
  );
}

function PreviewFrame({ format, imageUrl }: { format: Format; imageUrl: string }) {
  const aspect =
    format === "ig-portrait" ? "4 / 5" : format === "ig-square" ? "1 / 1" : "1200 / 630";
  const maxWidth =
    format === "ig-portrait" ? 460 : format === "ig-square" ? 540 : 720;
  return (
    <div
      className="overflow-hidden rounded-xl border border-[var(--color-border-default)] bg-[var(--color-bg-muted)] shadow-sm"
      style={{ aspectRatio: aspect, maxWidth, width: "100%" }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        key={imageUrl}
        src={imageUrl}
        alt="Share card preview"
        className="block h-full w-full object-contain"
      />
    </div>
  );
}

function CopyChip({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
}) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    if (!navigator.clipboard) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      // best-effort
    }
  }
  return (
    <button
      type="button"
      onClick={copy}
      className="inline-flex h-10 items-center gap-2 rounded-[var(--radius-md)] border border-[var(--color-border-strong)] bg-[var(--color-bg)] px-3 text-sm font-semibold text-[var(--color-fg)] hover:bg-[var(--color-bg-muted)]"
    >
      {copied ? <Check className="size-4 text-[var(--color-brand-600)]" /> : icon}
      {copied ? "Copied" : label}
    </button>
  );
}

// Keep Button import alive in case we swap CopyChip later.
void Button;
