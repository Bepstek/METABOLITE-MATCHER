import { z } from "zod";

const allowedLimits = [10, 25, 50, 100] as const;

const optionalPositiveInt = z.preprocess((value) => {
  if (value === "" || value === null || value === undefined) return undefined;
  return value;
}, z.coerce.number().int().positive().optional());

const optionalNonNegativeNumber = z.preprocess((value) => {
  if (value === "" || value === null || value === undefined) return undefined;
  return value;
}, z.coerce.number().nonnegative().optional());

const optionalAdductIds = z.preprocess((value) => {
  if (value === "" || value === null || value === undefined) return [];
  if (Array.isArray(value)) return value;
  return [value];
}, z.array(z.coerce.number().int().positive()).default([]));

export const ionModeSchema = z.enum(["positive", "negative"]);
export const toleranceUnitSchema = z.enum(["ppm", "da"]);
export const spectrumKindSchema = z.enum(["predicted", "experimental", "both"]);
export const spectrumPolaritySchema = z.enum(["positive", "negative", "both"]);

export const compoundNameSortBySchema = z.enum([
  "accession",
  "name",
  "monoisotopicMolecularWeight",
  "averageMolecularWeight",
]);

export const sortDirectionSchema = z.enum(["asc", "desc"]);

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce
    .number()
    .int()
    .refine((value) => (allowedLimits as readonly number[]).includes(value), {
      message: "limit must be one of 10, 25, 50, or 100",
    })
    .default(10),
});

const optionalToleranceSchema = z
  .object({
    tolerance: optionalNonNegativeNumber,
    toleranceUnit: toleranceUnitSchema.optional(),
  })
  .superRefine((value, ctx) => {
    if (value.tolerance !== undefined && value.toleranceUnit === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["toleranceUnit"],
        message: "toleranceUnit is required when tolerance is provided",
      });
    }
  });

export const compoundNameSearchSchema = paginationSchema.extend({
  query: z.string().trim().min(1),
  sortBy: compoundNameSortBySchema.optional(),
  sortDirection: sortDirectionSchema.default("asc"),
});

export const compoundSpectraSortBySchema = z.enum([
  "hmdbSpectrumId",
  "polarity",
  "collisionEnergyVoltage",
  "peakCounter",
]);

export const compoundSpectraListSchema = paginationSchema
  .extend({
    accession: z.string().trim().min(1),
    spectrumKind: spectrumKindSchema.default("both"),
    polarity: spectrumPolaritySchema.default("both"),
    collisionMin: optionalNonNegativeNumber,
    collisionMax: optionalNonNegativeNumber,
    sortBy: compoundSpectraSortBySchema.optional(),
    sortDirection: sortDirectionSchema.default("asc"),
  })
  .superRefine((value, ctx) => {
    if (
      value.collisionMin !== undefined &&
      value.collisionMax !== undefined &&
      value.collisionMin > value.collisionMax
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["collisionMax"],
        message: "collisionMax must be greater than or equal to collisionMin",
      });
    }
  });

export const neutralMassSortBySchema = z.enum([
  "accession",
  "name",
  "chemicalFormula",
  "monoisotopicMolecularWeight",
  "averageMolecularWeight",
  "massErrorPpm",
]);

export const neutralMassSearchSchema = z.object({
  queryMass: z.coerce.number().positive(),
  tolerance: z.coerce.number().positive().optional(),
  toleranceUnit: z.enum(["ppm", "da"]).default("ppm"),
  sourceTermId: z.coerce.number().int().positive().optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(10),

  sortBy: neutralMassSortBySchema.optional(),
  sortDirection: sortDirectionSchema.default("asc"),
});

export const adductMzSortBySchema = z.enum([
  "accession",
  "name",
  "chemicalFormula",
  "monoisotopicMolecularWeight",
  "adductLabel",
  "theoreticalMz",
  "massErrorPpm",
]);

export const adductMzSearchSchema = paginationSchema.merge(optionalToleranceSchema).extend({
  queryMz: z.coerce.number().positive(),
  ionMode: ionModeSchema.default("positive"),
  adductIds: optionalAdductIds,
  sourceTermId: optionalPositiveInt,
  sortBy: adductMzSortBySchema.optional(),
  sortDirection: sortDirectionSchema.default("asc"),
});

export const fragmentMassSearchSchema = paginationSchema.merge(optionalToleranceSchema).extend({
  queryMz: z.coerce.number().positive(),
  spectrumKind: spectrumKindSchema.default("both"),
  polarity: spectrumPolaritySchema.default("both"),
  minNormalizedIntensity: optionalNonNegativeNumber,
  sourceTermId: optionalPositiveInt,
});

export const compoundAccessionLookupSchema = z.object({
  accession: z.string().trim().min(1),
});

export const metadataAdductsSchema = z.object({
  ionMode: ionModeSchema.default("positive"),
});

export const sourceTermsMetadataSchema = z.object({
  maxLevel: z
    .preprocess((value) => {
      if (value === "" || value === null || value === undefined) return undefined;
      return value;
    }, z.coerce.number().int().positive().max(2).optional())
    .default(2),
});



export type CompoundNameSearchInput = z.infer<typeof compoundNameSearchSchema>;
export type CompoundSpectraListInput = z.infer<typeof compoundSpectraListSchema>;
export type NeutralMassSearchInput = z.infer<typeof neutralMassSearchSchema>;
export type AdductMzSearchInput = z.infer<typeof adductMzSearchSchema>;
export type FragmentMassSearchInput = z.infer<typeof fragmentMassSearchSchema>;
export type ToleranceUnit = z.infer<typeof toleranceUnitSchema>;
export type IonMode = z.infer<typeof ionModeSchema>;
export type SpectrumKind = z.infer<typeof spectrumKindSchema>;
export type SpectrumPolarity = z.infer<typeof spectrumPolaritySchema>;
export type CompoundAccessionLookupInput = z.infer<typeof compoundAccessionLookupSchema>;
export type MetadataAdductsInput = z.infer<typeof metadataAdductsSchema>;
export type SourceTermsMetadataInput = z.infer<typeof sourceTermsMetadataSchema>;
export type CompoundNameSortBy = z.infer<typeof compoundNameSortBySchema>;
export type SortDirection = z.infer<typeof sortDirectionSchema>;
