import type { NextRequest } from "next/server";
import { db } from "../../../../db/kysely";
import { listEnabledAdductsByIonModeService } from "../../../../services/search.service";
import { handleApiError, searchParamsToObject } from "../../_utils/api-response";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const result = await listEnabledAdductsByIonModeService(
      db,
      searchParamsToObject(request.nextUrl.searchParams),
    );

    return Response.json(result);
  } catch (error) {
    return handleApiError(error);
  }
}
