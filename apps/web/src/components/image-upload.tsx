"use client";

import { ImagePlus, X } from "lucide-react";
import { useId, useRef, useState } from "react";
import { cn } from "@/lib/cn";

export interface ImageUploadProps {
  /** Form field name. The selected File is submitted via FormData under this name. */
  name: string;
  /** Existing image URL to show as the initial preview. */
  initialUrl?: string | null;
  /**
   * Hidden field name that mirrors the existing storage path. Sent so the
   * action knows what to keep when no new file is picked, and what to delete
   * if the user clears the image.
   */
  existingPathName?: string;
  initialPath?: string | null;
  /**
   * Hidden flag the action checks to wipe the existing image. Defaults to
   * `${name}__remove`.
   */
  removeFlagName?: string;
  label?: string;
  hint?: string;
  className?: string;
  /** 16/9, 4/3, 1/1 — controls preview aspect. */
  aspect?: "video" | "square" | "card";
  invalid?: boolean;
}

const ACCEPT = "image/jpeg,image/png,image/webp";
const MAX_BYTES = 5 * 1024 * 1024;

export function ImageUpload({
  name,
  initialUrl,
  existingPathName,
  initialPath,
  removeFlagName,
  label,
  hint,
  className,
  aspect = "video",
  invalid,
}: ImageUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const reactId = useId();
  const inputId = `${reactId}-${name}`;
  const removeName = removeFlagName ?? `${name}__remove`;
  const [previewUrl, setPreviewUrl] = useState<string | null>(initialUrl ?? null);
  const [pickedFileName, setPickedFileName] = useState<string | null>(null);
  const [removed, setRemoved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const aspectClass =
    aspect === "square"
      ? "aspect-square"
      : aspect === "card"
        ? "aspect-[4/3]"
        : "aspect-[16/9]";

  function handleFile(file: File | undefined): void {
    setError(null);
    if (!file) return;
    if (file.size > MAX_BYTES) {
      setError("Image must be 5 MB or smaller");
      if (inputRef.current) inputRef.current.value = "";
      return;
    }
    if (!ACCEPT.split(",").includes(file.type)) {
      setError("Only JPEG, PNG or WebP");
      if (inputRef.current) inputRef.current.value = "";
      return;
    }
    if (previewUrl && previewUrl.startsWith("blob:")) {
      URL.revokeObjectURL(previewUrl);
    }
    setPreviewUrl(URL.createObjectURL(file));
    setPickedFileName(file.name);
    setRemoved(false);
  }

  function handleClear(): void {
    if (previewUrl && previewUrl.startsWith("blob:")) {
      URL.revokeObjectURL(previewUrl);
    }
    setPreviewUrl(null);
    setPickedFileName(null);
    setRemoved(true);
    setError(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  return (
    <div className={cn("space-y-2", className)}>
      {label && (
        <label htmlFor={inputId} className="block text-sm font-medium text-[var(--color-fg)]">
          {label}
        </label>
      )}

      <div
        className={cn(
          "relative flex w-full overflow-hidden rounded-[var(--radius-md)] border-2 border-dashed bg-[var(--color-bg-subtle)]",
          invalid
            ? "border-[var(--color-danger)]"
            : "border-[var(--color-border-default)] hover:border-[var(--color-brand-500)]",
          aspectClass,
        )}
      >
        {previewUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={previewUrl}
            alt="Selected image preview"
            className="h-full w-full object-cover"
          />
        ) : (
          <label
            htmlFor={inputId}
            className="flex h-full w-full cursor-pointer flex-col items-center justify-center gap-2 text-center text-[var(--color-fg-muted)]"
          >
            <ImagePlus className="size-7" aria-hidden="true" />
            <span className="text-sm font-medium">Tap to upload an image</span>
            <span className="text-xs">JPG, PNG or WebP · up to 5 MB</span>
          </label>
        )}

        {previewUrl && (
          <button
            type="button"
            onClick={handleClear}
            className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-full bg-black/60 px-2.5 py-1 text-xs font-medium text-white shadow-sm backdrop-blur-sm hover:bg-black/75"
            aria-label="Remove image"
          >
            <X className="size-3.5" aria-hidden="true" /> Remove
          </button>
        )}
      </div>

      <div className="flex items-center justify-between gap-3 text-xs">
        <span className="text-[var(--color-fg-muted)]">
          {pickedFileName ?? hint ?? " "}
        </span>
        {previewUrl && (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="text-[var(--color-brand-700)] hover:underline"
          >
            Replace
          </button>
        )}
      </div>

      {error && (
        <p className="text-xs text-[var(--color-danger)]" role="alert">
          {error}
        </p>
      )}

      <input
        ref={inputRef}
        id={inputId}
        type="file"
        name={name}
        accept={ACCEPT}
        className="sr-only"
        onChange={(e) => handleFile(e.target.files?.[0])}
      />

      {existingPathName && (
        <input type="hidden" name={existingPathName} value={initialPath ?? ""} />
      )}
      <input type="hidden" name={removeName} value={removed ? "1" : ""} />
    </div>
  );
}
