/**
 * Receipt auto-validation: heuristic failure-code metadata.
 *
 * Migration `0030_receipt_auto_validation.sql` stores opaque failure codes in
 * `payments.auto_validation_failures text[]`. This module is the single source
 * of truth that maps each code to its UI presentation so the player page, the
 * owner verification card, and the admin late-confirm tool stay in sync.
 *
 * If you add a new heuristic in `service.submitPayment`, add it here too.
 */

export const AUTO_VALIDATION_RULE_CODES = [
  "ref_format",
  "ref_duplicate",
  "hash_replay",
  "window_late",
  "window_early",
] as const;

export type AutoValidationFailureCode = (typeof AUTO_VALIDATION_RULE_CODES)[number];

export interface AutoValidationRule {
  /** Short label shown on chips and check rows. */
  readonly label: string;
  /** Description shown to the owner when this rule fails. */
  readonly ownerHint: string;
  /** Description shown to the admin during late-confirm triage. */
  readonly adminHint: string;
  /** `warning` = needs a second look. `danger` = strong signal of fraud/replay. */
  readonly severity: "warning" | "danger";
}

export const AUTO_VALIDATION_RULES: Readonly<Record<AutoValidationFailureCode, AutoValidationRule>> = {
  ref_format: {
    label: "Reference number format",
    ownerHint: "GCash reference is not 10–16 digits. Compare against the receipt image.",
    adminHint: "Player-supplied reference is not 10–16 digits — likely a typo.",
    severity: "warning",
  },
  ref_duplicate: {
    label: "Reference reused",
    ownerHint: "Same GCash reference was submitted on another booking in the last 90 days.",
    adminHint: "Same reference seen on another booking in the last 90 days. Possible double-claim.",
    severity: "danger",
  },
  hash_replay: {
    label: "Receipt image reused",
    ownerHint: "An identical receipt image was already submitted in the last 90 days.",
    adminHint: "Identical receipt hash exists on another booking. Likely replay.",
    severity: "danger",
  },
  window_late: {
    label: "Uploaded after session start",
    ownerHint: "Receipt was uploaded more than 30 minutes after the session started.",
    adminHint: "Upload timestamp is more than 30 min past session start.",
    severity: "warning",
  },
  window_early: {
    label: "Implausible upload time",
    ownerHint: "Upload timestamp is earlier than the booking creation time.",
    adminHint: "Upload timestamp is earlier than booking creation — clock skew or tampering.",
    severity: "warning",
  },
};

export function isAutoValidationFailureCode(value: string): value is AutoValidationFailureCode {
  return (AUTO_VALIDATION_RULE_CODES as readonly string[]).includes(value);
}

export interface AutoValidationSummary {
  passed: boolean;
  failures: ReadonlyArray<{ code: AutoValidationFailureCode; rule: AutoValidationRule }>;
  /** Codes received that are not recognised (forward-compat safety net). */
  unknown: readonly string[];
}

export function summarizeAutoValidation(failureCodes: readonly string[]): AutoValidationSummary {
  const failures: Array<{ code: AutoValidationFailureCode; rule: AutoValidationRule }> = [];
  const unknown: string[] = [];
  for (const code of failureCodes) {
    if (isAutoValidationFailureCode(code)) {
      failures.push({ code, rule: AUTO_VALIDATION_RULES[code] });
    } else {
      unknown.push(code);
    }
  }
  return { passed: failures.length === 0 && unknown.length === 0, failures, unknown };
}
