export function getHmdbMetaboliteUrl(accession: string): string {
  return `${process.env.HMDB_BASE_URL ?? "https://hmdb.ca"}/metabolites/${accession}`;
}

export function getHmdbMsMsSpectrumUrl(hmdbSpectrumId: number): string {
  return `${process.env.HMDB_BASE_URL ?? "https://hmdb.ca"}/spectra/ms_ms/${hmdbSpectrumId}`;
}