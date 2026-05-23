import "server-only";
import { env } from "@/lib/env";
import { formatPHP } from "@/lib/money";
import { formatDateTimeManila, formatTimeManila } from "@/lib/date";

/**
 * Returns a human-readable booking window including end time and duration.
 * Example: "Thu, May 14, 3:00 PM – 4:00 PM (1 hr)"
 */
function formatBookingWindow(startAt: Date, endAt: Date): string {
  const start = formatDateTimeManila(startAt);
  const end = formatTimeManila(endAt);
  const durationMin = (endAt.getTime() - startAt.getTime()) / 60_000;
  const durationLabel =
    durationMin % 60 === 0
      ? `${String(durationMin / 60)} hr`
      : `${String(durationMin)} min`;
  return `${start} – ${end} (${durationLabel})`;
}

/**
 * HTML+text email templates. Plain string templates (no react-email) keep the
 * server bundle minimal and the rendered HTML 100% predictable across clients.
 *
 * Conventions
 * - Every template returns `{ subject, html, text }`.
 * - Inline styles only — Gmail/Outlook strip <style> blocks.
 * - Links are absolute, built from `NEXT_PUBLIC_APP_URL`.
 * - Plain-text version exists for accessibility + spam scoring.
 */

const BRAND_GREEN = "#15803d";
const APP_URL = env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "");

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function shell({ heading, bodyHtml, ctaHref, ctaLabel }: {
  heading: string;
  bodyHtml: string;
  ctaHref?: string;
  ctaLabel?: string;
}): string {
  return `<!doctype html>
<html><body style="margin:0;padding:0;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#0f172a;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e2e8f0;">
        <tr><td style="padding:24px 28px;border-bottom:1px solid #e2e8f0;">
          <div style="font-size:18px;font-weight:700;color:${BRAND_GREEN};">DinkHub</div>
        </td></tr>
        <tr><td style="padding:28px;">
          <h1 style="margin:0 0 16px 0;font-size:20px;line-height:1.3;color:#0f172a;">${escapeHtml(heading)}</h1>
          <div style="font-size:15px;line-height:1.55;color:#334155;">${bodyHtml}</div>
          ${
            ctaHref && ctaLabel
              ? `<div style="margin-top:24px;"><a href="${escapeHtml(ctaHref)}" style="display:inline-block;background:${BRAND_GREEN};color:#ffffff;text-decoration:none;padding:11px 20px;border-radius:8px;font-weight:600;font-size:14px;">${escapeHtml(ctaLabel)}</a></div>`
              : ""
          }
        </td></tr>
        <tr><td style="padding:20px 28px;border-top:1px solid #e2e8f0;font-size:12px;color:#64748b;">
          You're receiving this because of activity on your DinkHub booking. Questions? Reply to this email.
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

export interface BookingEmailContext {
  bookingId: string;
  venueName: string;
  courtName: string;
  startAt: Date;
  endAt: Date;
  totalCentavos: bigint;
}

// ---------------------------------------------------------------------------
// payment_submitted \u2192 venue owner
// ---------------------------------------------------------------------------
export function paymentSubmittedEmail(ctx: BookingEmailContext & {
  ownerDisplayName: string;
  playerDisplayName: string;
  gcashReferenceNumber?: string | null;
}) {
  const when = formatBookingWindow(ctx.startAt, ctx.endAt);
  const total = formatPHP(ctx.totalCentavos);
  const link = `${APP_URL}/owner/payments`;
  const refLine = ctx.gcashReferenceNumber
    ? `<p style="margin:0 0 8px 0;"><strong>GCash reference:</strong> ${escapeHtml(ctx.gcashReferenceNumber)}</p>`
    : "";

  return {
    subject: `Receipt awaiting verification \u2014 ${ctx.venueName}`,
    html: shell({
      heading: `New receipt to verify`,
      bodyHtml: `
        <p style="margin:0 0 12px 0;">Hi ${escapeHtml(ctx.ownerDisplayName)}, ${escapeHtml(ctx.playerDisplayName)} just uploaded a payment receipt for their booking.</p>
        <div style="background:#f1f5f9;border-radius:8px;padding:14px 16px;margin:16px 0;font-size:14px;">
          <p style="margin:0 0 6px 0;"><strong>Venue:</strong> ${escapeHtml(ctx.venueName)}</p>
          <p style="margin:0 0 6px 0;"><strong>Court:</strong> ${escapeHtml(ctx.courtName)}</p>
          <p style="margin:0 0 6px 0;"><strong>When:</strong> ${escapeHtml(when)}</p>
          <p style="margin:0 0 6px 0;"><strong>Total:</strong> ${escapeHtml(total)}</p>
          ${refLine}
        </div>
        <p style="margin:0;">Please confirm in your dashboard once the funds land in your GCash account.</p>
      `,
      ctaHref: link,
      ctaLabel: "Review receipt",
    }),
    text:
      `New receipt to verify\n\n` +
      `${ctx.playerDisplayName} uploaded a receipt.\n\n` +
      `Venue: ${ctx.venueName}\nCourt: ${ctx.courtName}\nWhen: ${when}\nTotal: ${total}\n` +
      (ctx.gcashReferenceNumber ? `GCash ref: ${ctx.gcashReferenceNumber}\n` : "") +
      `\nReview: ${link}\n`,
  };
}

// ---------------------------------------------------------------------------
// payment_verified \u2192 player
// ---------------------------------------------------------------------------
export function paymentVerifiedEmail(ctx: BookingEmailContext & {
  playerDisplayName: string;
  balanceDueCentavos?: bigint;
}) {
  const when = formatBookingWindow(ctx.startAt, ctx.endAt);
  const total = formatPHP(ctx.totalCentavos);
  const link = `${APP_URL}/me/bookings/${ctx.bookingId}`;
  const hasBalance =
    typeof ctx.balanceDueCentavos === "bigint" && ctx.balanceDueCentavos > 0n;
  const balanceLine = hasBalance
    ? `<p style="margin:6px 0 0 0;color:#92400e;"><strong>Balance due at venue:</strong> ${escapeHtml(
        formatPHP(ctx.balanceDueCentavos as bigint),
      )} (cash or GCash on arrival)</p>`
    : "";
  const balanceTextLine = hasBalance
    ? `Balance due at venue: ${formatPHP(ctx.balanceDueCentavos as bigint)} (cash or GCash on arrival)\n`
    : "";

  return {
    subject: `Booking confirmed \u2014 ${ctx.venueName} on ${when}`,
    html: shell({
      heading: `You're confirmed \uD83C\uDFF8`,
      bodyHtml: `
        <p style="margin:0 0 12px 0;">Hi ${escapeHtml(ctx.playerDisplayName)}, your payment has been verified by the venue. Your court is locked in.</p>
        <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:14px 16px;margin:16px 0;font-size:14px;">
          <p style="margin:0 0 6px 0;"><strong>Venue:</strong> ${escapeHtml(ctx.venueName)}</p>
          <p style="margin:0 0 6px 0;"><strong>Court:</strong> ${escapeHtml(ctx.courtName)}</p>
          <p style="margin:0 0 6px 0;"><strong>When:</strong> ${escapeHtml(when)}</p>
          <p style="margin:0;"><strong>Total:</strong> ${escapeHtml(total)}</p>
          ${balanceLine}
        </div>
        <p style="margin:0;">Bring a friend, bring water, and enjoy your game.</p>
      `,
      ctaHref: link,
      ctaLabel: "View my bookings",
    }),
    text:
      `Booking confirmed\n\n` +
      `Your payment has been verified.\n\n` +
      `Venue: ${ctx.venueName}\nCourt: ${ctx.courtName}\nWhen: ${when}\nTotal: ${total}\n` +
      balanceTextLine +
      `\nView: ${link}\n`,
  };
}

// ---------------------------------------------------------------------------
// payment_rejected \u2192 player
// ---------------------------------------------------------------------------
export function paymentRejectedEmail(ctx: BookingEmailContext & {
  playerDisplayName: string;
  reason: string;
}) {
  const when = formatBookingWindow(ctx.startAt, ctx.endAt);
  const link = `${APP_URL}/book/${ctx.bookingId}/pay`;

  return {
    subject: `Action needed: receipt rejected \u2014 ${ctx.venueName}`,
    html: shell({
      heading: `Receipt couldn't be verified`,
      bodyHtml: `
        <p style="margin:0 0 12px 0;">Hi ${escapeHtml(ctx.playerDisplayName)}, the venue couldn't verify the payment receipt for your booking on ${escapeHtml(when)}.</p>
        <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:14px 16px;margin:16px 0;font-size:14px;">
          <p style="margin:0 0 4px 0;"><strong>Reason given:</strong></p>
          <p style="margin:0;color:#991b1b;">${escapeHtml(ctx.reason)}</p>
        </div>
        <p style="margin:0 0 12px 0;">Your slot is still held \u2014 please re-upload a valid receipt within the cancellation window.</p>
      `,
      ctaHref: link,
      ctaLabel: "Re-upload receipt",
    }),
    text:
      `Receipt rejected\n\n` +
      `Reason: ${ctx.reason}\n\n` +
      `Your slot is still held. Re-upload a valid receipt:\n${link}\n`,
  };
}

