"use client";

import { useState } from "react";
import { Crosshair, ExternalLink, MapPin } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/cn";
import {
  formatMapAddress,
  googleMapsAddressSearchUrl,
  googleMapsEmbedUrl,
  googleMapsSearchUrl,
  normalizeCoordinatePair,
} from "@/lib/maps";

export interface VenueLocationPickerProps {
  initialLatitude?: string | null | undefined;
  initialLongitude?: string | null | undefined;
  addressLine?: string | null | undefined;
  city?: string | null | undefined;
  province?: string | null | undefined;
  latitudeError?: string | undefined;
  longitudeError?: string | undefined;
}

type LocateState = "idle" | "locating" | "success" | "error" | "unsupported";

export function VenueLocationPicker({
  initialLatitude,
  initialLongitude,
  addressLine,
  city,
  province,
  latitudeError,
  longitudeError,
}: VenueLocationPickerProps) {
  const [latitude, setLatitude] = useState(initialLatitude ?? "");
  const [longitude, setLongitude] = useState(initialLongitude ?? "");
  const [locateState, setLocateState] = useState<LocateState>("idle");
  const [accuracyMeters, setAccuracyMeters] = useState<number | null>(null);

  const coordinates = normalizeCoordinatePair({ latitude, longitude });
  const fallbackAddress = formatMapAddress([addressLine, city, province]);

  async function useCurrentLocation() {
    if (!navigator.geolocation) {
      setLocateState("unsupported");
      return;
    }

    setLocateState("locating");
    setAccuracyMeters(null);

    try {
      const position = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          maximumAge: 30_000,
          timeout: 15_000,
        });
      });
      setLatitude(position.coords.latitude.toFixed(6));
      setLongitude(position.coords.longitude.toFixed(6));
      setAccuracyMeters(Math.round(position.coords.accuracy));
      setLocateState("success");
    } catch {
      setLocateState("error");
    }
  }

  return (
    <div className="space-y-3 rounded-[var(--radius-lg)] border border-[var(--color-border-default)] bg-[var(--color-bg-subtle)] p-3 sm:p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-sm font-semibold text-[var(--color-fg)]">
            <MapPin className="size-4 text-[var(--color-brand-700)]" />
            Map pin
          </div>
          <p className="mt-1 text-xs leading-relaxed text-[var(--color-fg-muted)]">
            Save the exact court entrance so players can open directions from the venue page.
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          className="w-full shrink-0 sm:w-auto"
          disabled={locateState === "locating"}
          onClick={useCurrentLocation}
        >
          <Crosshair className="size-4" />
          {locateState === "locating" ? "Locating" : "Use current location"}
        </Button>
      </div>

      {locateState !== "idle" && (
        <p
          className={cn(
            "text-xs",
            locateState === "success" ? "text-emerald-700" : "text-[var(--color-fg-muted)]",
            (locateState === "error" || locateState === "unsupported") && "text-orange-700",
          )}
        >
          {locateState === "success"
            ? `Pin captured${accuracyMeters !== null ? ` within about ${accuracyMeters}m` : ""}.`
            : locateState === "error"
              ? "Location access was blocked or timed out. You can still paste coordinates."
              : locateState === "unsupported"
                ? "This browser cannot read device location."
                : "Getting your device location..."}
        </p>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <FormField id="latitude" label="Latitude" hint="-90 to 90" error={latitudeError}>
          {({ id, describedBy, invalid }) => (
            <Input
              id={id}
              name="latitude"
              inputMode="decimal"
              value={latitude}
              onChange={(event) => setLatitude(event.currentTarget.value)}
              aria-describedby={describedBy}
              invalid={invalid}
            />
          )}
        </FormField>
        <FormField id="longitude" label="Longitude" hint="-180 to 180" error={longitudeError}>
          {({ id, describedBy, invalid }) => (
            <Input
              id={id}
              name="longitude"
              inputMode="decimal"
              value={longitude}
              onChange={(event) => setLongitude(event.currentTarget.value)}
              aria-describedby={describedBy}
              invalid={invalid}
            />
          )}
        </FormField>
      </div>

      {coordinates ? (
        <div className="overflow-hidden rounded-[var(--radius-md)] border border-[var(--color-border-default)] bg-[var(--color-bg)]">
          <iframe
            title="Venue map preview"
            src={googleMapsEmbedUrl(coordinates)}
            className="h-52 w-full sm:h-64"
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
          />
          <div className="flex flex-col gap-2 border-t border-[var(--color-border-default)] p-3 sm:flex-row sm:items-center sm:justify-between">
            <span className="text-xs text-[var(--color-fg-muted)]">
              {coordinates.latitude}, {coordinates.longitude}
            </span>
            <a
              href={googleMapsSearchUrl(coordinates)}
              target="_blank"
              rel="noreferrer"
              className={buttonVariants({ variant: "secondary", size: "sm" })}
            >
              Open map <ExternalLink className="size-4" />
            </a>
          </div>
        </div>
      ) : (
        <a
          href={googleMapsAddressSearchUrl(fallbackAddress || "Bayugan City Agusan del Sur")}
          target="_blank"
          rel="noreferrer"
          className={cn(buttonVariants({ variant: "secondary", size: "sm" }), "w-full sm:w-fit")}
        >
          Search address in Google Maps <ExternalLink className="size-4" />
        </a>
      )}
    </div>
  );
}
