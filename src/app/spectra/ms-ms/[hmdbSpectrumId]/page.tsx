import { Suspense } from "react";
import { SpectrumDetailClient } from "./spectrum-detail-client";

type SpectrumDetailPageProps = {
  params: Promise<{
    hmdbSpectrumId: string;
  }>;
};

export default async function SpectrumDetailPage({ params }: SpectrumDetailPageProps) {
  const { hmdbSpectrumId } = await params;

  return (
    <Suspense fallback={<div className="p-6 text-sm text-slate-600">Loading spectrum detail...</div>}>
      <SpectrumDetailClient hmdbSpectrumId={hmdbSpectrumId} />
    </Suspense>
  );
}