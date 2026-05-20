"use client";

import { useActionState, useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { getRateForHour } from "@/lib/court-rate";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  AlertTriangle,
  Check,
  Clock,
  Loader2,
  Trophy,
  Upload,
  X,
  Zap,
} from "lucide-react";
import {
  cancelBookingAction,
  startBookingReturningIdAction,
} from "@/features/booking/actions";
import { submitReceiptAction } from "@/features/booking/payment-actions";
import { previewVoucherAction } from "@/features/vouchers/actions";
import type { ActionResult } from "@/features/auth";
import { SubmitButton } from "@/components/ui/submit-button";
import { Alert } from "@/components/ui/alert";
import { CopyButton } from "@/components/ui/copy-button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/cn";
import { addMinutes, formatTimeManila, generateDaySlotsManila } from "@/lib/date";
import { formatPHP } from "@/lib/money";

const SLOT_MINUTES = 60;
const MAX_SLOTS = 4; // server enforces 4-hour max
const TIMER_START = 15 * 60; // 15 minutes

const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];
// UTC offset for Manila (UTC+8, no DST) — used for wall-clock hour lookups.
const MANILA_OFFSET_MS = 8 * 3_600_000;

type FlowStep = "picker" | "step1" | "step2";

export interface BookingFlowProps {
  venueSlug: string;
  venueName: string;
  gcashAccountName: string | null;
  gcashAccountNumber: string | null;
  /** bigint serialised — convert with BigInt() for arithmetic. */
  systemFeeEstimateCentavos: string;
  playerName: string;
  playerEmail: string;
  playerPhone: string;
  /** When false, Continue redirects to sign-up with current pick preserved in URL. */
  isAuthenticated: boolean;
  days: ReadonlyArray<{ isoDate: string; label: string; isToday: boolean }>;
  courts: ReadonlyArray<{
    id: string;
    name: string;
    surface: string;
    isIndoor: boolean;
    /** bigint serialised — convert with BigInt() before arithmetic. */
    hourlyRateCentavos: string;
    openHour: number;
    closeHour: number;
    imageUrl: string | null;
    rateBands: ReadonlyArray<{ fromHour: number; toHour: number; rateCentavos: string }>;
  }>;
  /** Occupancy for ALL courts across the full 14-day window. */
  occupancy: ReadonlyArray<{ courtId: string; startAtIso: string; endAtIso: string; kind: "booking" | "hold" | "closure" }>;
  /**
   * Open Play sessions overlapping the visible window — one row per
   * (session, court). Used to render multi-hour OPEN PLAY tiles in the picker
   * with a CTA linking out to the join flow.
   */
  openPlay?: ReadonlyArray<{
    sessionId: string;
    courtId: string;
    startAtIso: string;
    endAtIso: string;
    title: string;
    capacity: number;
    activeSignupCount: number;
    /** bigint serialised. */
    pricePerPlayerCentavos: string;
  }>;
}

interface OccupiedRange {
  start: number;
  end: number;
  kind: "booking" | "hold" | "closure";
}

interface OpenPlayRange {
  sessionId: string;
  start: number;
  end: number;
  title: string;
  capacity: number;
  activeSignupCount: number;
  pricePerPlayerCentavos: bigint;
}

