import type { ToleranceUnit } from "@/types/search";

interface CalculateToleranceWindowInput {
  mass: number;
  tolerance: number;
  unit: ToleranceUnit;
}

export interface ToleranceWindow {
  queryMass: number;
  tolerance: number;
  unit: ToleranceUnit;
  minMass: number;
  maxMass: number;
}

export function calculateToleranceWindow(
  input: CalculateToleranceWindowInput
): ToleranceWindow {
  const { mass, tolerance, unit } = input;

  if (!Number.isFinite(mass) || mass <= 0) {
    throw new Error("Mass must be a positive number.");
  }

  if (!Number.isFinite(tolerance) || tolerance < 0) {
    throw new Error("Tolerance must be a non-negative number.");
  }

  const toleranceDa =
    unit === "ppm" ? mass * tolerance / 1_000_000 : tolerance;

  return {
    queryMass: mass,
    tolerance,
    unit,
    minMass: mass - toleranceDa,
    maxMass: mass + toleranceDa,
  };
}

export function calculateMassErrorDa(
  observedMass: number,
  candidateMass: number
): number {
  return candidateMass - observedMass;
}

export function calculateMassErrorPpm(
  observedMass: number,
  candidateMass: number
): number | null {
  if (observedMass === 0) return null;

  return ((candidateMass - observedMass) / observedMass) * 1_000_000;
}

export const EXACT_MASS_EPSILON = 1e-9;

export type SearchWindow = {
  lower: number;
  upper: number;
};

export function calculateSearchWindow(input: {
  queryValue: number;
  tolerance?: number;
  toleranceUnit?: ToleranceUnit;
}): SearchWindow {
  if (input.tolerance !== undefined && input.toleranceUnit === undefined) {
    throw new Error("toleranceUnit is required when tolerance is provided.");
  }

  if (input.tolerance === undefined || input.tolerance === 0) {
    return {
      lower: input.queryValue - EXACT_MASS_EPSILON,
      upper: input.queryValue + EXACT_MASS_EPSILON,
    };
  }

  if (input.tolerance < 0) {
    throw new Error("tolerance must be greater than or equal to 0.");
  }

  if (input.toleranceUnit === "ppm") {
    const delta = (input.queryValue * input.tolerance) / 1_000_000;
    return {
      lower: input.queryValue - delta,
      upper: input.queryValue + delta,
    };
  }

  return {
    lower: input.queryValue - input.tolerance,
    upper: input.queryValue + input.tolerance,
  };
}

export function calculateMassError(actual: number, query: number): {
  massErrorDa: number;
  massErrorPpm: number;
} {
  const massErrorDa = actual - query;

  return {
    massErrorDa,
    massErrorPpm: (massErrorDa / query) * 1_000_000,
  };
}

