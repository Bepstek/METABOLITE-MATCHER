import type { NextRequest } from "next/server";
import { db } from "../../../../../db/kysely";
import { handleApiError } from "../../../_utils/api-response";
import { generateMsMsCandidateRankingService } from "../../../../../services/ml.service";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const result = await generateMsMsCandidateRankingService(db, body);
    return Response.json(result);
  } catch (error) {
    return handleApiError(error);
  }
}
