import { Suspense } from "react";
import { CompoundSearchClient } from "./compound-search-client";

export default function CompoundSearchPage() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-slate-600">Loading compound search...</div>}>
      <CompoundSearchClient />
    </Suspense>
  );
}
