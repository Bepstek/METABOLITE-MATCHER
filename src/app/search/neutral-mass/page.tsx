import { Suspense } from "react";
import { NeutralMassSearchClient } from "./neutral-mass-search-client";

export default function NeutralMassSearchPage() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-slate-600">Loading neutral mass search...</div>}>
      <NeutralMassSearchClient />
    </Suspense>
  );
}
