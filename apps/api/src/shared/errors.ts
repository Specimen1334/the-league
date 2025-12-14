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

  if (err instanceof Error) {
    return {
      statusCode: 500,
      payload: {
        error: "InternalServerError",
        message: err.message || "Internal server error"
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
