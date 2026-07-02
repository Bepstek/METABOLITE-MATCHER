import { z } from "zod";

const returnCandidateLimits = [100, 500, 1000, 2000] as const;

const optionalPositiveInt = z.preprocess((value) => {
  if (value === "" || value === null || value === undefined || value === "any") return undefined;
  return value;
}, z.coerce.number().int().positive().optional());

const optionalPositiveNumber = z.preprocess((value) => {
  if (value === "" || value === null || value === undefined) return undefined;
  return value;
}, z.coerce.number().positive().optional());

const optionalNumberArray = z.preprocess((value) => {
  if (value === "" || value === null || value === undefined) return [];
  if (Array.isArray(value)) return value;
  return [value];
}, z.array(z.coerce.number().int().positive()).default([]));

const optionalStringArray = z.preprocess((value) => {
  if (value === "" || value === null || value === undefined) return [];
  if (Array.isArray(value)) return value;
  return [value];
}, z.array(z.coerce.string()).default([]));

const optionalRecord = z.preprocess((value) => {
  if (value === null || value === undefined || value === "") return undefined;
  return value;
}, z.record(z.string(), z.unknown()).optional());

export const candidateRankingRequestSchema = z.object({
  queryId: z.string().trim().optional(),
  queryKey: z.string().trim().optional(),

  precursorMz: z.coerce.number().positive(),
  peakList: z.string().trim().min(1, "Peak list is required"),

  precursorTolerance: z.coerce.number().positive().default(5),
  precursorToleranceUnit: z.enum(["da", "ppm"]).default("ppm"),

  precursorAdductIds: optionalNumberArray,
  precursorAdductLabels: optionalStringArray,

  spectrumKind: z.enum(["experimental", "predicted", "both"]).default("experimental"),
  polarity: z.enum(["positive", "negative", "both"]).default("positive"),
  sourceTermId: optionalPositiveInt,

  minMatchedPeaks: z.coerce.number().int().positive().max(50).default(1),
  fragmentCandidateLimit: z.coerce.number().int().min(100).max(20000).default(5000),
  returnCandidateLimit: z.coerce
    .number()
    .int()
    .refine((value) => (returnCandidateLimits as readonly number[]).includes(value), {
      message: "returnCandidateLimit must be one of 100, 500, 1000, or 2000",
    })
    .default(500),

  targetAccession: z.string().trim().optional(),
  targetAccessions: optionalStringArray,

  responseFormat: z.enum(["nested", "flat", "both"]).default("nested"),

  includeMatchedPeakPairs: z.coerce.boolean().default(false),
  includeClientMetadataInFlatRows: z.coerce.boolean().default(false),
  includeWarningsInFlatRows: z.coerce.boolean().default(false),
  includeFeatureMetadata: z.coerce.boolean().default(false),

  clientMetadata: optionalRecord,
});

export type CandidateRankingRequestInput = z.infer<typeof candidateRankingRequestSchema>;
