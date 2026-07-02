import type { NextRequest } from "next/server";
import { db } from "../../../../db/kysely";
import { searchMsMsSpectraService } from "../../../../services/spectra.service";
import { handleApiError } from "../../_utils/api-response";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const body: unknown = await request.json();
    const result = await searchMsMsSpectraService(db, body);

    return Response.json(result);
  } catch (error) {
    return handleApiError(error);
  }
}
