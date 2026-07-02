import type { ReactNode } from "react";

type ChemicalFormulaProps = {
  formula: string | null | undefined;
  emptyValue?: ReactNode;
  className?: string;
};

export function ChemicalFormula({
  formula,
  emptyValue = "—",
  className,
}: ChemicalFormulaProps) {
  if (!formula) return <>{emptyValue}</>;

  return (
    <span className={className}>
      {formula.split(/(\d+)/).map((part, index) => {
        if (/^\d+$/.test(part)) {
          return (
            <sub key={`${part}-${index}`} className="text-[0.68em] leading-none">
              {part}
            </sub>
          );
        }

        return <span key={`${part}-${index}`}>{part}</span>;
      })}
    </span>
  );
}
