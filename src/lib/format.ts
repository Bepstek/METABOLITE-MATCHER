export function formatNullableNumber(value: number | null | undefined) {
  if (value == null) return "—";
  return value.toString();
}

export function formatNullableText(value: string | null | undefined) {
  if (!value) return "—";
  return value;
}

export function formatDeltaPpm(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return "—";
  return String(Math.round(Math.abs(value)));
}

export function formatMass(value: number | null | undefined, digits = 6) {
  if (value == null || !Number.isFinite(value)) return "—";
  return Number(value).toFixed(digits).replace(/0+$/, "").replace(/\.$/, "");
}
