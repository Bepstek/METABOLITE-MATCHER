import fs from "node:fs";
import readline from "node:readline";
import zlib from "node:zlib";

export function getImportBatchSize(): number {
  const rawValue = process.env.IMPORT_BATCH_SIZE;
  const parsed = rawValue ? Number.parseInt(rawValue, 10) : 1000;

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 1000;
  }

  return parsed;
}

export async function* readJsonlGz<T>(
  filePath: string
): AsyncGenerator<T> {
  const fileStream = fs.createReadStream(filePath);
  const gunzipStream = zlib.createGunzip();
  const inputStream = fileStream.pipe(gunzipStream);

  const rl = readline.createInterface({
    input: inputStream,
    crlfDelay: Infinity,
  });

  try {
    for await (const line of rl) {
      const trimmed = line.trim();

      if (!trimmed) {
        continue;
      }

      yield JSON.parse(trimmed) as T;
    }
  } finally {
    rl.close();
    inputStream.destroy();
    gunzipStream.destroy();
    fileStream.destroy();
  }
}

export function clearBatch<T>(batch: T[]): void {
  batch.length = 0;
}