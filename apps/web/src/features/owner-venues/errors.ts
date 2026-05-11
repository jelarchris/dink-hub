export type OwnerVenueErrorCode =
  | "not_owner"
  | "venue_not_found"
  | "court_not_found"
  | "not_found"
  | "forbidden"
  | "slug_taken"
  | "version_conflict"
  | "validation"
  | "court_has_active_bookings"
  | "closure_overlap"
  | "unknown";

export class OwnerVenueError extends Error {
  readonly code: OwnerVenueErrorCode;
  constructor(code: OwnerVenueErrorCode, message: string) {
    super(message);
    this.name = "OwnerVenueError";
    this.code = code;
  }
}

export function isOwnerVenueError(err: unknown): err is OwnerVenueError {
  return err instanceof OwnerVenueError;
}
