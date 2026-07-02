import type { NextRequest } from "next/server";
import { db } from "../../../../db/kysely";
import { getCompoundByAccessionService } from "../../../../services/search.service";
import { handleApiError, notFoundResponse } from "../../_utils/api-response";

export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ accession: string }> },
) {
  try {
    const { accession } = await context.params;
    const result = await getCompoundByAccessionService(db, { accession });

    if (!result) {
      return notFoundResponse(`Compound not found: ${accession}`);
    }

    return Response.json(result);
  } catch (error) {
    return handleApiError(error);
  }
}
