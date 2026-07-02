import { Button } from "./ui/button";
import { Input } from "./ui/input";

type PaginationControlsProps = {
  page: number;
  totalPages: number;
  totalRows?: number;
  pageInput: string;
  isLoading?: boolean;
  hasPreviousPage: boolean;
  hasNextPage: boolean;
  onPageInputChange: (value: string) => void;
  onPageJump: () => void;
  onPageChange: (page: number) => void;
  label?: string;
};

export function PaginationControls({
  page,
  totalPages,
  totalRows,
  pageInput,
  isLoading = false,
  hasPreviousPage,
  hasNextPage,
  onPageInputChange,
  onPageJump,
  onPageChange,
  label = "Page",
}: PaginationControlsProps) {
  const canNavigate = totalPages > 0 && !isLoading;

  return (
    <div className="mt-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
      <div className="text-sm text-slate-600">
        {totalPages > 0 ? (
          <span>
            {label} {page} of {totalPages}
            {typeof totalRows === "number" ? ` · ${totalRows} rows` : null}
          </span>
        ) : (
          <span>{label} —</span>
        )}
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">
        <form
          className="flex items-center gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            onPageJump();
          }}
        >
          <span className="text-sm text-slate-600">Go to</span>
          <Input
            value={pageInput}
            onChange={(event) => onPageInputChange(event.target.value)}
            inputMode="numeric"
            pattern="[0-9]*"
            aria-label="Page number"
            className="h-9 w-20"
            disabled={!canNavigate}
          />
          <Button type="submit" variant="outline" disabled={!canNavigate}>
            Go
          </Button>
        </form>

        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={!canNavigate || !hasPreviousPage}
            onClick={() => onPageChange(1)}
          >
            First
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={!canNavigate || !hasPreviousPage}
            onClick={() => onPageChange(page - 1)}
          >
            Previous
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={!canNavigate || !hasNextPage}
            onClick={() => onPageChange(page + 1)}
          >
            Next
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={!canNavigate || !hasNextPage}
            onClick={() => onPageChange(totalPages)}
          >
            Last
          </Button>
        </div>
      </div>
    </div>
  );
}
