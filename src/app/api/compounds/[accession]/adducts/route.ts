import type { NextRequest } from "next/server";
import { db } from "../../../../../db/kysely";
import { listCompoundAdductsService } from "../../../../../services/search.service";
import { handleApiError } from "../../../_utils/api-response";

export const dynamic = "force-dynamic";

export async function GET(_request: NextRequest, { params }: { params: { accession: string } }) {
  try {
    const { accession } = await params;
    const rows = await listCompoundAdductsService(db, { accession: accession });
    return Response.json(rows);
  } catch (error) {
    return handleApiError(error);
  }
}
