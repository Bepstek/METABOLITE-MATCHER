import type { Kysely } from "kysely";
import type { DB } from "../db/schema";

export type IonMode = "positive" | "negative";

export type EnabledAdductRow = {
  id: number;
  label: string;
  ion_mode: IonMode;
  charge: number;
  mass_multiplier: number;
  mass_shift: number;
};

export type SourceTermOptionRow = {
  id: number;
  name: string;
};

export async function listEnabledAdductsByIonMode(
  db: Kysely<DB>,
  ionMode: IonMode,
): Promise<EnabledAdductRow[]> {
  return db
    .selectFrom("adducts")
    .select([
      "adducts.id",
      "adducts.label",
      "adducts.ion_mode",
      "adducts.charge",
      "adducts.mass_multiplier",
      "adducts.mass_shift",
    ])
    .where("adducts.ion_mode", "=", ionMode)
    .where("adducts.enabled", "=", true)
    .where((eb) =>
      eb.not(
        eb.exists(
          eb
            .selectFrom("adduct_blacklist")
            .select("adduct_blacklist.id")
            .whereRef("adduct_blacklist.adduct_id", "=", "adducts.id")
            .where("adduct_blacklist.active", "=", true),
        ),
      ),
    )
    .orderBy("adducts.label", "asc")
    .execute() as Promise<EnabledAdductRow[]>;
}

export async function listSourceTerms(
  db: Kysely<DB>,
  input: { maxLevel?: number } = {},
): Promise<SourceTermOptionRow[]> {
  const maxLevel = input.maxLevel ?? 2;

  return db
    .selectFrom("source_terms")
    .innerJoin("compound_sources", "compound_sources.source_term_id", "source_terms.id")
    .select(["source_terms.id", "source_terms.name"])
    .where("compound_sources.level", "<=", maxLevel)
    .groupBy(["source_terms.id", "source_terms.name"])
    .orderBy("source_terms.name", "asc")
    .execute() as Promise<SourceTermOptionRow[]>;
}