// ---------------------------------------------------------------------------
// booking_cancelled_by_player \u2192 venue owner
// ---------------------------------------------------------------------------
export function bookingCancelledByPlayerEmail(ctx: BookingEmailContext & {
  ownerDisplayName: string;
  playerDisplayName: string;
}) {
  const when = formatBookingWindow(ctx.startAt, ctx.endAt);
  const link = `${APP_URL}/owner/bookings`;

  return {
    subject: `Booking cancelled \u2014 ${ctx.venueName} on ${when}`,
    html: shell({
      heading: `A booking was cancelled`,
      bodyHtml: `
        <p style="margin:0 0 12px 0;">Hi ${escapeHtml(ctx.ownerDisplayName)}, ${escapeHtml(ctx.playerDisplayName)} cancelled their booking within the 15-minute cancellation window.</p>
        <div style="background:#f1f5f9;border-radius:8px;padding:14px 16px;margin:16px 0;font-size:14px;">
          <p style="margin:0 0 6px 0;"><strong>Venue:</strong> ${escapeHtml(ctx.venueName)}</p>
          <p style="margin:0 0 6px 0;"><strong>Court:</strong> ${escapeHtml(ctx.courtName)}</p>
          <p style="margin:0;"><strong>When:</strong> ${escapeHtml(when)}</p>
        </div>
        <p style="margin:0;">The slot is now available again on your calendar.</p>
      `,
      ctaHref: link,
      ctaLabel: "View bookings",
    }),
    text:
      `Booking cancelled\n\n` +
      `${ctx.playerDisplayName} cancelled their booking.\n\n` +
      `Venue: ${ctx.venueName}\nCourt: ${ctx.courtName}\nWhen: ${when}\n\n` +
      `View: ${link}\n`,
  };
}

// ---------------------------------------------------------------------------
// booking_force_cancelled \u2192 player (admin force-cancel)
// ---------------------------------------------------------------------------
export function bookingForceCancelledEmail(ctx: BookingEmailContext & {
  playerDisplayName: string;
  reason: string;
  rebookUrl?: string;
}) {
  const when = formatBookingWindow(ctx.startAt, ctx.endAt);
  const link = `${APP_URL}/me/bookings/${ctx.bookingId}`;
  const rebookBanner = ctx.rebookUrl
    ? `<div style="background:#ecfdf5;border:1px solid #6ee7b7;border-radius:8px;padding:14px 16px;margin:16px 0;font-size:14px;color:#065f46;">
         <p style="margin:0 0 4px 0;"><strong>Good news \u2014 your payment carries over.</strong></p>
         <p style="margin:0;">Pick any new time at no extra cost.</p>
       </div>`
    : "";
  const ctaHref = ctx.rebookUrl ?? link;
  const ctaLabel = ctx.rebookUrl ? "Pick a new time" : "View my bookings";

  return {
    subject: `Your booking was cancelled \u2014 ${ctx.venueName}`,
    html: shell({
      heading: `Your booking was cancelled by support`,
      bodyHtml: `
        <p style="margin:0 0 12px 0;">Hi ${escapeHtml(ctx.playerDisplayName)}, our team cancelled your booking on ${escapeHtml(when)} at ${escapeHtml(ctx.venueName)}.</p>
        <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:14px 16px;margin:16px 0;font-size:14px;">
          <p style="margin:0 0 4px 0;"><strong>Reason:</strong></p>
          <p style="margin:0;color:#991b1b;">${escapeHtml(ctx.reason)}</p>
        </div>
        ${rebookBanner}
        <p style="margin:0;">If you've already paid and a refund is owed, our team will contact you separately to coordinate it.</p>
      `,
      ctaHref,
      ctaLabel,
    }),
    text:
      `Your booking was cancelled by support\n\n` +
      `Venue: ${ctx.venueName}\nCourt: ${ctx.courtName}\nWhen: ${when}\n\n` +
      `Reason: ${ctx.reason}\n\n` +
      (ctx.rebookUrl
        ? `Pick a new time (no payment needed): ${ctx.rebookUrl}\n\n`
        : `If a refund is owed, our team will contact you separately.\n\n`) +
      `View: ${link}\n`,
  };
}

// ---------------------------------------------------------------------------
// dispute_opened \u2192 player
// ---------------------------------------------------------------------------
export function disputeOpenedEmail(ctx: BookingEmailContext & {
  playerDisplayName: string;
  reason: string;
}) {
  const when = formatBookingWindow(ctx.startAt, ctx.endAt);
  const link = `${APP_URL}/me/bookings/${ctx.bookingId}`;

  return {
    subject: `Payment dispute opened \u2014 ${ctx.venueName}`,
    html: shell({
      heading: `A dispute was opened on your payment`,
      bodyHtml: `
        <p style="margin:0 0 12px 0;">Hi ${escapeHtml(ctx.playerDisplayName)}, our team opened a dispute on the payment for your booking on ${escapeHtml(when)} at ${escapeHtml(ctx.venueName)}. Your booking is still confirmed while we investigate.</p>
        <div style="background:#fef3c7;border:1px solid #fde68a;border-radius:8px;padding:14px 16px;margin:16px 0;font-size:14px;">
          <p style="margin:0 0 4px 0;"><strong>Reason:</strong></p>
          <p style="margin:0;color:#92400e;">${escapeHtml(ctx.reason)}</p>
        </div>
        <p style="margin:0;">We'll email you again once the dispute is resolved. No action is needed from you right now.</p>
      `,
      ctaHref: link,
      ctaLabel: "View my bookings",
    }),
    text:
      `Payment dispute opened\n\n` +
      `Venue: ${ctx.venueName}\nWhen: ${when}\n\n` +
      `Reason: ${ctx.reason}\n\n` +
      `Your booking is still confirmed while we investigate. No action needed.\n\n` +
      `View: ${link}\n`,
  };
}

// ---------------------------------------------------------------------------
// dispute_resolved \u2192 player
// ---------------------------------------------------------------------------
export function disputeResolvedEmail(ctx: BookingEmailContext & {
  playerDisplayName: string;
  resolution: "refund_full" | "rejected";
  notes?: string | null;
}) {
  const when = formatBookingWindow(ctx.startAt, ctx.endAt);
  const total = formatPHP(ctx.totalCentavos);
  const isRefund = ctx.resolution === "refund_full";
  const link = `${APP_URL}/me/bookings/${ctx.bookingId}`;
  const headline = isRefund ? `Your refund has been approved` : `Dispute resolved \u2014 booking upheld`;
  const banner = isRefund
    ? `<div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:14px 16px;margin:16px 0;font-size:14px;">
         <p style="margin:0 0 6px 0;"><strong>Refund amount:</strong> ${escapeHtml(total)}</p>
         <p style="margin:0;">Our team will coordinate the refund transfer with you separately.</p>
       </div>`
    : `<div style="background:#f1f5f9;border-radius:8px;padding:14px 16px;margin:16px 0;font-size:14px;">
         <p style="margin:0;">After review, the original payment stands and your booking remains confirmed.</p>
       </div>`;
  const notesBlock = ctx.notes
    ? `<p style="margin:0 0 4px 0;"><strong>Notes from our team:</strong></p>
       <p style="margin:0 0 12px 0;color:#334155;">${escapeHtml(ctx.notes)}</p>`
    : "";

  return {
    subject: isRefund
      ? `Refund approved \u2014 ${ctx.venueName}`
      : `Dispute resolved \u2014 ${ctx.venueName}`,
    html: shell({
      heading: headline,
      bodyHtml: `
        <p style="margin:0 0 12px 0;">Hi ${escapeHtml(ctx.playerDisplayName)}, the dispute on your booking on ${escapeHtml(when)} at ${escapeHtml(ctx.venueName)} has been resolved.</p>
        ${banner}
        ${notesBlock}
      `,
      ctaHref: link,
      ctaLabel: "View my bookings",
    }),
    text:
      `${headline}\n\n` +
      `Venue: ${ctx.venueName}\nWhen: ${when}\n` +
      (isRefund ? `Refund amount: ${total}\n` : "") +
      (ctx.notes ? `\nNotes: ${ctx.notes}\n` : "") +
      `\nView: ${link}\n`,
  };
}

// ---------------------------------------------------------------------------
// owner_invoice_verified → venue owner
// ---------------------------------------------------------------------------
export interface OwnerInvoiceEmailContext {
  invoiceId: string;
  venueName: string;
  periodStart: Date;
  periodEnd: Date;
  totalCentavos: bigint;
  ownerDisplayName: string;
}

