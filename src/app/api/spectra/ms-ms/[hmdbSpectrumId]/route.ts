import { handleApiError } from "@/app/api/_utils/api-response";
import { db } from "@/db/kysely";
import { getMsMsSpectrumDetailService } from "@/services/spectra.service";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ hmdbSpectrumId: string }> }
) {
  try {
    const { hmdbSpectrumId } = await params;

    const result = await getMsMsSpectrumDetailService(db, {
      hmdbSpectrumId,
    });

    if (!result) {
      return Response.json(
        {
          ok: false,
          error: {
            code: "SPECTRUM_NOT_FOUND",
            message: "Spectrum not found.",
          },
        },
        { status: 404 }
      );
    }

    return Response.json(result);
  } catch (error) {
    return handleApiError(error);
  }
}