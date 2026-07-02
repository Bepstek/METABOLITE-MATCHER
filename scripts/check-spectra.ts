import "./load-env";
import { db } from "../src/db/kysely";

async function main(): Promise<void> {
  const spectraTotal = await db
    .selectFrom("spectra")
    .select((eb) => eb.fn.countAll<string>().as("count"))
    .executeTakeFirstOrThrow();

  const spectraByKind = await db
    .selectFrom("spectra")
    .select([
      "predicted",
      (eb) => eb.fn.countAll<string>().as("count"),
    ])
    .groupBy("predicted")
    .orderBy("predicted", "desc")
    .execute();

  const peaksTotal = await db
    .selectFrom("spectrum_peaks")
    .select((eb) => eb.fn.countAll<string>().as("count"))
    .executeTakeFirstOrThrow();

  console.log("Spectra count:", spectraTotal.count);
  console.log("Peak count:", peaksTotal.count);
  console.log("");

  for (const row of spectraByKind) {
    console.log(
      `${row.predicted ? "Predicted" : "Experimental"} spectra: ${row.count}`
    );
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await db.destroy();
  });