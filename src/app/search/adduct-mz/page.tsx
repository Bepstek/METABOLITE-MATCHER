import { Suspense } from "react";
import { AdductMzSearchClient } from "./adduct-mz-search-client";

export default function AdductMzSearchPage() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-slate-600">Loading LC-MS/adduct search...</div>}>
      <AdductMzSearchClient />
    </Suspense>
  );
}