function formatInvoicePeriod(start: Date, end: Date): string {
  const inclusiveEnd = new Date(end.getTime() - 86_400_000);
  const opts: Intl.DateTimeFormatOptions = {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "Asia/Manila",
  };
  const fmt = new Intl.DateTimeFormat("en-PH", opts);
  return `${fmt.format(start)} – ${fmt.format(inclusiveEnd)}`;
}

// ---------------------------------------------------------------------------
// owner_invoice_issued → venue owner (generated by weekly cron)
// ---------------------------------------------------------------------------
export function ownerInvoiceIssuedEmail(ctx: OwnerInvoiceEmailContext) {
  const period = formatInvoicePeriod(ctx.periodStart, ctx.periodEnd);
  const total = formatPHP(ctx.totalCentavos);
  const link = `${APP_URL}/owner/invoices/${ctx.invoiceId}`;

  return {
    subject: `New DinkHub invoice — ${ctx.venueName} (${period})`,
    html: shell({
      heading: `Your weekly invoice is ready`,
      bodyHtml: `
        <p style="margin:0 0 12px 0;">Hi ${escapeHtml(ctx.ownerDisplayName)}, your DinkHub booking-fee invoice for the week of ${escapeHtml(period)} is ready for payment.</p>
        <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:14px 16px;margin:16px 0;font-size:14px;">
          <p style="margin:0 0 6px 0;"><strong>Venue:</strong> ${escapeHtml(ctx.venueName)}</p>
          <p style="margin:0 0 6px 0;"><strong>Period:</strong> ${escapeHtml(period)}</p>
          <p style="margin:0;"><strong>Amount due:</strong> ${escapeHtml(total)}</p>
        </div>
        <p style="margin:0 0 12px 0;">Please send a single GCash transfer to DinkHub and upload your receipt before the due date to avoid account suspension.</p>
        <p style="margin:0;font-size:13px;color:#64748b;">You can view the full breakdown and payment instructions at the link below.</p>
      `,
      ctaHref: link,
      ctaLabel: "View &amp; pay invoice",
    }),
    text:
      `New DinkHub invoice\n\n` +
      `Venue: ${ctx.venueName}\nPeriod: ${period}\nAmount due: ${total}\n\n` +
      `Pay here: ${link}\n`,
  };
}

export function ownerInvoiceVerifiedEmail(ctx: OwnerInvoiceEmailContext) {
  const period = formatInvoicePeriod(ctx.periodStart, ctx.periodEnd);
  const total = formatPHP(ctx.totalCentavos);
  const link = `${APP_URL}/owner/invoices/${ctx.invoiceId}`;

  return {
    subject: `Invoice paid — ${ctx.venueName} (${period})`,
    html: shell({
      heading: `Your DinkHub invoice is paid`,
      bodyHtml: `
        <p style="margin:0 0 12px 0;">Hi ${escapeHtml(ctx.ownerDisplayName)}, we've verified your GCash receipt and marked this invoice paid. Thank you!</p>
        <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:14px 16px;margin:16px 0;font-size:14px;">
          <p style="margin:0 0 6px 0;"><strong>Venue:</strong> ${escapeHtml(ctx.venueName)}</p>
          <p style="margin:0 0 6px 0;"><strong>Period:</strong> ${escapeHtml(period)}</p>
          <p style="margin:0;"><strong>Amount paid:</strong> ${escapeHtml(total)}</p>
        </div>
        <p style="margin:0;">No further action needed. Your next weekly invoice will appear on Monday morning if any booking fees accrue.</p>
      `,
      ctaHref: link,
      ctaLabel: "View invoice",
    }),
    text:
      `Invoice paid\n\n` +
      `Venue: ${ctx.venueName}\nPeriod: ${period}\nAmount paid: ${total}\n\n` +
      `View: ${link}\n`,
  };
}

// ---------------------------------------------------------------------------
// owner_invoice_rejected → venue owner
// ---------------------------------------------------------------------------
export function ownerInvoiceRejectedEmail(
  ctx: OwnerInvoiceEmailContext & { reason: string },
) {
  const period = formatInvoicePeriod(ctx.periodStart, ctx.periodEnd);
  const total = formatPHP(ctx.totalCentavos);
  const link = `${APP_URL}/owner/invoices/${ctx.invoiceId}`;

  return {
    subject: `Action needed: receipt rejected — ${ctx.venueName}`,
    html: shell({
      heading: `Receipt needs another look`,
      bodyHtml: `
        <p style="margin:0 0 12px 0;">Hi ${escapeHtml(ctx.ownerDisplayName)}, we couldn't verify the receipt you uploaded for your DinkHub invoice.</p>
        <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:14px 16px;margin:16px 0;font-size:14px;">
          <p style="margin:0 0 4px 0;"><strong>Reason:</strong></p>
          <p style="margin:0 0 12px 0;color:#991b1b;">${escapeHtml(ctx.reason)}</p>
          <p style="margin:0 0 6px 0;"><strong>Venue:</strong> ${escapeHtml(ctx.venueName)}</p>
          <p style="margin:0 0 6px 0;"><strong>Period:</strong> ${escapeHtml(period)}</p>
          <p style="margin:0;"><strong>Amount due:</strong> ${escapeHtml(total)}</p>
        </div>
        <p style="margin:0;">Please re-upload a corrected GCash receipt at the link below. The screenshot must show the amount and reference number clearly.</p>
      `,
      ctaHref: link,
      ctaLabel: "Re-upload receipt",
    }),
    text:
      `Receipt rejected — please re-upload\n\n` +
      `Venue: ${ctx.venueName}\nPeriod: ${period}\nAmount due: ${total}\n\n` +
      `Reason: ${ctx.reason}\n\n` +
      `Re-upload: ${link}\n`,
  };
}

// ---------------------------------------------------------------------------
// password_reset → user
// ---------------------------------------------------------------------------
export function passwordResetEmail(ctx: {
  displayName: string;
  resetUrl: string;
}) {
  return {
    subject: `Reset your DinkHub password`,
    html: shell({
      heading: `Reset your password`,
      bodyHtml: `
        <p style="margin:0 0 12px 0;">Hi ${escapeHtml(ctx.displayName)}, we got a request to reset the password on your DinkHub account.</p>
        <p style="margin:0 0 12px 0;">Click the button below to choose a new one. This link expires in 1 hour and can only be used once.</p>
        <p style="margin:16px 0 0 0;font-size:13px;color:#64748b;">If you didn't request this, you can safely ignore this email \u2014 your password won't change.</p>
      `,
      ctaHref: ctx.resetUrl,
      ctaLabel: "Reset password",
    }),
    text:
      `Reset your DinkHub password\n\n` +
      `Hi ${ctx.displayName}, open this link to choose a new password (expires in 1 hour):\n\n` +
      `${ctx.resetUrl}\n\n` +
      `If you didn't request this, you can safely ignore this email.\n`,
  };
}

// ---------------------------------------------------------------------------
// owner_daily_digest → venue owner (generated by daily cron)
// ---------------------------------------------------------------------------
export function ownerDailyDigestEmail(ctx: {
  ownerDisplayName: string;
  newBookingsToday: number;
  pendingReceiptsCount: number;
  todayRevenueCentavos: bigint;
  digestDate: Date;
}) {
  const dateFmt = new Intl.DateTimeFormat("en-PH", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "Asia/Manila",
  });
  const dateLabel = dateFmt.format(ctx.digestDate);
  const revenueLabel = formatPHP(ctx.todayRevenueCentavos);
  const dashboardLink = `${APP_URL}/owner`;
  const paymentsLink = `${APP_URL}/owner/payments`;

  const bookingLine =
    ctx.newBookingsToday === 1
      ? `<strong>1 new booking</strong> was created today`
      : `<strong>${String(ctx.newBookingsToday)} new bookings</strong> were created today`;

  const pendingLine =
    ctx.pendingReceiptsCount === 0
      ? `No receipts are currently pending review.`
      : ctx.pendingReceiptsCount === 1
        ? `<strong>1 receipt</strong> is awaiting your verification.`
        : `<strong>${String(ctx.pendingReceiptsCount)} receipts</strong> are awaiting your verification.`;

  return {
    subject: `Your DinkHub digest \u2014 ${dateLabel}`,
    html: shell({
      heading: `Daily activity digest`,
      bodyHtml: `
        <p style="margin:0 0 12px 0;">Hi ${escapeHtml(ctx.ownerDisplayName)}, here\u2019s a quick summary of your DinkHub activity for ${escapeHtml(dateLabel)}.</p>
        <div style="background:#f1f5f9;border-radius:8px;padding:14px 16px;margin:16px 0;font-size:14px;">
          <p style="margin:0 0 8px 0;">${bookingLine}.</p>
          <p style="margin:0 0 8px 0;">${pendingLine}</p>
          ${ctx.todayRevenueCentavos > 0n ? `<p style="margin:0;"><strong>Confirmed revenue today:</strong> ${escapeHtml(revenueLabel)}</p>` : ""}
        </div>
        ${
          ctx.pendingReceiptsCount > 0
            ? `<p style="margin:0 0 12px 0;">Head to your payments dashboard to verify pending receipts.</p>`
            : `<p style="margin:0 0 12px 0;">All receipts are up to date \u2014 nothing to review right now.</p>`
        }
        <p style="margin:0;font-size:13px;color:#64748b;">
          You\u2019re receiving this digest because you opted in. You can turn it off in
          <a href="${APP_URL}/owner/settings" style="color:${BRAND_GREEN};">notification settings</a>.
        </p>
      `,
      ctaHref: ctx.pendingReceiptsCount > 0 ? paymentsLink : dashboardLink,
      ctaLabel: ctx.pendingReceiptsCount > 0 ? "Review receipts" : "View dashboard",
    }),
    text:
      `Daily DinkHub digest \u2014 ${dateLabel}\n\n` +
      `New bookings today: ${String(ctx.newBookingsToday)}\n` +
      `Pending receipts: ${String(ctx.pendingReceiptsCount)}\n` +
      (ctx.todayRevenueCentavos > 0n ? `Confirmed revenue: ${revenueLabel}\n` : "") +
      `\nDashboard: ${dashboardLink}\n` +
      (ctx.pendingReceiptsCount > 0 ? `Review receipts: ${paymentsLink}\n` : "") +
      `\nTurn off this digest: ${APP_URL}/owner/settings\n`,
  };
}

