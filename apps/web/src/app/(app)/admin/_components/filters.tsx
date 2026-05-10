import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";

interface FiltersProps<S extends string> {
  basePath: string;
  /** Reserved for future hidden-input passthrough; kept on the public API. */
  currentParams: Record<string, string>;
  statusOptions: ReadonlyArray<{ value: S; label: string }>;
  currentStatus: S;
  searchPlaceholder?: string;
  currentQuery?: string;
  className?: string;
  extraSelects?: ReadonlyArray<{
    name: string;
    currentValue: string;
    options: ReadonlyArray<{ value: string; label: string }>;
  }>;
}

/**
 * Plain GET form so we don't need client JS. Each submit replaces the URL.
 * Hidden inputs preserve params we don't render as inputs (none today, but
 * keeps the contract explicit).
 */
export function AdminFilters<S extends string>({
  basePath,
  currentParams: _currentParams, // eslint-disable-line @typescript-eslint/no-unused-vars
  statusOptions,
  currentStatus,
  searchPlaceholder = "Search…",
  currentQuery = "",
  className,
  extraSelects = [],
}: FiltersProps<S>) {
  return (
    <form
      action={basePath}
      method="get"
      className={cn(
        "flex flex-wrap items-end gap-3 rounded-[var(--radius-md)] border border-[var(--color-border-default)] bg-[var(--color-bg-subtle)] p-3",
        className,
      )}
    >
      <div className="min-w-[200px] flex-1">
        <label htmlFor="filter-q" className="block text-xs font-medium text-[var(--color-fg-muted)]">
          Search
        </label>
        <Input
          id="filter-q"
          name="q"
          defaultValue={currentQuery}
          placeholder={searchPlaceholder}
          className="mt-1"
        />
      </div>

      <div>
        <label htmlFor="filter-status" className="block text-xs font-medium text-[var(--color-fg-muted)]">
          Status
        </label>
        <Select id="filter-status" name="status" defaultValue={currentStatus} className="mt-1 min-w-[160px]">
          {statusOptions.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>
      </div>

      {extraSelects.map((s) => (
        <div key={s.name}>
          <label
            htmlFor={`filter-${s.name}`}
            className="block text-xs font-medium capitalize text-[var(--color-fg-muted)]"
          >
            {s.name}
          </label>
          <Select
            id={`filter-${s.name}`}
            name={s.name}
            defaultValue={s.currentValue}
            className="mt-1 min-w-[160px]"
          >
            {s.options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
        </div>
      ))}

      <Button type="submit" size="sm" className="mb-[1px]">
        Apply
      </Button>
    </form>
  );
}
