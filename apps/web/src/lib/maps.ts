export interface CoordinatePair {
  latitude: string;
  longitude: string;
}

function toFiniteNumber(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function normalizeCoordinatePair(args: {
  latitude: string | number | null | undefined;
  longitude: string | number | null | undefined;
}): CoordinatePair | null {
  const latitude = toFiniteNumber(args.latitude);
  const longitude = toFiniteNumber(args.longitude);
  if (latitude === null || longitude === null) return null;
  if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null;

  return {
    latitude: latitude.toFixed(6),
    longitude: longitude.toFixed(6),
  };
}

export function googleMapsSearchUrl(coordinates: CoordinatePair): string {
  const query = encodeURIComponent(`${coordinates.latitude},${coordinates.longitude}`);
  return `https://www.google.com/maps/search/?api=1&query=${query}`;
}

export function googleMapsDirectionsUrl(coordinates: CoordinatePair): string {
  const destination = encodeURIComponent(`${coordinates.latitude},${coordinates.longitude}`);
  return `https://www.google.com/maps/dir/?api=1&destination=${destination}`;
}

export function googleMapsEmbedUrl(coordinates: CoordinatePair): string {
  const query = encodeURIComponent(`${coordinates.latitude},${coordinates.longitude}`);
  return `https://maps.google.com/maps?q=${query}&z=16&output=embed`;
}

export function googleMapsAddressSearchUrl(address: string): string {
  const query = encodeURIComponent(address);
  return `https://www.google.com/maps/search/?api=1&query=${query}`;
}

export function formatMapAddress(parts: Array<string | null | undefined>): string {
  const seen = new Set<string>();
  const uniqueParts: string[] = [];

  for (const part of parts) {
    const trimmed = part?.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key) || uniqueParts.some((existing) => existing.toLowerCase().includes(key))) {
      continue;
    }
    seen.add(key);
    uniqueParts.push(trimmed);
  }

  return uniqueParts.join(", ");
}
