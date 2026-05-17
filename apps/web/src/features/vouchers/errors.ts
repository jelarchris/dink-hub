export class VoucherError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = "VoucherError";
  }
}

export function isVoucherError(err: unknown): err is VoucherError {
  return err instanceof VoucherError;
}
