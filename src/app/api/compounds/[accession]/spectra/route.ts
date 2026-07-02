import type { NextRequest } from "next/server";
import { db } from "../../../../../db/kysely";
import { listCompoundSpectraService } from "../../../../../services/search.service";
import { handleApiError, searchParamsToObject } from "../../../_utils/api-response";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ accession: string }> },
) {
  try {
    const { accession } = await context.params;
    const result = await listCompoundSpectraService(db, {
      ...searchParamsToObject(request.nextUrl.searchParams),
      accession,
    });

    return Response.json(result);
  } catch (error) {
    return handleApiError(error);
  }
}
