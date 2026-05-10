import "server-only";
import { env } from "@/lib/env";
import { formatPHP } from "@/lib/money";
import { formatDateTimeManila } from "@/lib/date";

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
  const when = formatDateTimeManila(ctx.startAt);
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
}) {
  const when = formatDateTimeManila(ctx.startAt);
  const total = formatPHP(ctx.totalCentavos);
  const link = `${APP_URL}/me/bookings`;

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
          <p style="margin:0;"><strong>Total paid:</strong> ${escapeHtml(total)}</p>
        </div>
        <p style="margin:0;">Bring a friend, bring water, and enjoy your game.</p>
      `,
      ctaHref: link,
      ctaLabel: "View my bookings",
    }),
    text:
      `Booking confirmed\n\n` +
      `Your payment has been verified.\n\n` +
      `Venue: ${ctx.venueName}\nCourt: ${ctx.courtName}\nWhen: ${when}\nTotal paid: ${total}\n\n` +
      `View: ${link}\n`,
  };
}

// ---------------------------------------------------------------------------
// payment_rejected \u2192 player
// ---------------------------------------------------------------------------
export function paymentRejectedEmail(ctx: BookingEmailContext & {
  playerDisplayName: string;
  reason: string;
}) {
  const when = formatDateTimeManila(ctx.startAt);
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
  const when = formatDateTimeManila(ctx.startAt);
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
}) {
  const when = formatDateTimeManila(ctx.startAt);
  const link = `${APP_URL}/me/bookings`;

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
        <p style="margin:0;">If you've already paid and a refund is owed, our team will contact you separately to coordinate it.</p>
      `,
      ctaHref: link,
      ctaLabel: "View my bookings",
    }),
    text:
      `Your booking was cancelled by support\n\n` +
      `Venue: ${ctx.venueName}\nCourt: ${ctx.courtName}\nWhen: ${when}\n\n` +
      `Reason: ${ctx.reason}\n\n` +
      `If a refund is owed, our team will contact you separately.\n\n` +
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
  const when = formatDateTimeManila(ctx.startAt);
  const link = `${APP_URL}/me/bookings`;

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
  const when = formatDateTimeManila(ctx.startAt);
  const total = formatPHP(ctx.totalCentavos);
  const isRefund = ctx.resolution === "refund_full";
  const link = `${APP_URL}/me/bookings`;
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
