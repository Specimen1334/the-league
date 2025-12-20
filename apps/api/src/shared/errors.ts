// apps/api/src/shared/errors.ts

export interface HttpErrorShape {
  error: string;
  message: string;
  details?: Record<string, unknown>;
}

export class HttpError extends Error implements HttpErrorShape {
  public statusCode: number;
  public error: string;
  public details?: Record<string, unknown>;

  constructor(
    statusCode: number,
    error: string,
    message: string,
    details?: Record<string, unknown>
  ) {
    super(message);
    this.statusCode = statusCode;
    this.error = error;
    this.details = details;
  }
}

export function createHttpError(
  statusCode: number,
  message: string,
  error: string = "Error",
  details?: Record<string, unknown>
): HttpError {
  return new HttpError(statusCode, error, message, details);
}

export function toErrorResponse(err: unknown): {
  statusCode: number;
  payload: HttpErrorShape;
} {
  if (err instanceof HttpError) {
    return {
      statusCode: err.statusCode,
      payload: {
        error: err.error,
        message: err.message,
        ...(err.details ? { details: err.details } : {})
      }
    };
  }

  // Back-compat: many services throw a plain Error and attach a numeric statusCode.
  // Respect it so callers don't get forced into 500s.
  if (err instanceof Error) {
    const anyErr = err as any;
    const statusCode =
      typeof anyErr.statusCode === "number" && Number.isFinite(anyErr.statusCode)
        ? anyErr.statusCode
        : 500;
    const errorName =
      typeof anyErr.error === "string" && anyErr.error.trim().length > 0
        ? anyErr.error
        : statusCode >= 500
          ? "InternalServerError"
          : "Error";

    return {
      statusCode,
      payload: {
        error: errorName,
        message: err.message || (statusCode >= 500 ? "Internal server error" : "Error"),
        ...(anyErr.details ? { details: anyErr.details } : {})
      }
    };
  }

  return {
    statusCode: 500,
    payload: {
      error: "InternalServerError",
      message: "Internal server error"
    }
  };
}