// ---------------------------------------------------------------------------
// booking_rescheduled_by_owner → player
// ---------------------------------------------------------------------------

/**
 * Returns the email template for owner-initiated reschedules.
 * Also exports a helper to generate a minimal iCalendar VEVENT string so
 * callers can attach it (as text/calendar) when the player needs to update
 * their calendar app.
 */
export function bookingRescheduledByOwnerEmail(
  ctx: BookingEmailContext & {
    playerDisplayName: string;
    oldStartAt: Date;
    oldEndAt: Date;
    /** When set, the email frames the change as a court move rather than a time change. */
    oldCourtName?: string | null;
    reason?: string | null;
  },
) {
  const fmtDt = (d: Date) =>
    d.toLocaleString("en-PH", {
      timeZone: "Asia/Manila",
      dateStyle: "medium",
      timeStyle: "short",
    });

  const fmtTime = (d: Date) =>
    d.toLocaleTimeString("en-PH", { timeZone: "Asia/Manila", timeStyle: "short" });

  const sameDay =
    ctx.startAt.toLocaleDateString("en-PH", { timeZone: "Asia/Manila" }) ===
    ctx.endAt.toLocaleDateString("en-PH", { timeZone: "Asia/Manila" });
  const oldSameDay =
    ctx.oldStartAt.toLocaleDateString("en-PH", { timeZone: "Asia/Manila" }) ===
    ctx.oldEndAt.toLocaleDateString("en-PH", { timeZone: "Asia/Manila" });

  const oldWhen = `${fmtDt(ctx.oldStartAt)} – ${oldSameDay ? fmtTime(ctx.oldEndAt) : fmtDt(ctx.oldEndAt)}`;
  const newWhen = `${fmtDt(ctx.startAt)} – ${sameDay ? fmtTime(ctx.endAt) : fmtDt(ctx.endAt)}`;
  const bookingLink = `${APP_URL}/me/bookings`;

  // Detect same-time-different-court case (auto-move from venue closure).
  const isCourtMoveOnly =
    !!ctx.oldCourtName &&
    ctx.oldCourtName !== ctx.courtName &&
    ctx.oldStartAt.getTime() === ctx.startAt.getTime() &&
    ctx.oldEndAt.getTime() === ctx.endAt.getTime();

  const reasonHtml = ctx.reason
    ? `<p style="margin:0 0 12px 0;font-size:14px;color:#64748b;"><strong>Reason:</strong> ${escapeHtml(ctx.reason)}</p>`
    : "";
  const reasonText = ctx.reason ? `Reason: ${ctx.reason}\n` : "";

  const headingLabel = isCourtMoveOnly ? "Court change" : "Booking rescheduled";
  const subject = isCourtMoveOnly
    ? `Your booking moved to ${ctx.courtName} — ${ctx.venueName}`
    : `Your booking has been rescheduled — ${ctx.venueName}`;

  const introHtml = isCourtMoveOnly
    ? `<p style="margin:0 0 12px 0;">Hi ${escapeHtml(ctx.playerDisplayName)},</p>
        <p style="margin:0 0 12px 0;"><strong>${escapeHtml(ctx.venueName)}</strong> moved your booking from <strong>${escapeHtml(ctx.oldCourtName!)}</strong> to <strong>${escapeHtml(ctx.courtName)}</strong>. Same time, same price — no payment needed.</p>`
    : `<p style="margin:0 0 12px 0;">Hi ${escapeHtml(ctx.playerDisplayName)},</p>
        <p style="margin:0 0 12px 0;"><strong>${escapeHtml(ctx.venueName)}</strong> has rescheduled your booking on <strong>${escapeHtml(ctx.courtName)}</strong>.</p>`;

  const detailsHtml = isCourtMoveOnly
    ? `<div style="background:#f1f5f9;border-radius:8px;padding:14px 16px;margin:16px 0;font-size:14px;">
          <p style="margin:0 0 6px 0;"><strong>When:</strong> ${escapeHtml(newWhen)}</p>
          <p style="margin:0 0 6px 0;"><strong>Court:</strong> ${escapeHtml(ctx.oldCourtName!)} → <strong>${escapeHtml(ctx.courtName)}</strong></p>
          <p style="margin:0;"><strong>Venue:</strong> ${escapeHtml(ctx.venueName)}</p>
        </div>`
    : `<div style="background:#f1f5f9;border-radius:8px;padding:14px 16px;margin:16px 0;font-size:14px;">
          <p style="margin:0 0 6px 0;"><strong>Original:</strong> ${escapeHtml(oldWhen)}</p>
          <p style="margin:0 0 6px 0;"><strong>New time:</strong> ${escapeHtml(newWhen)}</p>
          <p style="margin:0 0 6px 0;"><strong>Court:</strong> ${escapeHtml(ctx.courtName)}</p>
          <p style="margin:0;"><strong>Venue:</strong> ${escapeHtml(ctx.venueName)}</p>
        </div>`;

  const closingHtml = isCourtMoveOnly
    ? `<p style="margin:0 0 12px 0;">A calendar invite is attached. If the new court doesn't work for you, reply to this email to coordinate with the venue.</p>`
    : `<p style="margin:0 0 12px 0;">A calendar invite is attached. If the new time doesn't work for you, please reply to this email to coordinate with the venue.</p>`;

  const textBody = isCourtMoveOnly
    ? `Court change — ${ctx.venueName}\n\n` +
      `Hi ${ctx.playerDisplayName},\n\n` +
      `${ctx.venueName} moved your booking from ${ctx.oldCourtName} to ${ctx.courtName}.\n` +
      `Same time, same price — no payment needed.\n\n` +
      `When:  ${newWhen}\n` +
      `Court: ${ctx.oldCourtName} → ${ctx.courtName}\n` +
      reasonText +
      `\nA calendar invite (.ics) is attached.\n` +
      `If the new court doesn't work, reply to this email to coordinate.\n\n` +
      `View bookings: ${bookingLink}\n`
    : `Booking rescheduled — ${ctx.venueName}\n\n` +
      `Hi ${ctx.playerDisplayName},\n\n` +
      `${ctx.venueName} rescheduled your booking on ${ctx.courtName}.\n\n` +
      `Original time: ${oldWhen}\n` +
      `New time:      ${newWhen}\n` +
      reasonText +
      `\nA calendar invite (.ics) is attached.\n` +
      `If the new time doesn't work, reply to this email to coordinate.\n\n` +
      `View bookings: ${bookingLink}\n`;

  return {
    subject,
    html: shell({
      heading: headingLabel,
      bodyHtml: `${introHtml}${detailsHtml}${reasonHtml}${closingHtml}`,
      ctaHref: bookingLink,
      ctaLabel: "View my bookings",
    }),
    text: textBody,
  };
}

/**
 * Build a minimal RFC 5545 VEVENT string for the rescheduled booking.
 * Returns a base64-encoded string suitable for Resend's `attachments[].content`.
 *
 * Notes:
 *   - DTSTART/DTEND use the Asia/Manila TZID form so calendar apps display the
 *     correct wall-clock time even when the server is UTC.
 *   - UID is stable (booking ID) so repeated reschedules update the event.
 *   - SEQUENCE increments with rescheduledCount so calendar apps replace the
 *     old invite rather than adding a duplicate.
 */