export function BookingFlow({
  venueSlug,
  venueName,
  gcashAccountName,
  gcashAccountNumber,
  systemFeeEstimateCentavos,
  playerName,
  playerEmail,
  playerPhone,
  isAuthenticated,
  days,
  courts,
  occupancy,
  openPlay = [],
}: BookingFlowProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  // Snapshot URL params once on mount — used to restore picker state after a
  // guest returns from /sign-up. We intentionally do NOT depend on
  // searchParams reactively; later we router.replace() to clean the URL.
  const initialFromUrl = useMemo(
    () => ({
      court: searchParams.get("court"),
      date: searchParams.get("date"),
      start: searchParams.get("start"),
      count: searchParams.get("count"),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  // ---------------------------------------------------------------------------
  // Slot picker state
  // ---------------------------------------------------------------------------
  const [selectedCourtId, setSelectedCourtId] = useState<string>(() => {
    const c = initialFromUrl.court;
    return c && courts.some((x) => x.id === c) ? c : courts[0]!.id;
  });
  const [selectedDateIso, setSelectedDateIso] = useState<string>(() => {
    const d = initialFromUrl.date;
    return d && days.some((x) => x.isoDate === d) ? d : days[0]!.isoDate;
  });
  // Lazy initialisers: if the URL carried a previously picked slot (set by the
  // guest auth gate before sign-up), restore it ONLY if every slot is still
  // available on the now-selected court+date. Otherwise start empty.
  const [restoredPick] = useState<{ startIso: string; count: number } | null>(() => {
    const { start: startStr, count: countStr, court: courtFromUrl } = initialFromUrl;
    if (!startStr || !countStr) return null;
    const startMs = new Date(startStr).getTime();
    if (!Number.isFinite(startMs)) return null;
    const count = Math.min(Math.max(Number.parseInt(countStr, 10) || 0, 1), MAX_SLOTS);
    if (count === 0) return null;
    const courtId =
      courtFromUrl && courts.some((x) => x.id === courtFromUrl) ? courtFromUrl : courts[0]!.id;
    const nowMs = Date.now();
    for (const r of occupancy) {
      if (r.courtId !== courtId) continue;
      const rs = new Date(r.startAtIso).getTime();
      const re = new Date(r.endAtIso).getTime();
      for (let i = 0; i < count; i++) {
        const s = startMs + i * SLOT_MINUTES * 60_000;
        const e = s + SLOT_MINUTES * 60_000;
        if (s <= nowMs) return null;
        if (rs < e && re > s) return null;
      }
    }
    return { startIso: new Date(startMs).toISOString(), count };
  });
  const [pickedStartIso, setPickedStartIso] = useState<string | null>(restoredPick?.startIso ?? null);
  const [pickedCount, setPickedCount] = useState<number>(restoredPick?.count ?? 0);

  // ---------------------------------------------------------------------------
  // Modal flow state
  // ---------------------------------------------------------------------------
  const [step, setStep] = useState<FlowStep>("picker");
  const [bookingId, setBookingId] = useState<string | null>(null);
  const [createdTotalCentavos, setCreatedTotalCentavos] = useState<bigint | null>(null);
  const [createdCourtFeeCentavos, setCreatedCourtFeeCentavos] = useState<bigint | null>(null);
  const [createdSystemFeeCentavos, setCreatedSystemFeeCentavos] = useState<bigint | null>(null);

  // Player detail fields (editable in step 1)
  const [editName, setEditName] = useState(playerName);
  const [editEmail, setEditEmail] = useState(playerEmail);
  const [editPhone, setEditPhone] = useState(playerPhone);

  // Step 1 → Step 2 transition
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Voucher state (Step 1)
  const [voucherInput, setVoucherInput] = useState("");
  const [appliedVoucher, setAppliedVoucher] = useState<{
    code: string;
    label: string;
    discountCentavos: bigint;
    baseSystemFeeCentavos: bigint;
    discountedSystemFeeCentavos: bigint;
  } | null>(null);
  const [voucherChecking, setVoucherChecking] = useState(false);
  const [voucherError, setVoucherError] = useState<string | null>(null);

  // ---------------------------------------------------------------------------
  // Timer
  // ---------------------------------------------------------------------------
  const [timerSeconds, setTimerSeconds] = useState(TIMER_START);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (step === "picker") {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      return;
    }
    if (timerRef.current) return; // already ticking
    timerRef.current = setInterval(() => {
      setTimerSeconds((prev) => {
        if (prev <= 1) {
          if (timerRef.current) clearInterval(timerRef.current);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [step]);

  const timerMins = Math.floor(timerSeconds / 60);
  const timerSecs = String(timerSeconds % 60).padStart(2, "0");
  const timerLabel = `${String(timerMins)}:${timerSecs}`;
  const timerUrgent = timerSeconds <= 120;

  // ---------------------------------------------------------------------------
  // Receipt upload state (step 2) — hooks must be unconditional
  // ---------------------------------------------------------------------------
  const [receiptState, receiptFormAction] = useActionState<ActionResult | null, FormData>(
    submitReceiptAction,
    null,
  );
  const [fileError, setFileError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [confirmDetail, setConfirmDetail] = useState(false);
  const [confirmTerms, setConfirmTerms] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const receiptFieldErrors =
    receiptState && !receiptState.ok ? receiptState.fieldErrors : undefined;
  const receiptFormError =
    receiptState && !receiptState.ok && receiptState.code !== "validation_failed"
      ? receiptState.message
      : undefined;

  useEffect(() => {
    if (!receiptState?.ok || !bookingId) return;
    startTransition(() => {
      router.push("/me/bookings");
    });
  }, [receiptState, bookingId, router, startTransition]);

  // ---------------------------------------------------------------------------
  // Derived slot picker values
  // ---------------------------------------------------------------------------
  const selectedCourt = courts.find((c) => c.id === selectedCourtId) ?? courts[0]!;
  const baseHourlyRate = BigInt(selectedCourt.hourlyRateCentavos);
  // Rate bands as bigint — memoised so useCallback deps are stable.
  const courtRateBands = useMemo(
    () =>
      selectedCourt.rateBands.map((b) => ({
        fromHour: b.fromHour,
        toHour: b.toHour,
        rateCentavos: BigInt(b.rateCentavos),
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selectedCourtId],
  );
  // Each slot may fall in a different rate band — compute per slot.
  const getPriceForSlot = useCallback(
    (slotMs: number): bigint => {
      const hour = new Date(slotMs + MANILA_OFFSET_MS).getUTCHours();
      const hourly = getRateForHour(courtRateBands, hour, baseHourlyRate);
      return (BigInt(SLOT_MINUTES) * hourly) / 60n;
    },
    [courtRateBands, baseHourlyRate],
  );
  // Total = sum of each individual picked slot's rate (handles band crossings).
  const totalPriceCentavos = useMemo(() => {
    if (!pickedStartIso || pickedCount === 0) return 0n;
    const startMs = new Date(pickedStartIso).getTime();
    let total = 0n;
    for (let i = 0; i < pickedCount; i++) {
      total += getPriceForSlot(startMs + i * SLOT_MINUTES * 60_000);
    }
    return total;
  }, [pickedStartIso, pickedCount, getPriceForSlot]);
  const estimatedSystemFee = BigInt(systemFeeEstimateCentavos);
  const estimatedTotal = totalPriceCentavos + estimatedSystemFee;

  // Index occupancy once: courtId -> sorted ranges (millis).
  const occupancyByCourt = useMemo(() => {
    const map = new Map<string, OccupiedRange[]>();
    for (const r of occupancy) {
      const arr = map.get(r.courtId) ?? [];
      arr.push({ start: new Date(r.startAtIso).getTime(), end: new Date(r.endAtIso).getTime(), kind: r.kind });
      map.set(r.courtId, arr);
    }
    return map;
  }, [occupancy]);

  // Index open-play sessions once: courtId -> ranges.
  const openPlayByCourt = useMemo(() => {
    const map = new Map<string, OpenPlayRange[]>();
    for (const r of openPlay) {
      const arr = map.get(r.courtId) ?? [];
      arr.push({
        sessionId: r.sessionId,
        start: new Date(r.startAtIso).getTime(),
        end: new Date(r.endAtIso).getTime(),
        title: r.title,
        capacity: r.capacity,
        activeSignupCount: r.activeSignupCount,
        pricePerPlayerCentavos: BigInt(r.pricePerPlayerCentavos),
      });
      map.set(r.courtId, arr);
    }
    return map;
  }, [openPlay]);

  // ---------------------------------------------------------------------------
  // After mount, if the URL carried restore params, strip the query string so
  // reloads don't carry stale picker state. The actual restoration happened
  // synchronously in the useState initialisers above.
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const hadAny =
      initialFromUrl.court || initialFromUrl.date || initialFromUrl.start || initialFromUrl.count;
    if (!hadAny) return;
    router.replace(`/venues/${venueSlug}/book`, { scroll: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const slots = useMemo(
    () =>
      generateDaySlotsManila({
        isoDate: selectedDateIso,
        startHour: selectedCourt?.openHour ?? 6,
        endHour: selectedCourt?.closeHour ?? 22,
      }).filter((d) => d.getMinutes() === 0),
    [selectedDateIso, selectedCourt?.openHour, selectedCourt?.closeHour],
  );

  const [now] = useState(() => Date.now());
  const courtRanges = occupancyByCourt.get(selectedCourtId) ?? [];
  const courtOpenPlay = openPlayByCourt.get(selectedCourtId) ?? [];

  function isAvailable(slotStart: Date): boolean {
    const start = slotStart.getTime();
    const end = start + SLOT_MINUTES * 60_000;
    if (start <= now) return false;
    for (const r of courtRanges) {
      if (r.start < end && r.end > start) return false;
    }
    return true;
  }

  const pickedDateLabel =
    days.find((d) => d.isoDate === selectedDateIso)?.label ?? selectedDateIso;
  const pickedStartDate = pickedStartIso ? new Date(pickedStartIso) : null;
  // Derived once — reused in both the slot map and the footer bar.
  const pickedStartMs = pickedStartDate ? pickedStartDate.getTime() : null;
  const pickedEndDate =
    pickedStartDate && pickedCount > 0
      ? addMinutes(pickedStartDate, SLOT_MINUTES * pickedCount)
      : null;
  const pickedEndMs = pickedEndDate ? pickedEndDate.getTime() : null;
  const canContinue = pickedStartIso !== null && pickedCount > 0;

  function pickCourt(id: string): void {
    if (id === selectedCourtId) return;
    setSelectedCourtId(id);
    setPickedStartIso(null);
    setPickedCount(0);
  }
  function pickDate(iso: string): void {
    if (iso === selectedDateIso) return;
    setSelectedDateIso(iso);
    setPickedStartIso(null);
    setPickedCount(0);
  }

  /**
   * Multi-slot selection rules (contiguous, max 4):
   *   - empty → pick this slot (count=1)
   *   - clicking the slot immediately AFTER the current end → extend (if available, < MAX)
   *   - clicking the slot immediately BEFORE the current start → prepend (if available, < MAX)
   *   - clicking the LAST selected slot → shrink by 1 (deselect tail)
   *   - clicking the FIRST selected slot when count > 1 → shrink from head
   *   - clicking inside the middle of selection → reset to single
   *   - clicking any non-adjacent available slot → reset to single
   */
  function pickSlot(slotStart: Date): void {
    const slotMs = slotStart.getTime();
    if (pickedStartIso === null || pickedCount === 0) {
      setPickedStartIso(slotStart.toISOString());
      setPickedCount(1);
      return;
    }
    const startMs = new Date(pickedStartIso).getTime();
    const endMs = startMs + pickedCount * SLOT_MINUTES * 60_000;
    const lastSlotStartMs = endMs - SLOT_MINUTES * 60_000;
    const nextAfterMs = endMs;
    const prevBeforeMs = startMs - SLOT_MINUTES * 60_000;

    if (slotMs === lastSlotStartMs && pickedCount > 1) {
      setPickedCount(pickedCount - 1);
      return;
    }
    if (slotMs === startMs && pickedCount === 1) {
      // toggle off
      setPickedStartIso(null);
      setPickedCount(0);
      return;
    }
    if (slotMs === startMs && pickedCount > 1) {
      // shrink from head
      setPickedStartIso(new Date(startMs + SLOT_MINUTES * 60_000).toISOString());
      setPickedCount(pickedCount - 1);
      return;
    }
    if (slotMs === nextAfterMs && pickedCount < MAX_SLOTS && isAvailable(slotStart)) {
      setPickedCount(pickedCount + 1);
      return;
    }
    if (slotMs === prevBeforeMs && pickedCount < MAX_SLOTS && isAvailable(slotStart)) {
      setPickedStartIso(slotStart.toISOString());
      setPickedCount(pickedCount + 1);
      return;
    }
    // Inside selection or non-adjacent. Guard: a mid-selection slot can become
    // unavailable if a hold expires while the page is open. In that case clear
    // rather than create a booking for a taken slot.
    if (!isAvailable(slotStart)) {
      setPickedStartIso(null);
      setPickedCount(0);
      return;
    }
    setPickedStartIso(slotStart.toISOString());
    setPickedCount(1);
  }

  /**
   * Compact range label for a 1-hour slot, e.g. "6 – 7 PM" or "11 AM – 12 PM".
   * Parses `formatTimeManila` output robustly: case-insensitive AM/PM, handles
   * dot-separated variants ("a.m.") and narrow no-break spaces (\u202F) that
   * some ICU versions emit before the period designator.
   */
  function slotRangeLabel(start: Date): string {
    const end = addMinutes(start, SLOT_MINUTES);
    const startLabel = formatTimeManila(start);
    const endLabel = formatTimeManila(end);
    // Detect period regardless of case or dot-separation
    const isPm = (s: string) => /p\.?m\.?/i.test(s);
    const startPeriod = isPm(startLabel) ? "PM" : "AM";
    const endPeriod = isPm(endLabel) ? "PM" : "AM";
    // Strip the period designator (and any preceding whitespace incl. \u202F)
    const stripPeriod = (s: string) => s.replace(/[\s\u202f]*[ap]\.?m\.?\s*$/i, "").trim();
    // Strip trailing ":00" (whole hours have no meaningful minute display)
    const stripMins = (s: string) => s.replace(/:00$/, "");
    const startCore = stripMins(stripPeriod(startLabel));
    const endCore = stripMins(stripPeriod(endLabel));
    return startPeriod === endPeriod
      ? `${startCore} – ${endCore} ${endPeriod}`
      : `${startCore} ${startPeriod} – ${endCore} ${endPeriod}`;
  }

  // ---------------------------------------------------------------------------
  // Modal handlers
  // ---------------------------------------------------------------------------
  function openModal(): void {
    setStep("step1");
    setTimerSeconds(TIMER_START);
  }

  /**
   * Guest gate: unauthenticated users hitting Continue are sent to /sign-up
   * with their current selection preserved in the `next` URL. After signup
   * (or sign-in) they land back here and the picker auto-restores the slot.
   */
  function handleContinue(): void {
    if (!canContinue || !pickedStartIso) return;
    if (isAuthenticated) {
      openModal();
      return;
    }
    const qs = new URLSearchParams({
      court: selectedCourtId,
      date: selectedDateIso,
      start: pickedStartIso,
      count: String(pickedCount),
    });
    const returnTo = `${pathname}?${qs.toString()}`;
    router.push(`/sign-up?next=${encodeURIComponent(returnTo)}`);
  }

  function closeModal(): void {
    if (step === "step2" && bookingId) {
      // Best-effort cancel — fire and forget; the booking will auto-expire anyway
      const form = new FormData();
      form.set("bookingId", bookingId);
      void cancelBookingAction(null, form);
    }
    setStep("picker");
    setBookingId(null);
    setCreatedTotalCentavos(null);
    setCreatedCourtFeeCentavos(null);
    setCreatedSystemFeeCentavos(null);
    setCreateError(null);
    setFileName(null);
    setFileError(null);
    setConfirmDetail(false);
    setConfirmTerms(false);
    setVoucherInput("");
    setAppliedVoucher(null);
    setVoucherError(null);
    setVoucherChecking(false);
  }

  async function applyVoucher(): Promise<void> {
    const code = voucherInput.trim();
    if (!code || !pickedStartIso || !pickedEndDate) return;
    setVoucherChecking(true);
    setVoucherError(null);
    const startMs = new Date(pickedStartIso).getTime();
    const endMs = pickedEndDate.getTime();
    const durationMinutes = Math.round((endMs - startMs) / 60_000);
    const startManilaHour = new Date(startMs + 8 * 3_600_000).getUTCHours();
    const form = new FormData();
    form.set("code", code);
    form.set("courtId", selectedCourtId);
    form.set("durationMinutes", String(durationMinutes));
    form.set("startManilaHour", String(startManilaHour));
    const result = await previewVoucherAction(null, form);
    setVoucherChecking(false);
    if (!result.ok) {
      setAppliedVoucher(null);
      setVoucherError(result.message);
      return;
    }
    setAppliedVoucher({
      code: result.data.code,
      label: result.data.label,
      discountCentavos: BigInt(result.data.discountCentavos),
      baseSystemFeeCentavos: BigInt(result.data.baseSystemFeeCentavos),
      discountedSystemFeeCentavos: BigInt(result.data.discountedSystemFeeCentavos),
    });
  }

  function clearVoucher(): void {
    setAppliedVoucher(null);
    setVoucherInput("");
    setVoucherError(null);
  }

  async function proceedToPayment(): Promise<void> {
    if (!pickedStartIso || !pickedEndDate) return;
    setIsCreating(true);
    setCreateError(null);
    const form = new FormData();
    form.set("venueSlug", venueSlug);
    form.set("courtId", selectedCourtId);
    form.set("startAt", pickedStartIso);
    form.set("endAt", pickedEndDate.toISOString());
    if (appliedVoucher) form.set("voucherCode", appliedVoucher.code);
    // Per-booking notification email override. Only sent when the player
    // edited the email to something different from their account email.
    // The server validates the format; account email is left untouched.
    const trimmedEmail = editEmail.trim();
    if (
      trimmedEmail.length > 0 &&
      trimmedEmail.toLowerCase() !== playerEmail.trim().toLowerCase()
    ) {
      form.set("contactEmail", trimmedEmail);
    }
    const result = await startBookingReturningIdAction(form);
    setIsCreating(false);
    if (!result.ok) {
      setCreateError(result.message);
      return;
    }
    setBookingId(result.data.bookingId);
    setCreatedTotalCentavos(BigInt(result.data.totalCentavos));
    setCreatedCourtFeeCentavos(BigInt(result.data.courtFeeCentavos));
    setCreatedSystemFeeCentavos(BigInt(result.data.systemFeeCentavos));
    setStep("step2");
  }

  function onFilePick(): void {
    const f = fileRef.current?.files?.[0];
    if (!f) { setFileName(null); setFileError(null); return; }
    if (!ALLOWED_TYPES.includes(f.type)) { setFileError("Use a JPEG, PNG or WebP image"); setFileName(f.name); return; }
    if (f.size > MAX_BYTES) { setFileError("File must be 5 MB or smaller"); setFileName(f.name); return; }
    setFileError(null);
    setFileName(f.name);
  }

  const canSubmitReceipt =
    confirmDetail && confirmTerms && fileName !== null && fileError === null;

  // Amounts shown in modal — use snapshotted values once booking is created (step 2).
  // Before booking creation (step 1), apply any previewed voucher discount.
  const displayCourtFee = createdCourtFeeCentavos ?? totalPriceCentavos;
  const displaySystemFee =
    createdSystemFeeCentavos ??
    (appliedVoucher ? appliedVoucher.discountedSystemFeeCentavos : estimatedSystemFee);
  const displayTotal =
    createdTotalCentavos ?? (totalPriceCentavos + displaySystemFee);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  return (
    <>
      {/* Slot picker */}
      <div className="pb-24">
        <Section label="Select court">
          <div className="-mx-4 flex snap-x snap-mandatory gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
            {courts.map((c) => (
              <CourtCard
                key={c.id}
                court={c}
                selected={c.id === selectedCourtId}
                onSelect={() => pickCourt(c.id)}
              />
            ))}
          </div>
        </Section>

        <Section label="Select date">
          <div className="-mx-4 flex snap-x snap-mandatory gap-1.5 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
            {days.map((d) => (
              <DateChip
                key={d.isoDate}
                isoDate={d.isoDate}
                label={d.label}
                selected={d.isoDate === selectedDateIso}
                onSelect={() => pickDate(d.isoDate)}
              />
            ))}
          </div>
        </Section>

        <Section
          label={`Select time · ${pickedDateLabel}`}
          hint="Tap adjacent slots to book multiple hours (max 4)"
        >
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
            {(() => {
              // Track slot start-ms covered by an already-rendered open-play
              // tile so we skip those hours instead of double-rendering.
              const consumed = new Set<number>();
              return slots.map((s) => {
              const iso = s.toISOString();
              const slotStartMs = s.getTime();
              const slotEndMs = slotStartMs + SLOT_MINUTES * 60_000;

              // Is this slot the FIRST hour of an open-play session on this
              // court? If so, render a wide animated OPEN PLAY tile spanning
              // the session duration and mark subsequent hours as consumed.
              if (!consumed.has(slotStartMs)) {
                const op = courtOpenPlay.find((r) => r.start === slotStartMs);
                if (op) {
                  const durationHours = Math.max(
                    1,
                    Math.round((op.end - op.start) / (SLOT_MINUTES * 60_000)),
                  );
                  for (let i = 1; i < durationHours; i++) {
                    consumed.add(slotStartMs + i * SLOT_MINUTES * 60_000);
                  }
                  const span = Math.min(durationHours, 4);
                  const spotsLeft = Math.max(0, op.capacity - op.activeSignupCount);
                  const isFull = spotsLeft === 0;
                  const isPast = op.end <= now;
                  const disabled = isFull || isPast;
                  return (
                    <button
                      key={iso}
                      type="button"
                      disabled={disabled}
                      onClick={() => {
                        if (!disabled) router.push(`/open-play/${op.sessionId}`);
                      }}
                      style={{ gridColumn: `span ${span} / span ${span}` }}
                      className={cn(
                        "op-tile group relative overflow-hidden rounded-[var(--radius-md)] px-3 py-3 text-left transition active:scale-[0.98]",
                        "bg-gradient-to-br from-violet-700 via-violet-600 to-fuchsia-600",
                        "text-white shadow-[0_6px_18px_-6px_rgba(124,58,237,0.55)]",
                        "ring-2 ring-violet-400/60 hover:ring-fuchsia-300/80",
                        "hover:shadow-[0_10px_24px_-6px_rgba(217,70,239,0.6)]",
                        disabled && "cursor-not-allowed opacity-70",
                      )}
                      title={op.title}
                    >
                      {/* animated top edge — readable; never overlays text */}
                      <span
                        aria-hidden
                        className="pointer-events-none absolute inset-x-0 top-0 h-[3px] motion-safe:op-shimmer bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.95),transparent)] [background-size:50%_100%]"
                      />
                      <div className="relative flex items-center justify-between gap-2">
                        <span className="inline-flex items-center gap-1 rounded-full bg-white/95 px-1.5 py-px text-[10px] font-extrabold uppercase tracking-wide text-violet-700 shadow-sm">
                          <Zap className="size-3" /> Open Play
                        </span>
                        <span
                          className={cn(
                            "inline-flex items-center gap-1 rounded-full px-1.5 py-px text-[10px] font-bold",
                            isFull
                              ? "bg-red-500 text-white"
                              : "bg-emerald-400 text-emerald-950",
                          )}
                        >
                          {isFull ? "Full" : `${spotsLeft} spots`}
                        </span>
                      </div>
                      <div className="relative mt-1.5 truncate text-sm font-bold leading-tight text-white drop-shadow-sm">
                        {op.title}
                      </div>
                      <div className="relative mt-0.5 text-[11px] font-semibold text-white/90">
                        {formatTimeManila(new Date(op.start))}–{formatTimeManila(new Date(op.end))}
                        <span className="ml-1 text-white/70">({durationHours}h)</span>
                      </div>
                      <div className="relative mt-2 h-1 w-full overflow-hidden rounded-full bg-white/20">
                        <div
                          className="h-full bg-gradient-to-r from-fuchsia-300 to-amber-300 transition-[width]"
                          style={{
                            width: `${Math.min(100, Math.round((op.activeSignupCount / op.capacity) * 100))}%`,
                          }}
                        />
                      </div>
                      <div className="relative mt-1.5 flex items-center justify-between text-[11px]">
                        <span className="font-bold text-white">
                          {formatPHP(op.pricePerPlayerCentavos)}/player
                        </span>
                        <span className="font-bold text-white group-hover:underline">
                          Reserve →
                        </span>
                      </div>
                    </button>
                  );
                }
              }

              if (consumed.has(slotStartMs)) return null;

              const available = isAvailable(s);
              const isPicked =
                pickedStartMs !== null &&
                pickedEndMs !== null &&
                slotStartMs >= pickedStartMs &&
                slotStartMs < pickedEndMs;
              // Reason a slot is unavailable, in priority order:
              //   1. Booking / hold actually overlaps -> "Booked" (stays sticky
              //      even after the slot's time has passed, so history reads
              //      truthfully).
              //   2. Court closure overlaps -> "Closed".
              //   3. Slot is simply in the past with no booking/closure -> "Past".
              const overlapsBookingOrHold = !available && courtRanges.some(
                (r) => (r.kind === "booking" || r.kind === "hold") && r.start < slotEndMs && r.end > slotStartMs,
              );
              const overlapsClosure = !available && !overlapsBookingOrHold && courtRanges.some(
                (r) => r.kind === "closure" && r.start < slotEndMs && r.end > slotStartMs,
              );
              const isPast = !available && !overlapsBookingOrHold && !overlapsClosure && slotStartMs <= now;
              const unavailableLabel = overlapsBookingOrHold
                ? "Booked"
                : overlapsClosure
                  ? "Closed"
                  : isPast
                    ? "Past"
                    : "Booked";
              return (
                <button
                  key={iso}
                  type="button"
                  disabled={!available && !isPicked}
                  onClick={() => pickSlot(s)}
                  className={cn(
                    "flex flex-col items-center justify-center gap-0.5 rounded-[var(--radius-md)] border px-2 py-3 text-center transition-colors active:scale-[0.97]",
                    isPicked &&
                      "border-[var(--color-brand-500)] bg-[var(--color-brand-50)] ring-2 ring-[var(--color-brand-500)]",
                    !isPicked && available &&
                      "border-[var(--color-border-default)] bg-[var(--color-bg)] hover:border-[var(--color-brand-500)] hover:bg-[var(--color-brand-50)]",
                    !available && !isPicked &&
                      "cursor-not-allowed border-dashed border-[var(--color-border-default)] bg-[var(--color-bg-subtle)] text-[var(--color-fg-subtle)] opacity-60",
                  )}
                >
                  <span className="text-sm font-bold leading-tight tracking-tight">
                    {slotRangeLabel(s)}
                  </span>
                  <span
                    className={cn(
                      "text-[11px] font-bold uppercase tracking-wide leading-none",
                      available || isPicked
                        ? "text-[var(--color-success)]"
                        : "text-[var(--color-fg-subtle)]",
                    )}
                  >
                    {available || isPicked ? formatPHP(getPriceForSlot(s.getTime())) : unavailableLabel}
                  </span>
                </button>
              );
            });
            })()}
          </div>
          {slots.length > 0 && slots.every((s) => !isAvailable(s)) && (
            <p className="py-6 text-center text-sm text-[var(--color-fg-muted)]">
              No available times on this date — try another day.
            </p>
          )}
        </Section>

        {/* Sticky footer */}
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-[var(--color-border-default)] bg-[var(--color-bg)]/95 px-4 py-3 shadow-[0_-8px_30px_-12px_rgb(0_0_0/_0.15)] backdrop-blur sm:px-6">
          <div className="mx-auto flex max-w-5xl items-center justify-between gap-3">
            <div className="min-w-0 text-xs sm:text-sm">
              {canContinue && pickedStartDate && pickedEndDate ? (
                <>
                  <div className="truncate font-semibold">
                    {selectedCourt.name} · {pickedDateLabel} ·{" "}
                    {formatTimeManila(pickedStartDate)}–{formatTimeManila(pickedEndDate)}
                    <span className="ml-1 text-[var(--color-fg-muted)]">
                      ({pickedCount}h)
                    </span>
                  </div>
                  <div className="text-[var(--color-fg-muted)]">
                    <span className="font-semibold text-[var(--color-brand-700)]">
                      {formatPHP(estimatedTotal)}
                    </span>{" "}
                    est. total
                  </div>
                  {!isAuthenticated && (
                    <div className="mt-0.5 text-[11px] text-[var(--color-fg-subtle)]">
                      Create an account next to confirm ·{" "}
                      <Link
                        href={`/sign-in?next=${encodeURIComponent(
                          `${pathname}?${new URLSearchParams({
                            court: selectedCourtId,
                            date: selectedDateIso,
                            start: pickedStartIso ?? "",
                            count: String(pickedCount),
                          }).toString()}`,
                        )}`}
                        className="font-medium text-[var(--color-brand-600)] hover:underline"
                      >
                        Sign in
                      </Link>
                    </div>
                  )}
                </>
              ) : (
                <div className="text-[var(--color-fg-muted)]">Pick a time to continue</div>
              )}
            </div>
            <button
              type="button"
              disabled={!canContinue}
              onClick={handleContinue}
              className={cn(
                "inline-flex h-11 min-w-[120px] items-center justify-center gap-1.5 rounded-[var(--radius-md)] px-5 text-sm font-semibold transition-colors",
                canContinue
                  ? "bg-[var(--color-brand-500)] text-white shadow-[var(--shadow-md)] hover:bg-[var(--color-brand-600)]"
                  : "cursor-not-allowed bg-[var(--color-bg-muted)] text-[var(--color-fg-subtle)]",
              )}
            >
              Continue
            </button>
          </div>
        </div>
      </div>

      {/* 2-step booking modal */}
      {step !== "picker" && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={step === "step1" ? "Booking Details" : "Payment & Confirmation"}
          className="fixed inset-0 z-50 overflow-y-auto"
        >
          {/* Backdrop */}
          <div className="fixed inset-0 bg-black/50" onClick={closeModal} />

          {/* Card */}
          <div className="relative mx-auto my-0 flex min-h-screen max-w-lg flex-col bg-[var(--color-bg)] sm:my-8 sm:min-h-0 sm:rounded-[var(--radius-lg)] sm:shadow-[var(--shadow-xl)]">
            {/* Header */}
            <div className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-[var(--color-border-default)] bg-[var(--color-bg)] px-4 py-3 sm:rounded-t-[var(--radius-lg)]">
              <div className="min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--color-brand-600)]">
                  Step {step === "step1" ? "1" : "2"} of 2
                </p>
                <h2 className="text-base font-bold leading-tight">
                  {step === "step1" ? "Booking Details" : "Payment & Confirmation"}
                </h2>
                <p className="text-xs text-[var(--color-fg-muted)]">
                  {step === "step1"
                    ? "Review your booking and enter your details"
                    : "Complete payment and upload proof"}
                </p>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1.5">
                <button
                  type="button"
                  onClick={closeModal}
                  aria-label="Close"
                  className="rounded-full p-2.5 text-[var(--color-fg-muted)] transition-transform hover:bg-[var(--color-bg-subtle)] hover:text-[var(--color-fg)] active:scale-95"
                >
                  <X className="size-5" />
                </button>
                <div
                  className={cn(
                    "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-bold tabular-nums",
                    timerUrgent
                      ? "animate-pulse bg-[var(--color-danger-50)] text-[var(--color-danger-600)]"
                      : "bg-[var(--color-bg-subtle)] text-[var(--color-fg-muted)]",
                  )}
                >
                  <Clock className="size-3" />
                  {timerLabel}
                </div>
              </div>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto p-4">
              {step === "step1" ? (
                <Step1Body
                  venueName={venueName}
                  courtName={selectedCourt.name}
                  pickedDateLabel={pickedDateLabel}
                  pickedStartDate={pickedStartDate}
                  pickedEndDate={pickedEndDate}
                  courtFeeCentavos={displayCourtFee}
                  systemFeeCentavos={displaySystemFee}
                  totalCentavos={displayTotal}
                  editName={editName}
                  editEmail={editEmail}
                  editPhone={editPhone}
                  onNameChange={setEditName}
                  onEmailChange={setEditEmail}
                  onPhoneChange={setEditPhone}
                  createError={createError}
                  isCreating={isCreating}
                  onCancel={closeModal}
                  onNext={() => void proceedToPayment()}
                  voucherInput={voucherInput}
                  onVoucherInputChange={setVoucherInput}
                  appliedVoucher={appliedVoucher}
                  voucherChecking={voucherChecking}
                  voucherError={voucherError}
                  onApplyVoucher={() => void applyVoucher()}
                  onClearVoucher={clearVoucher}
                />
              ) : (
                <Step2Body
                  bookingId={bookingId!}
                  totalCentavos={displayTotal}
                  courtFeeCentavos={displayCourtFee}
                  systemFeeCentavos={displaySystemFee}
                  gcashAccountName={gcashAccountName}
                  gcashAccountNumber={gcashAccountNumber}
                  receiptFormAction={receiptFormAction}
                  receiptFormError={receiptFormError}
                  receiptFieldErrors={receiptFieldErrors}
                  fileRef={fileRef}
                  fileName={fileName}
                  fileError={fileError}
                  onFilePick={onFilePick}
                  confirmDetail={confirmDetail}
                  confirmTerms={confirmTerms}
                  onConfirmDetailChange={setConfirmDetail}
                  onConfirmTermsChange={setConfirmTerms}
                  canSubmit={canSubmitReceipt}
                  onBack={closeModal}
                />
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function Section({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-3">
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <h2 className="text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--color-fg-muted)]">
          {label}
        </h2>
        {hint && (
          <span className="text-[10px] text-[var(--color-fg-subtle)]">{hint}</span>
        )}
      </div>
      {children}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Step 1 — Booking Details + Your Details
// ---------------------------------------------------------------------------
function Step1Body({
  venueName,
  courtName,
  pickedDateLabel,
  pickedStartDate,
  pickedEndDate,
  courtFeeCentavos,
  systemFeeCentavos,
  totalCentavos,
  editName,
  editEmail,
  editPhone,
  onNameChange,
  onEmailChange,
  onPhoneChange,
  createError,
  isCreating,
  onCancel,
  onNext,
  voucherInput,
  onVoucherInputChange,
  appliedVoucher,
  voucherChecking,
  voucherError,
  onApplyVoucher,
  onClearVoucher,
}: {
  venueName: string;
  courtName: string;
  pickedDateLabel: string;
  pickedStartDate: Date | null;
  pickedEndDate: Date | null;
  courtFeeCentavos: bigint;
  systemFeeCentavos: bigint;
  totalCentavos: bigint;
  editName: string;
  editEmail: string;
  editPhone: string;
  onNameChange: (v: string) => void;
  onEmailChange: (v: string) => void;
  onPhoneChange: (v: string) => void;
  createError: string | null;
  isCreating: boolean;
  onCancel: () => void;
  onNext: () => void;
  voucherInput: string;
  onVoucherInputChange: (v: string) => void;
  appliedVoucher: {
    code: string;
    label: string;
    discountCentavos: bigint;
    baseSystemFeeCentavos: bigint;
    discountedSystemFeeCentavos: bigint;
  } | null;
  voucherChecking: boolean;
  voucherError: string | null;
  onApplyVoucher: () => void;
  onClearVoucher: () => void;
}) {
  const timeRange =
    pickedStartDate && pickedEndDate
      ? `${formatTimeManila(pickedStartDate)} – ${formatTimeManila(pickedEndDate)}`
      : "–";
  const canProceed = editName.trim().length > 0 && editEmail.trim().length > 0;

  return (
    <div className="flex flex-col gap-4">
      {/* Warning */}
      <div className="flex items-start gap-2 rounded-[var(--radius-md)] border border-[var(--color-warning-300)] bg-[var(--color-warning-50)] px-3 py-2.5">
        <AlertTriangle className="mt-0.5 size-4 shrink-0 text-[var(--color-warning-600)]" />
        <p className="text-xs text-[var(--color-warning-700)]">
          Please review carefully. Bookings cannot be modified once submitted.
        </p>
      </div>

      {/* Booking Summary */}
      <div className="rounded-[var(--radius-md)] border border-[var(--color-border-default)] bg-[var(--color-bg-subtle)] p-3">
        <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--color-fg-muted)]">
          Booking Summary
        </p>
        <div className="flex flex-col gap-1.5">
          <SummaryRow label="Club" value={venueName} />
          <SummaryRow label="Date" value={pickedDateLabel} />
          <div className="my-1 border-t border-[var(--color-border-default)]" />
          <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--color-fg-subtle)]">Booking</p>
          <div className="rounded-[var(--radius-sm)] bg-[var(--color-brand-50)] px-2 py-1.5 text-sm font-semibold text-[var(--color-brand-700)]">
            {courtName} · {timeRange}
          </div>
          <div className="my-1 border-t border-[var(--color-border-default)]" />
          <SummaryRow label="Subtotal" value={formatPHP(courtFeeCentavos)} />
          <SummaryRow label="System Usage Fee" value={formatPHP(systemFeeCentavos)} />
          {appliedVoucher && appliedVoucher.discountCentavos > 0n && (
            <div className="flex items-center justify-between text-xs text-[var(--color-success-700)]">
              <span>
                Voucher <span className="font-mono font-semibold">{appliedVoucher.code}</span>
              </span>
              <span className="font-semibold">−{formatPHP(appliedVoucher.discountCentavos)}</span>
            </div>
          )}
          <div className="mt-1 flex items-center justify-between">
            <span className="text-sm font-bold">Total Amount</span>
            <span className="text-base font-bold text-[var(--color-brand-700)]">
              {formatPHP(totalCentavos)}
            </span>
          </div>
        </div>
      </div>

      {/* Voucher */}
      <div className="rounded-[var(--radius-md)] border border-[var(--color-border-default)] bg-[var(--color-bg)] p-3">
        <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--color-fg-muted)]">
          Voucher Code
        </p>
        {appliedVoucher ? (
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-[var(--color-success-700)]">
                {appliedVoucher.code} applied
              </p>
              <p className="text-xs text-[var(--color-fg-muted)]">{appliedVoucher.label}</p>
            </div>
            <button
              type="button"
              onClick={onClearVoucher}
              className="rounded-[var(--radius-md)] border border-[var(--color-border-default)] px-3 py-1.5 text-xs font-semibold text-[var(--color-fg)] hover:bg-[var(--color-bg-subtle)]"
            >
              Remove
            </button>
          </div>
        ) : (
          <>
            <div className="flex gap-2">
              <Input
                value={voucherInput}
                onChange={(e) => onVoucherInputChange(e.target.value.toUpperCase())}
                placeholder="e.g. LAUNCH20"
                className="flex-1 font-mono uppercase"
                autoComplete="off"
              />
              <button
                type="button"
                onClick={onApplyVoucher}
                disabled={voucherChecking || voucherInput.trim().length === 0}
                className={cn(
                  "rounded-[var(--radius-md)] px-3 py-2 text-sm font-semibold transition-colors",
                  voucherChecking || voucherInput.trim().length === 0
                    ? "cursor-not-allowed bg-[var(--color-bg-muted)] text-[var(--color-fg-subtle)]"
                    : "bg-[var(--color-brand-500)] text-white hover:bg-[var(--color-brand-600)]",
                )}
              >
                {voucherChecking ? "Checking…" : "Apply"}
              </button>
            </div>
            {voucherError && (
              <p className="mt-2 text-xs text-[var(--color-danger-600)]">{voucherError}</p>
            )}
          </>
        )}
      </div>

      {/* Your Details */}
      <div>
        <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--color-fg-muted)]">
          Your Details
        </p>
        <div className="flex flex-col gap-3">
          <FormField id="modal-name" label="Full Name">
            {({ id }) => (
              <Input
                id={id}
                value={editName}
                onChange={(e) => onNameChange(e.target.value)}
                placeholder="Your full name"
                required
              />
            )}
          </FormField>
          <FormField
            id="modal-email"
            label="Email Address"
            hint="We'll send your booking confirmation to this email"
          >
            {({ id }) => (
              <Input
                id={id}
                type="email"
                value={editEmail}
                onChange={(e) => onEmailChange(e.target.value)}
                placeholder="you@example.com"
                required
              />
            )}
          </FormField>
          <FormField id="modal-phone" label="Mobile Number" hint="Required for booking updates">
            {({ id }) => (
              <Input
                id={id}
                type="tel"
                value={editPhone}
                onChange={(e) => onPhoneChange(e.target.value)}
                placeholder="+63 9XX XXX XXXX"
              />
            )}
          </FormField>
        </div>
      </div>

      {createError && <Alert variant="danger">{createError}</Alert>}

      {/* Footer */}
      <div className="flex gap-2 pt-2">
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 rounded-[var(--radius-md)] border border-[var(--color-border-default)] px-4 py-3 text-sm font-semibold text-[var(--color-fg)] hover:bg-[var(--color-bg-subtle)]"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={onNext}
          disabled={!canProceed || isCreating}
          className={cn(
            "flex flex-1 items-center justify-center gap-1.5 rounded-[var(--radius-md)] px-4 py-3 text-sm font-semibold transition-colors",
            canProceed && !isCreating
              ? "bg-[var(--color-brand-500)] text-white hover:bg-[var(--color-brand-600)]"
              : "cursor-not-allowed bg-[var(--color-bg-muted)] text-[var(--color-fg-subtle)]",
          )}
        >
          {isCreating ? (
            <>
              <Loader2 className="size-4 animate-spin" aria-hidden /> Creating…
            </>
          ) : (
            "Next →"
          )}
        </button>
      </div>
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-xs text-[var(--color-fg-muted)]">{label}</span>
      <span className="text-xs font-medium">{value}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 2 — Payment & Confirmation
// ---------------------------------------------------------------------------
function Step2Body({
  bookingId,
  totalCentavos,
  gcashAccountName,
  gcashAccountNumber,
  receiptFormAction,
  receiptFormError,
  receiptFieldErrors,
  fileRef,
  fileName,
  fileError,
  onFilePick,
  confirmDetail,
  confirmTerms,
  onConfirmDetailChange,
  onConfirmTermsChange,
  canSubmit,
  onBack,
}: {
  bookingId: string;
  totalCentavos: bigint;
  courtFeeCentavos: bigint;
  systemFeeCentavos: bigint;
  gcashAccountName: string | null;
  gcashAccountNumber: string | null;
  receiptFormAction: (payload: FormData) => void;
  receiptFormError: string | undefined;
  receiptFieldErrors: Record<string, string[] | undefined> | undefined;
  fileRef: React.RefObject<HTMLInputElement | null>;
  fileName: string | null;
  fileError: string | null;
  onFilePick: () => void;
  confirmDetail: boolean;
  confirmTerms: boolean;
  onConfirmDetailChange: (v: boolean) => void;
  onConfirmTermsChange: (v: boolean) => void;
  canSubmit: boolean;
  onBack: () => void;
}) {
  return (
    <form action={receiptFormAction} className="flex flex-col gap-4" noValidate>
      <input type="hidden" name="bookingId" value={bookingId} />

      {/* Pay exactly banner */}
      <div className="rounded-[var(--radius-md)] bg-[var(--color-brand-700)] px-4 py-4 text-center text-white">
        <p className="mb-0.5 text-[10px] font-bold uppercase tracking-[0.15em] opacity-80">
          PAY EXACTLY
        </p>
        <p className="text-3xl font-extrabold tabular-nums tracking-tight">
          {formatPHP(totalCentavos)}
        </p>
        <p className="mt-1 text-xs opacity-70">
          Incorrect payment amounts may delay your booking confirmation
        </p>
      </div>

      {/* Send payment to */}
      {gcashAccountNumber ? (
        <div className="rounded-[var(--radius-md)] border border-[var(--color-border-default)] p-3">
          <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--color-fg-muted)]">
            Send Payment To
          </p>
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="text-base font-bold tabular-nums">{gcashAccountNumber}</p>
              {gcashAccountName && (
                <p className="text-xs text-[var(--color-fg-muted)]">{gcashAccountName}</p>
              )}
            </div>
            <CopyButton value={gcashAccountNumber} label="GCash number" />
          </div>
        </div>
      ) : (
        <Alert variant="warning">
          GCash number not set up yet. Contact the venue directly for payment instructions.
        </Alert>
      )}

      {receiptFormError && <Alert variant="danger">{receiptFormError}</Alert>}

      {/* Payment proof */}
      <FormField
        id="receipt"
        label="Payment Proof"
        hint="JPEG, PNG or WebP · max 5 MB"
        error={fileError ?? receiptFieldErrors?.["receipt"]?.[0]}
      >
        {({ id, describedBy, invalid }) => (
          <label
            htmlFor={id}
            className={cn(
              "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-[var(--radius-md)] border-2 border-dashed px-4 py-6 text-sm transition-colors",
              invalid
                ? "border-[var(--color-danger-500)] bg-[var(--color-danger-50)]"
                : "border-[var(--color-border-strong)] bg-[var(--color-bg-subtle)] hover:bg-[var(--color-bg-muted)]",
            )}
          >
            <Upload className="size-6 text-[var(--color-fg-muted)]" />
            <span className="font-medium">{fileName ?? "Tap to upload GCash receipt"}</span>
            <span className="text-xs text-[var(--color-fg-muted)]">
              {fileName ? "Tap again to choose a different file" : "Screenshot or photo of payment"}
            </span>
            <input
              id={id}
              ref={fileRef}
              type="file"
              name="receipt"
              accept={ALLOWED_TYPES.join(",")}
              required
              onChange={onFilePick}
              aria-describedby={describedBy}
              aria-invalid={invalid}
              className="sr-only"
            />
          </label>
        )}
      </FormField>

      {/* Optional GCash reference */}
      <FormField
        id="gcashReferenceNumber"
        label="GCash Reference Number"
        hint="Optional, but speeds up verification"
        error={receiptFieldErrors?.["gcashReferenceNumber"]?.[0]}
      >
        {({ id, describedBy, invalid }) => (
          <Input
            id={id}
            name="gcashReferenceNumber"
            type="text"
            inputMode="numeric"
            placeholder="e.g. 1234567890"
            aria-describedby={describedBy}
            invalid={invalid}
          />
        )}
      </FormField>

      {/* Confirmation checkboxes */}
      <div className="flex flex-col gap-3">
        <label className="flex items-start gap-2.5">
          <input
            type="checkbox"
            checked={confirmDetail}
            onChange={(e) => onConfirmDetailChange(e.target.checked)}
            className="mt-0.5 size-4 shrink-0 accent-[var(--color-brand-500)]"
          />
          <span className="text-xs text-[var(--color-fg)]">
            I have reviewed my booking details and confirm they are correct. I understand this
            booking is <strong>final and cannot be modified.</strong>
          </span>
        </label>
        <label className="flex items-start gap-2.5">
          <input
            type="checkbox"
            checked={confirmTerms}
            onChange={(e) => onConfirmTermsChange(e.target.checked)}
            className="mt-0.5 size-4 shrink-0 accent-[var(--color-brand-500)]"
          />
          <span className="text-xs text-[var(--color-fg)]">
            I understand this booking is <strong>non-refundable.</strong> I have sent the exact
            amount to the GCash number shown above and will only upload a valid receipt for this
            transaction.
          </span>
        </label>
      </div>

      {/* Footer */}
      <div className="flex gap-2 pt-2">
        <button
          type="button"
          onClick={onBack}
          className="flex-1 rounded-[var(--radius-md)] border border-[var(--color-border-default)] px-4 py-3 text-sm font-semibold text-[var(--color-fg)] hover:bg-[var(--color-bg-subtle)]"
        >
          ← Back
        </button>
        <SubmitButton
          disabled={!canSubmit}
          pendingLabel="Submitting…"
          className="flex-1 py-3 text-sm font-semibold"
        >
          <Check className="size-4" aria-hidden />
          Submit Booking
        </SubmitButton>
      </div>
    </form>
  );
}

function CourtCard({
  court,
  selected,
  onSelect,
}: {
  court: BookingFlowProps["courts"][number];
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        "group flex w-[130px] shrink-0 snap-start flex-col overflow-hidden rounded-[var(--radius-md)] border bg-[var(--color-bg)] text-left transition-colors active:scale-[0.98] sm:w-[152px]",
        selected
          ? "border-[var(--color-brand-500)] ring-2 ring-[var(--color-brand-500)]"
          : "border-[var(--color-border-default)] hover:border-[var(--color-brand-500)]",
      )}
    >
      <div className="relative aspect-[5/4] w-full bg-gradient-to-br from-[var(--color-brand-300)] to-[var(--color-brand-600)]">
        {court.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={court.imageUrl} alt={court.name} loading="lazy" className="h-full w-full object-cover" />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-white/85">
            <Trophy className="size-8" />
          </div>
        )}
        {selected && (
          <span className="absolute right-1.5 top-1.5 inline-flex items-center gap-0.5 rounded-full bg-[var(--color-brand-500)] px-1.5 py-0.5 text-[9px] font-bold uppercase text-white">
            <Zap className="size-2.5" /> Selected
          </span>
        )}
      </div>
      <div className="flex flex-col gap-0.5 p-2">
        <span className="truncate text-sm font-semibold leading-tight">{court.name}</span>
        <span className="truncate text-[11px] text-[var(--color-fg-muted)]">
          {court.isIndoor ? "Indoor" : "Outdoor"} · {court.surface}
        </span>
        <span className="mt-0.5 text-sm font-bold text-[var(--color-brand-700)]">
          {formatPHP(BigInt(court.hourlyRateCentavos))}
          <span className="ml-0.5 text-[10px] font-medium text-[var(--color-fg-muted)]">/hr</span>
        </span>
      </div>
    </button>
  );
}

function DateChip({
  isoDate,
  label,
  selected,
  onSelect,
}: {
  isoDate: string;
  label: string;
  selected: boolean;
  onSelect: () => void;
}) {
  const [y, m, d] = isoDate.split("-").map(Number);
  const date = new Date(Date.UTC(y!, (m ?? 1) - 1, d ?? 1));
  const dow = date.toLocaleDateString("en-PH", { weekday: "short", timeZone: "UTC" });
  const dayNum = date.getUTCDate();
  const mon = date.toLocaleDateString("en-PH", { month: "short", timeZone: "UTC" });
  const isToday = label === "Today";

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        "flex w-[60px] shrink-0 snap-start flex-col items-center justify-center rounded-[var(--radius-md)] border px-1 py-2 text-center transition-colors active:scale-[0.97] sm:w-[64px]",
        selected
          ? "border-[var(--color-brand-500)] bg-[var(--color-brand-500)] text-white"
          : "border-[var(--color-border-default)] bg-[var(--color-bg)] text-[var(--color-fg)] hover:border-[var(--color-brand-500)]",
      )}
    >
      <span
        className={cn(
          "text-[10px] font-semibold uppercase tracking-wide",
          selected ? "text-white/85" : "text-[var(--color-fg-muted)]",
        )}
      >
        {dow}
      </span>
      <span className="text-lg font-extrabold leading-tight">{dayNum}</span>
      <span
        className={cn(
          "text-[10px] uppercase",
          selected ? "text-white/85" : "text-[var(--color-fg-muted)]",
        )}
      >
        {mon}
      </span>
      {isToday && (
        <span
          aria-hidden
          className={cn(
            "mt-0.5 size-1.5 rounded-full",
            selected ? "bg-white" : "bg-[var(--color-brand-500)]",
          )}
        />
      )}
    </button>
  );
}
