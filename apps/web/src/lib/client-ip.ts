/**
 * Extract the originating client IP from forwarding headers. Returns null when
 * we cannot determine it (e.g. local dev without a proxy). Never trust this
 * for authorization — it is provided by the edge and only useful as a hint
 * for rate limit bucketing.
 */
export function getClientIp(headers: Headers): string | null {
  const xff = headers.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  return headers.get("x-real-ip");
}