export function buildRescheduleIcs(ctx: {
  bookingId: string;
  startAt: Date;
  endAt: Date;
  venueName: string;
  courtName: string;
  rescheduledCount: number;
}): string {
  // Format as local Manila wall-clock in iCal compact form: YYYYMMDDTHHmmss
  const toIcalLocal = (d: Date): string => {
    const manila = new Date(d.getTime() + 8 * 3_600_000); // UTC → UTC+8
    const pad = (n: number) => String(n).padStart(2, "0");
    return (
      String(manila.getUTCFullYear()) +
      pad(manila.getUTCMonth() + 1) +
      pad(manila.getUTCDate()) +
      "T" +
      pad(manila.getUTCHours()) +
      pad(manila.getUTCMinutes()) +
      pad(manila.getUTCSeconds())
    );
  };

  const nowUtc = new Date()
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "Z");

  const ics = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//DinkHub//BookingCalendar//EN",
    "METHOD:REQUEST",
    "BEGIN:VTIMEZONE",
    "TZID:Asia/Manila",
    "BEGIN:STANDARD",
    "TZOFFSETFROM:+0800",
    "TZOFFSETTO:+0800",
    "TZNAME:PST",
    "DTSTART:19700101T000000",
    "END:STANDARD",
    "END:VTIMEZONE",
    "BEGIN:VEVENT",
    `UID:booking-${ctx.bookingId}@dinkhub.ph`,
    `DTSTAMP:${nowUtc}`,
    `DTSTART;TZID=Asia/Manila:${toIcalLocal(ctx.startAt)}`,
    `DTEND;TZID=Asia/Manila:${toIcalLocal(ctx.endAt)}`,
    `SUMMARY:Pickleball @ ${ctx.venueName} — ${ctx.courtName}`,
    `DESCRIPTION:Court booking at ${ctx.venueName}\\, ${ctx.courtName}. Manage at ${APP_URL}/me/bookings`,
    `SEQUENCE:${ctx.rescheduledCount}`,
    "STATUS:CONFIRMED",
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");

  return Buffer.from(ics, "utf8").toString("base64");
}

// ---------------------------------------------------------------------------
// session_reminder → player (T-2h)
// ---------------------------------------------------------------------------
export function sessionReminderEmail(ctx: BookingEmailContext & {
  playerDisplayName: string;
  balanceDueCentavos?: bigint;
}) {
  const when = formatBookingWindow(ctx.startAt, ctx.endAt);
  const total = formatPHP(ctx.totalCentavos);
  const link = `${APP_URL}/me/bookings/${ctx.bookingId}`;
  const hasBalance =
    typeof ctx.balanceDueCentavos === "bigint" && ctx.balanceDueCentavos > 0n;
  const balanceLine = hasBalance
    ? `<p style="margin:6px 0 0 0;color:#92400e;"><strong>Bring for balance:</strong> ${escapeHtml(
        formatPHP(ctx.balanceDueCentavos as bigint),
      )} (cash or GCash on arrival)</p>`
    : "";
  const balanceTextLine = hasBalance
    ? `Bring for balance: ${formatPHP(ctx.balanceDueCentavos as bigint)} (cash or GCash on arrival)\n`
    : "";

  return {
    subject: `Heads up — your game starts in 2 hours at ${ctx.venueName}`,
    html: shell({
      heading: `Your court is in 2 hours 🏸`,
      bodyHtml: `
        <p style="margin:0 0 12px 0;">Hi ${escapeHtml(ctx.playerDisplayName)}, just a quick reminder that your pickleball session is coming up soon.</p>
        <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:14px 16px;margin:16px 0;font-size:14px;">
          <p style="margin:0 0 6px 0;"><strong>Venue:</strong> ${escapeHtml(ctx.venueName)}</p>
          <p style="margin:0 0 6px 0;"><strong>Court:</strong> ${escapeHtml(ctx.courtName)}</p>
          <p style="margin:0 0 6px 0;"><strong>When:</strong> ${escapeHtml(when)}</p>
          <p style="margin:0;"><strong>Total:</strong> ${escapeHtml(total)}</p>
          ${balanceLine}
        </div>
        <p style="margin:0;">Bring water, warm up, and enjoy your game!</p>
      `,
      ctaHref: link,
      ctaLabel: "View booking",
    }),
    text:
      `Your court is in 2 hours\n\n` +
      `Hi ${ctx.playerDisplayName}, your pickleball session is coming up soon.\n\n` +
      `Venue: ${ctx.venueName}\nCourt: ${ctx.courtName}\nWhen: ${when}\nTotal: ${total}\n` +
      balanceTextLine +
      `\nView booking: ${link}\n`,
  };
}

// ===========================================================================
// Open Play templates
// ===========================================================================

export interface OpenPlayEmailContext {
  sessionId: string;
  signupId: string;
  sessionTitle: string;
  venueName: string;
  courtName: string;
  startAt: Date;
  endAt: Date;
  capacity: number;
  pricePerPlayerCentavos: bigint;
  totalCentavos: bigint;
}

function formatOpenPlayWindow(startAt: Date, endAt: Date): string {
  return formatBookingWindow(startAt, endAt);
}

// ---------------------------------------------------------------------------
// open_play_join_pending → player (just joined, needs to pay)
// ---------------------------------------------------------------------------
export function openPlayJoinPendingEmail(ctx: OpenPlayEmailContext & {
  playerDisplayName: string;
}) {
  const when = formatOpenPlayWindow(ctx.startAt, ctx.endAt);
  const total = formatPHP(ctx.totalCentavos);
  const link = `${APP_URL}/open-play/signups/${ctx.signupId}/pay`;

  return {
    subject: `You're on the list — upload your GCash receipt for ${ctx.sessionTitle}`,
    html: shell({
      heading: `Almost in — finish your payment`,
      bodyHtml: `
        <p style="margin:0 0 12px 0;">Hi ${escapeHtml(ctx.playerDisplayName)}, you've reserved a seat at <strong>${escapeHtml(ctx.sessionTitle)}</strong>. Upload your GCash receipt within 15 minutes to lock it in.</p>
        <div style="background:#f1f5f9;border-radius:8px;padding:14px 16px;margin:16px 0;font-size:14px;">
          <p style="margin:0 0 6px 0;"><strong>Venue:</strong> ${escapeHtml(ctx.venueName)}</p>
          <p style="margin:0 0 6px 0;"><strong>Court:</strong> ${escapeHtml(ctx.courtName)}</p>
          <p style="margin:0 0 6px 0;"><strong>When:</strong> ${escapeHtml(when)}</p>
          <p style="margin:0;"><strong>Amount due:</strong> ${escapeHtml(total)}</p>
        </div>
        <p style="margin:0;">After the 15-minute window, your seat is released back to the pool.</p>
      `,
      ctaHref: link,
      ctaLabel: "Upload receipt",
    }),
    text:
      `Upload your GCash receipt\n\n` +
      `You've reserved a seat at ${ctx.sessionTitle}.\n\n` +
      `Venue: ${ctx.venueName}\nCourt: ${ctx.courtName}\nWhen: ${when}\nAmount due: ${total}\n\n` +
      `Pay here: ${link}\n`,
  };
}

// ---------------------------------------------------------------------------
// open_play_join_confirmed → player (payment verified)
// ---------------------------------------------------------------------------
export function openPlayJoinConfirmedEmail(ctx: OpenPlayEmailContext & {
  playerDisplayName: string;
}) {
  const when = formatOpenPlayWindow(ctx.startAt, ctx.endAt);
  const total = formatPHP(ctx.totalCentavos);
  const link = `${APP_URL}/me/open-play`;

  return {
    subject: `Seat confirmed — ${ctx.sessionTitle} on ${when}`,
    html: shell({
      heading: `You're in 🏸`,
      bodyHtml: `
        <p style="margin:0 0 12px 0;">Hi ${escapeHtml(ctx.playerDisplayName)}, the venue verified your payment. Your seat at <strong>${escapeHtml(ctx.sessionTitle)}</strong> is locked in.</p>
        <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:14px 16px;margin:16px 0;font-size:14px;">
          <p style="margin:0 0 6px 0;"><strong>Venue:</strong> ${escapeHtml(ctx.venueName)}</p>
          <p style="margin:0 0 6px 0;"><strong>Court:</strong> ${escapeHtml(ctx.courtName)}</p>
          <p style="margin:0 0 6px 0;"><strong>When:</strong> ${escapeHtml(when)}</p>
          <p style="margin:0;"><strong>Total paid:</strong> ${escapeHtml(total)}</p>
        </div>
        <p style="margin:0;">Show up 10 minutes early, bring water, and have a great game.</p>
      `,
      ctaHref: link,
      ctaLabel: "View my open-play",
    }),
    text:
      `Seat confirmed\n\n` +
      `Your seat at ${ctx.sessionTitle} is locked in.\n\n` +
      `Venue: ${ctx.venueName}\nCourt: ${ctx.courtName}\nWhen: ${when}\nTotal paid: ${total}\n\n` +
      `View: ${link}\n`,
  };
}

