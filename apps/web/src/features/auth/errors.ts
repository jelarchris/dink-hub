export type AuthErrorCode =
  | "validation_failed"
  | "invalid_credentials"
  | "email_taken"
  | "rate_limited"
  | "email_not_confirmed"
  | "unknown";

export class AuthError extends Error {
  public readonly code: AuthErrorCode;
  public readonly fieldErrors: Record<string, string[]> | undefined;

  constructor(code: AuthErrorCode, message: string, fieldErrors?: Record<string, string[]>) {
    super(message);
    this.name = "AuthError";
    this.code = code;
    this.fieldErrors = fieldErrors;
  }
}

export function isAuthError(err: unknown): err is AuthError {
  return err instanceof AuthError;
}
