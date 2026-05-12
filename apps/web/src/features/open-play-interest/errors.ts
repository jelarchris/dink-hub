export type OpenPlayInterestErrorCode =
  | "validation_failed"
  | "rate_limited"
  | "spam_detected"
  | "unknown";

export class OpenPlayInterestError extends Error {
  readonly code: OpenPlayInterestErrorCode;
  readonly fieldErrors?: Record<string, string[]>;

  constructor(
    code: OpenPlayInterestErrorCode,
    message: string,
    fieldErrors?: Record<string, string[]>,
  ) {
    super(message);
    this.code = code;
    if (fieldErrors !== undefined) this.fieldErrors = fieldErrors;
  }
}

export function isOpenPlayInterestError(err: unknown): err is OpenPlayInterestError {
  return err instanceof OpenPlayInterestError;
}