// ---------------------------------------------------------------------------
// open_play_signup_payment_submitted → owner (player uploaded receipt)
// ---------------------------------------------------------------------------
export function openPlaySignupPaymentSubmittedEmail(ctx: OpenPlayEmailContext & {
  ownerDisplayName: string;
  playerDisplayName: string;
  gcashReferenceNumber?: string | null;
}) {
  const when = formatOpenPlayWindow(ctx.startAt, ctx.endAt);
  const total = formatPHP(ctx.totalCentavos);
  const link = `${APP_URL}/owner/open-play/${ctx.sessionId}`;
  const refLine = ctx.gcashReferenceNumber
    ? `<p style="margin:0 0 6px 0;"><strong>GCash ref:</strong> ${escapeHtml(ctx.gcashReferenceNumber)}</p>`
    : "";

  return {
    subject: `Open Play receipt to verify — ${ctx.sessionTitle}`,
    html: shell({
      heading: `Receipt awaiting verification`,
      bodyHtml: `
        <p style="margin:0 0 12px 0;">Hi ${escapeHtml(ctx.ownerDisplayName)}, ${escapeHtml(ctx.playerDisplayName)} just uploaded a receipt for <strong>${escapeHtml(ctx.sessionTitle)}</strong>.</p>
        <div style="background:#f1f5f9;border-radius:8px;padding:14px 16px;margin:16px 0;font-size:14px;">
          <p style="margin:0 0 6px 0;"><strong>Venue:</strong> ${escapeHtml(ctx.venueName)}</p>
          <p style="margin:0 0 6px 0;"><strong>Court:</strong> ${escapeHtml(ctx.courtName)}</p>
          <p style="margin:0 0 6px 0;"><strong>When:</strong> ${escapeHtml(when)}</p>
          <p style="margin:0 0 6px 0;"><strong>Amount:</strong> ${escapeHtml(total)}</p>
          ${refLine}
        </div>
        <p style="margin:0;">Confirm in the session dashboard once funds arrive.</p>
      `,
      ctaHref: link,
      ctaLabel: "Open session",
    }),
    text:
      `Open Play receipt to verify\n\n` +
      `${ctx.playerDisplayName} uploaded a receipt for ${ctx.sessionTitle}.\n\n` +
      `Venue: ${ctx.venueName}\nCourt: ${ctx.courtName}\nWhen: ${when}\nAmount: ${total}\n` +
      (ctx.gcashReferenceNumber ? `GCash ref: ${ctx.gcashReferenceNumber}\n` : "") +
      `\nReview: ${link}\n`,
  };
}

// ---------------------------------------------------------------------------
// open_play_cancelled_by_owner → player (owner cancelled the whole session)
// ---------------------------------------------------------------------------
export function openPlayCancelledByOwnerEmail(ctx: OpenPlayEmailContext & {
  playerDisplayName: string;
  reason: string;
}) {
  const when = formatOpenPlayWindow(ctx.startAt, ctx.endAt);
  const link = `${APP_URL}/open-play`;
  return {
    subject: `Open Play cancelled — ${ctx.sessionTitle}`,
    html: shell({
      heading: `Session cancelled`,
      bodyHtml: `
        <p style="margin:0 0 12px 0;">Hi ${escapeHtml(ctx.playerDisplayName)}, the venue cancelled <strong>${escapeHtml(ctx.sessionTitle)}</strong> on ${escapeHtml(when)}.</p>
        <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:14px 16px;margin:16px 0;font-size:14px;">
          <p style="margin:0 0 4px 0;"><strong>Reason given:</strong></p>
          <p style="margin:0;color:#991b1b;">${escapeHtml(ctx.reason)}</p>
        </div>
        <p style="margin:0;">If you already paid, the venue will refund you directly via GCash.</p>
      `,
      ctaHref: link,
      ctaLabel: "Find another session",
    }),
    text:
      `Session cancelled\n\n` +
      `The venue cancelled ${ctx.sessionTitle} on ${when}.\n` +
      `Reason: ${ctx.reason}\n\n` +
      `If you already paid, the venue will refund via GCash directly.\n\n` +
      `Browse: ${link}\n`,
  };
}

// ---------------------------------------------------------------------------
// open_play_session_reminder → player (T-2h)
// ---------------------------------------------------------------------------
export function openPlaySessionReminderEmail(ctx: OpenPlayEmailContext & {
  playerDisplayName: string;
}) {
  const when = formatOpenPlayWindow(ctx.startAt, ctx.endAt);
  const link = `${APP_URL}/me/open-play`;
  return {
    subject: `Heads up — ${ctx.sessionTitle} starts in 2 hours`,
    html: shell({
      heading: `Open Play in 2 hours 🏸`,
      bodyHtml: `
        <p style="margin:0 0 12px 0;">Hi ${escapeHtml(ctx.playerDisplayName)}, your seat at <strong>${escapeHtml(ctx.sessionTitle)}</strong> kicks off soon.</p>
        <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:14px 16px;margin:16px 0;font-size:14px;">
          <p style="margin:0 0 6px 0;"><strong>Venue:</strong> ${escapeHtml(ctx.venueName)}</p>
          <p style="margin:0 0 6px 0;"><strong>Court:</strong> ${escapeHtml(ctx.courtName)}</p>
          <p style="margin:0;"><strong>When:</strong> ${escapeHtml(when)}</p>
        </div>
        <p style="margin:0;">Arrive 10 minutes early to warm up.</p>
      `,
      ctaHref: link,
      ctaLabel: "View signup",
    }),
    text:
      `Open Play in 2 hours\n\n` +
      `Your seat at ${ctx.sessionTitle} is coming up.\n\n` +
      `Venue: ${ctx.venueName}\nCourt: ${ctx.courtName}\nWhen: ${when}\n\n` +
      `View: ${link}\n`,
  };
}

// ---------------------------------------------------------------------------
// owner nudge 1 (polite) — receipt still unverified after 2 hours
// ---------------------------------------------------------------------------
export function ownerNudgeReceiptStaleEmail(ctx: BookingEmailContext & {
  ownerDisplayName: string;
  playerDisplayName: string;
  gcashReferenceNumber: string | null;
}) {
  const when = formatBookingWindow(ctx.startAt, ctx.endAt);
  const total = formatPHP(ctx.totalCentavos);
  const link = `${APP_URL}/owner/payments`;
  const refLine = ctx.gcashReferenceNumber
    ? `<p style="margin:0 0 6px 0;"><strong>GCash reference:</strong> ${escapeHtml(ctx.gcashReferenceNumber)}</p>`
    : "";

  return {
    subject: `Reminder: receipt awaiting your verification \u2014 ${ctx.venueName}`,
    html: shell({
      heading: `Receipt still needs your verification`,
      bodyHtml: `
        <p style="margin:0 0 12px 0;">Hi ${escapeHtml(ctx.ownerDisplayName)}, ${escapeHtml(ctx.playerDisplayName)} uploaded a payment receipt 2 hours ago and it's still awaiting your verification.</p>
        <div style="background:#f1f5f9;border-radius:8px;padding:14px 16px;margin:16px 0;font-size:14px;">
          <p style="margin:0 0 6px 0;"><strong>Venue:</strong> ${escapeHtml(ctx.venueName)}</p>
          <p style="margin:0 0 6px 0;"><strong>Court:</strong> ${escapeHtml(ctx.courtName)}</p>
          <p style="margin:0 0 6px 0;"><strong>When:</strong> ${escapeHtml(when)}</p>
          <p style="margin:0 0 6px 0;"><strong>Total:</strong> ${escapeHtml(total)}</p>
          ${refLine}
        </div>
        <p style="margin:0;">Verifying takes 10 seconds in your dashboard \u2014 it locks in the player's slot and triggers their confirmation email.</p>
      `,
      ctaHref: link,
      ctaLabel: "Verify now",
    }),
    text:
      `Reminder: receipt awaiting verification\n\n` +
      `${ctx.playerDisplayName} uploaded a receipt 2 hours ago and it still needs your verification.\n\n` +
      `Venue: ${ctx.venueName}\nCourt: ${ctx.courtName}\nWhen: ${when}\nTotal: ${total}\n` +
      (ctx.gcashReferenceNumber ? `GCash ref: ${ctx.gcashReferenceNumber}\n` : "") +
      `\nVerify: ${link}\n`,
  };
}

