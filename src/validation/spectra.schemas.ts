import { z } from "zod";

const allowedLimits = [10, 25, 50, 100] as const;

const optionalPositiveInt = z.preprocess((value) => {
  if (value === "" || value === null || value === undefined || value === "any") return undefined;
  return value;
}, z.coerce.number().int().positive().optional());

const optionalPositiveNumber = z.preprocess((value) => {
  if (value === "" || value === null || value === undefined) return undefined;
  return value;
}, z.coerce.number().positive().optional());

const optionalAdductIds = z.preprocess((value) => {
  if (value === "" || value === null || value === undefined) return [];
  return value;
}, z.array(z.coerce.number().int().positive()).default([]));

export const spectrumLookupSchema = z.object({
  hmdbSpectrumId: z.coerce.number().int().positive(),
});

export const msMsSearchSchema = z.object({
  peakList: z.string().trim().min(1, "Peak list is required"),
  tolerance: z.coerce.number().positive().default(0.1),
  toleranceUnit: z.enum(["da", "ppm"]).default("da"),
  spectrumKind: z.enum(["experimental", "predicted", "both"]).default("experimental"),
  polarity: z.enum(["positive", "negative", "both"]).default("positive"),
  precursorMz: optionalPositiveNumber,
  precursorTolerance: z.coerce.number().positive().default(5),
  precursorToleranceUnit: z.enum(["da", "ppm"]).default("ppm"),
  precursorAdductIds: optionalAdductIds,
  sourceTermId: optionalPositiveInt,
  minMatchedPeaks: z.coerce.number().int().positive().max(50).default(3),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce
    .number()
    .int()
    .refine((value) => (allowedLimits as readonly number[]).includes(value), {
      message: "limit must be one of 10, 25, 50, or 100",
    })
    .default(10),
});

export type SpectrumLookupInput = z.infer<typeof spectrumLookupSchema>;
export type MsMsSearchInput = z.infer<typeof msMsSearchSchema>;
