import { Suspense } from "react";
import { MsMsSearchClient } from "./ms-ms-search-client";

export default function MsMsSearchPage() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-slate-600">Loading MS/MS search...</div>}>
      <MsMsSearchClient />
    </Suspense>
  );
}