// ---------------------------------------------------------------------------
// owner nudge 2 (urgent) — session starts in under 2 hours
// ---------------------------------------------------------------------------
export function ownerNudgeReceiptUrgentEmail(ctx: BookingEmailContext & {
  ownerDisplayName: string;
  playerDisplayName: string;
  gcashReferenceNumber: string | null;
}) {
  const when = formatBookingWindow(ctx.startAt, ctx.endAt);
  const total = formatPHP(ctx.totalCentavos);
  const link = `${APP_URL}/owner/payments`;
  const refLine = ctx.gcashReferenceNumber
    ? `<p style="margin:0 0 6px 0;"><strong>GCash reference:</strong> ${escapeHtml(ctx.gcashReferenceNumber)}</p>`
    : "";

  return {
    subject: `URGENT: session in <2h, receipt still unverified \u2014 ${ctx.venueName}`,
    html: shell({
      heading: `Session starts soon \u2014 verify the receipt`,
      bodyHtml: `
        <p style="margin:0 0 12px 0;">Hi ${escapeHtml(ctx.ownerDisplayName)}, this booking starts in under 2 hours and the receipt is still pending verification.</p>
        <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:14px 16px;margin:16px 0;font-size:14px;">
          <p style="margin:0 0 6px 0;"><strong>Player:</strong> ${escapeHtml(ctx.playerDisplayName)}</p>
          <p style="margin:0 0 6px 0;"><strong>Venue:</strong> ${escapeHtml(ctx.venueName)}</p>
          <p style="margin:0 0 6px 0;"><strong>Court:</strong> ${escapeHtml(ctx.courtName)}</p>
          <p style="margin:0 0 6px 0;"><strong>When:</strong> ${escapeHtml(when)}</p>
          <p style="margin:0 0 6px 0;"><strong>Total:</strong> ${escapeHtml(total)}</p>
          ${refLine}
        </div>
        <p style="margin:0;">If you don't verify before T-30 minutes, DinkHub will auto-confirm on your behalf \u2014 the booking stays valid and you still get paid in your weekly payout.</p>
      `,
      ctaHref: link,
      ctaLabel: "Verify now",
    }),
    text:
      `URGENT: session in <2h, receipt still unverified\n\n` +
      `Player: ${ctx.playerDisplayName}\nVenue: ${ctx.venueName}\nCourt: ${ctx.courtName}\nWhen: ${when}\nTotal: ${total}\n` +
      (ctx.gcashReferenceNumber ? `GCash ref: ${ctx.gcashReferenceNumber}\n` : "") +
      `\nIf you don't verify before T-30m we will auto-confirm on your behalf.\nVerify: ${link}\n`,
  };
}

// ---------------------------------------------------------------------------
// booking auto-confirmed (both player and owner)
// ---------------------------------------------------------------------------
export function bookingAutoConfirmedEmail(ctx: BookingEmailContext & {
  recipientDisplayName: string;
  audience: "player" | "owner";
}) {
  const when = formatBookingWindow(ctx.startAt, ctx.endAt);
  const total = formatPHP(ctx.totalCentavos);
  const link =
    ctx.audience === "player"
      ? `${APP_URL}/me/bookings/${ctx.bookingId}`
      : `${APP_URL}/owner/bookings`;
  const body =
    ctx.audience === "player"
      ? `<p style="margin:0 0 12px 0;">Hi ${escapeHtml(ctx.recipientDisplayName)}, your receipt passed all of our automated checks and the venue didn't flag any issue, so we've auto-confirmed your booking. Your court is locked in.</p>`
      : `<p style="margin:0 0 12px 0;">Hi ${escapeHtml(ctx.recipientDisplayName)}, the receipt for the booking below passed all automated checks. To keep the player's session on track we've auto-confirmed it on your behalf. The court fee will appear in your next weekly payout as usual. If anything is wrong with the receipt, reply to this email within 24 hours.</p>`;

  return {
    subject: `Booking auto-confirmed \u2014 ${ctx.venueName} on ${when}`,
    html: shell({
      heading: `Booking auto-confirmed`,
      bodyHtml: `
        ${body}
        <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:14px 16px;margin:16px 0;font-size:14px;">
          <p style="margin:0 0 6px 0;"><strong>Venue:</strong> ${escapeHtml(ctx.venueName)}</p>
          <p style="margin:0 0 6px 0;"><strong>Court:</strong> ${escapeHtml(ctx.courtName)}</p>
          <p style="margin:0 0 6px 0;"><strong>When:</strong> ${escapeHtml(when)}</p>
          <p style="margin:0;"><strong>Total:</strong> ${escapeHtml(total)}</p>
        </div>
      `,
      ctaHref: link,
      ctaLabel: "Open dashboard",
    }),
    text:
      `Booking auto-confirmed\n\n` +
      `Venue: ${ctx.venueName}\nCourt: ${ctx.courtName}\nWhen: ${when}\nTotal: ${total}\n\n` +
      `View: ${link}\n`,
  };
}

// ---------------------------------------------------------------------------
// booking late-confirmed by admin (both parties)
// ---------------------------------------------------------------------------
export function bookingLateConfirmedEmail(ctx: BookingEmailContext & {
  recipientDisplayName: string;
  audience: "player" | "owner";
  reason: string;
}) {
  const when = formatBookingWindow(ctx.startAt, ctx.endAt);
  const total = formatPHP(ctx.totalCentavos);
  const link =
    ctx.audience === "player"
      ? `${APP_URL}/me/bookings/${ctx.bookingId}`
      : `${APP_URL}/owner/bookings`;

  return {
    subject: `Booking confirmed after the fact \u2014 ${ctx.venueName}`,
    html: shell({
      heading: `Booking confirmed by DinkHub support`,
      bodyHtml: `
        <p style="margin:0 0 12px 0;">Hi ${escapeHtml(ctx.recipientDisplayName)}, the booking below was confirmed by a DinkHub admin after the session window ended. The ledger has been updated and the court fee will appear in the next weekly payout.</p>
        <div style="background:#f1f5f9;border-radius:8px;padding:14px 16px;margin:16px 0;font-size:14px;">
          <p style="margin:0 0 6px 0;"><strong>Venue:</strong> ${escapeHtml(ctx.venueName)}</p>
          <p style="margin:0 0 6px 0;"><strong>Court:</strong> ${escapeHtml(ctx.courtName)}</p>
          <p style="margin:0 0 6px 0;"><strong>When:</strong> ${escapeHtml(when)}</p>
          <p style="margin:0 0 6px 0;"><strong>Total:</strong> ${escapeHtml(total)}</p>
          <p style="margin:0;"><strong>Admin note:</strong> ${escapeHtml(ctx.reason)}</p>
        </div>
        <p style="margin:0;">If you believe this confirmation is incorrect, reply to this email and a support agent will review.</p>
      `,
      ctaHref: link,
      ctaLabel: "Open dashboard",
    }),
    text:
      `Booking confirmed by DinkHub support\n\n` +
      `Venue: ${ctx.venueName}\nCourt: ${ctx.courtName}\nWhen: ${when}\nTotal: ${total}\n` +
      `Admin note: ${ctx.reason}\n\n` +
      `View: ${link}\n`,
  };
}

// ---------------------------------------------------------------------------
// open_play owner nudge 1 (polite) — signup receipt unverified after 2h
// ---------------------------------------------------------------------------
export function openPlayOwnerNudgeReceiptStaleEmail(ctx: OpenPlayEmailContext & {
  ownerDisplayName: string;
  playerDisplayName: string;
  gcashReferenceNumber: string | null;
}) {
  const when = formatOpenPlayWindow(ctx.startAt, ctx.endAt);
  const total = formatPHP(ctx.totalCentavos);
  const link = `${APP_URL}/owner/open-play/${ctx.sessionId}`;
  const refLine = ctx.gcashReferenceNumber
    ? `<p style="margin:0 0 6px 0;"><strong>GCash reference:</strong> ${escapeHtml(ctx.gcashReferenceNumber)}</p>`
    : "";

  return {
    subject: `Reminder: open-play receipt awaiting verification \u2014 ${ctx.venueName}`,
    html: shell({
      heading: `Open-play receipt still needs your verification`,
      bodyHtml: `
        <p style="margin:0 0 12px 0;">Hi ${escapeHtml(ctx.ownerDisplayName)}, ${escapeHtml(ctx.playerDisplayName)} uploaded a payment receipt for <strong>${escapeHtml(ctx.sessionTitle)}</strong> 2 hours ago and it's still awaiting your verification.</p>
        <div style="background:#f1f5f9;border-radius:8px;padding:14px 16px;margin:16px 0;font-size:14px;">
          <p style="margin:0 0 6px 0;"><strong>Venue:</strong> ${escapeHtml(ctx.venueName)}</p>
          <p style="margin:0 0 6px 0;"><strong>Court:</strong> ${escapeHtml(ctx.courtName)}</p>
          <p style="margin:0 0 6px 0;"><strong>When:</strong> ${escapeHtml(when)}</p>
          <p style="margin:0 0 6px 0;"><strong>Total:</strong> ${escapeHtml(total)}</p>
          ${refLine}
        </div>
        <p style="margin:0;">Verifying takes 10 seconds in your dashboard \u2014 it locks in the player's seat and triggers their confirmation email.</p>
      `,
      ctaHref: link,
      ctaLabel: "Verify now",
    }),
    text:
      `Reminder: open-play receipt awaiting verification\n\n` +
      `${ctx.playerDisplayName} uploaded a receipt for ${ctx.sessionTitle} 2 hours ago and it still needs your verification.\n\n` +
      `Venue: ${ctx.venueName}\nCourt: ${ctx.courtName}\nWhen: ${when}\nTotal: ${total}\n` +
      (ctx.gcashReferenceNumber ? `GCash ref: ${ctx.gcashReferenceNumber}\n` : "") +
      `\nVerify: ${link}\n`,
  };
}

