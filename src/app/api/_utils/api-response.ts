import { ZodError } from "zod";

export type ApiErrorCode =
  | "VALIDATION_ERROR"
  | "NOT_FOUND"
  | "INTERNAL_SERVER_ERROR";

export type ApiErrorResponse = {
  ok: false;
  error: {
    code: ApiErrorCode;
    message: string;
    details?: unknown;
  };
};

export function searchParamsToObject(
  searchParams: URLSearchParams,
  options: { arrayKeys?: string[] } = {},
): Record<string, string | string[]> {
  const arrayKeys = new Set(options.arrayKeys ?? ["adductIds"]);
  const output: Record<string, string | string[]> = {};

  for (const key of Array.from(new Set(searchParams.keys()))) {
    const values = searchParams.getAll(key);

    if (arrayKeys.has(key)) {
      output[key] = values
        .flatMap((value) => value.split(","))
        .map((value) => value.trim())
        .filter((value) => value.length > 0);
      continue;
    }

    output[key] = values[values.length - 1] ?? "";
  }

  return output;
}

function formatZodError(error: ZodError) {
  return error.issues.map((issue) => ({
    path: issue.path,
    message: issue.message,
  }));
}

export function validationErrorResponse(error: ZodError): Response {
  return Response.json(
    {
      ok: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "Invalid request",
        details: formatZodError(error),
      },
    } satisfies ApiErrorResponse,
    { status: 400 },
  );
}

export function notFoundResponse(message = "Resource not found"): Response {
  return Response.json(
    {
      ok: false,
      error: {
        code: "NOT_FOUND",
        message,
      },
    } satisfies ApiErrorResponse,
    { status: 404 },
  );
}

export function internalErrorResponse(error: unknown): Response {
  console.error(error);

  return Response.json(
    {
      ok: false,
      error: {
        code: "INTERNAL_SERVER_ERROR",
        message: "Internal server error",
      },
    } satisfies ApiErrorResponse,
    { status: 500 },
  );
}

export function handleApiError(error: unknown): Response {
  if (error instanceof ZodError) {
    return validationErrorResponse(error);
  }

  return internalErrorResponse(error);
}
