import { Suspense } from "react";
import { CompoundDetailClient } from "./compound-detail-client";

type CompoundDetailPageProps = {
  params: Promise<{
    accession: string;
  }>;
};

export default async function CompoundDetailPage({ params }: CompoundDetailPageProps) {
  const { accession } = await params;

  return (
    <Suspense fallback={<div className="p-6 text-sm text-slate-600">Loading compound detail...</div>}>
      <CompoundDetailClient accession={accession} />
    </Suspense>
  );
}