// ---------------------------------------------------------------------------
// open_play owner nudge 2 (urgent) — session in <2h, receipt unverified
// ---------------------------------------------------------------------------
export function openPlayOwnerNudgeReceiptUrgentEmail(ctx: OpenPlayEmailContext & {
  ownerDisplayName: string;
  playerDisplayName: string;
  gcashReferenceNumber: string | null;
}) {
  const when = formatOpenPlayWindow(ctx.startAt, ctx.endAt);
  const total = formatPHP(ctx.totalCentavos);
  const link = `${APP_URL}/owner/open-play/${ctx.sessionId}`;
  const refLine = ctx.gcashReferenceNumber
    ? `<p style="margin:0 0 6px 0;"><strong>GCash reference:</strong> ${escapeHtml(ctx.gcashReferenceNumber)}</p>`
    : "";

  return {
    subject: `URGENT: open-play session in <2h, receipt unverified \u2014 ${ctx.venueName}`,
    html: shell({
      heading: `Open-play starts soon \u2014 verify the receipt`,
      bodyHtml: `
        <p style="margin:0 0 12px 0;">Hi ${escapeHtml(ctx.ownerDisplayName)}, this open-play seat starts in under 2 hours and the receipt is still pending verification.</p>
        <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:14px 16px;margin:16px 0;font-size:14px;">
          <p style="margin:0 0 6px 0;"><strong>Player:</strong> ${escapeHtml(ctx.playerDisplayName)}</p>
          <p style="margin:0 0 6px 0;"><strong>Session:</strong> ${escapeHtml(ctx.sessionTitle)}</p>
          <p style="margin:0 0 6px 0;"><strong>Venue:</strong> ${escapeHtml(ctx.venueName)}</p>
          <p style="margin:0 0 6px 0;"><strong>Court:</strong> ${escapeHtml(ctx.courtName)}</p>
          <p style="margin:0 0 6px 0;"><strong>When:</strong> ${escapeHtml(when)}</p>
          <p style="margin:0 0 6px 0;"><strong>Total:</strong> ${escapeHtml(total)}</p>
          ${refLine}
        </div>
        <p style="margin:0;">If you don't verify before T-30 minutes, DinkHub will auto-confirm on your behalf \u2014 the seat stays valid and the fee still flows through your next weekly payout.</p>
      `,
      ctaHref: link,
      ctaLabel: "Verify now",
    }),
    text:
      `URGENT: open-play session in <2h, receipt unverified\n\n` +
      `Player: ${ctx.playerDisplayName}\nSession: ${ctx.sessionTitle}\nVenue: ${ctx.venueName}\nCourt: ${ctx.courtName}\nWhen: ${when}\nTotal: ${total}\n` +
      (ctx.gcashReferenceNumber ? `GCash ref: ${ctx.gcashReferenceNumber}\n` : "") +
      `\nIf you don't verify before T-30m we will auto-confirm on your behalf.\nVerify: ${link}\n`,
  };
}

// ---------------------------------------------------------------------------
// open_play signup auto-confirmed (both player and owner)
// ---------------------------------------------------------------------------
export function openPlaySignupAutoConfirmedEmail(ctx: OpenPlayEmailContext & {
  recipientDisplayName: string;
  audience: "player" | "owner";
}) {
  const when = formatOpenPlayWindow(ctx.startAt, ctx.endAt);
  const total = formatPHP(ctx.totalCentavos);
  const link =
    ctx.audience === "player"
      ? `${APP_URL}/me/open-play`
      : `${APP_URL}/owner/open-play/${ctx.sessionId}`;
  const body =
    ctx.audience === "player"
      ? `<p style="margin:0 0 12px 0;">Hi ${escapeHtml(ctx.recipientDisplayName)}, your receipt for <strong>${escapeHtml(ctx.sessionTitle)}</strong> passed all of our automated checks and the venue didn't flag any issue, so we've auto-confirmed your seat. You're in.</p>`
      : `<p style="margin:0 0 12px 0;">Hi ${escapeHtml(ctx.recipientDisplayName)}, the receipt for the open-play signup below passed all automated checks. To keep the player's session on track we've auto-confirmed it on your behalf. The fee will appear in your next weekly payout as usual. If anything is wrong with the receipt, reply to this email within 24 hours.</p>`;

  return {
    subject: `Open-play seat auto-confirmed \u2014 ${ctx.venueName} on ${when}`,
    html: shell({
      heading: `Open-play seat auto-confirmed`,
      bodyHtml: `
        ${body}
        <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:14px 16px;margin:16px 0;font-size:14px;">
          <p style="margin:0 0 6px 0;"><strong>Session:</strong> ${escapeHtml(ctx.sessionTitle)}</p>
          <p style="margin:0 0 6px 0;"><strong>Venue:</strong> ${escapeHtml(ctx.venueName)}</p>
          <p style="margin:0 0 6px 0;"><strong>Court:</strong> ${escapeHtml(ctx.courtName)}</p>
          <p style="margin:0 0 6px 0;"><strong>When:</strong> ${escapeHtml(when)}</p>
          <p style="margin:0;"><strong>Total:</strong> ${escapeHtml(total)}</p>
        </div>
      `,
      ctaHref: link,
      ctaLabel: "Open dashboard",
    }),
    text:
      `Open-play seat auto-confirmed\n\n` +
      `Session: ${ctx.sessionTitle}\nVenue: ${ctx.venueName}\nCourt: ${ctx.courtName}\nWhen: ${when}\nTotal: ${total}\n\n` +
      `View: ${link}\n`,
  };
}

// ---------------------------------------------------------------------------
// open_play signup late-confirmed by admin (both parties)
// ---------------------------------------------------------------------------
export function openPlaySignupLateConfirmedEmail(ctx: OpenPlayEmailContext & {
  recipientDisplayName: string;
  audience: "player" | "owner";
  reason: string;
}) {
  const when = formatOpenPlayWindow(ctx.startAt, ctx.endAt);
  const total = formatPHP(ctx.totalCentavos);
  const link =
    ctx.audience === "player"
      ? `${APP_URL}/me/open-play`
      : `${APP_URL}/owner/open-play/${ctx.sessionId}`;

  return {
    subject: `Open-play seat confirmed after the fact \u2014 ${ctx.venueName}`,
    html: shell({
      heading: `Open-play seat confirmed by DinkHub support`,
      bodyHtml: `
        <p style="margin:0 0 12px 0;">Hi ${escapeHtml(ctx.recipientDisplayName)}, the open-play signup below was confirmed by a DinkHub admin after the session window ended. The ledger has been updated and the fee will appear in the next weekly payout.</p>
        <div style="background:#f1f5f9;border-radius:8px;padding:14px 16px;margin:16px 0;font-size:14px;">
          <p style="margin:0 0 6px 0;"><strong>Session:</strong> ${escapeHtml(ctx.sessionTitle)}</p>
          <p style="margin:0 0 6px 0;"><strong>Venue:</strong> ${escapeHtml(ctx.venueName)}</p>
          <p style="margin:0 0 6px 0;"><strong>Court:</strong> ${escapeHtml(ctx.courtName)}</p>
          <p style="margin:0 0 6px 0;"><strong>When:</strong> ${escapeHtml(when)}</p>
          <p style="margin:0 0 6px 0;"><strong>Total:</strong> ${escapeHtml(total)}</p>
          <p style="margin:0;"><strong>Admin note:</strong> ${escapeHtml(ctx.reason)}</p>
        </div>
        <p style="margin:0;">If you believe this confirmation is incorrect, reply to this email and a support agent will review.</p>
      `,
      ctaHref: link,
      ctaLabel: "Open dashboard",
    }),
    text:
      `Open-play seat confirmed by DinkHub support\n\n` +
      `Session: ${ctx.sessionTitle}\nVenue: ${ctx.venueName}\nCourt: ${ctx.courtName}\nWhen: ${when}\nTotal: ${total}\n` +
      `Admin note: ${ctx.reason}\n\n` +
      `View: ${link}\n`,
  };
}

