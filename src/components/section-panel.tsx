import type { ReactNode } from "react";

type SectionPanelProps = {
  children: ReactNode;
  className?: string;
  variant?: "solid" | "glass";
};

export function SectionPanel({
  children,
  className = "",
  variant = "solid",
}: SectionPanelProps) {
  const baseClass =
    variant === "glass"
      ? "rounded-xl border border-cyan-900/10 bg-white/85 p-5 shadow-sm backdrop-blur"
      : "rounded-xl border border-cyan-900/10 bg-white p-4 shadow-sm";

  return <section className={`${baseClass} ${className}`}>{children}</section>;
}
