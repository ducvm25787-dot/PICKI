export type PickiErrorCode =
  | "VALIDATION_ERROR"
  | "NOT_FOUND"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "CONFLICT"
  | "IDEMPOTENCY_REPLAY"
  | "STATE_TRANSITION_INVALID"
  | "SERVICEABILITY_NOT_ELIGIBLE"
  | "INTERNAL_ERROR";

export class PickiError extends Error {
  readonly code: PickiErrorCode;
  readonly httpStatus: number;
  readonly details?: Record<string, unknown>;

  constructor(
    code: PickiErrorCode,
    message: string,
    options?: { httpStatus?: number; details?: Record<string, unknown> },
  ) {
    super(message);
    this.name = "PickiError";
    this.code = code;
    this.httpStatus = options?.httpStatus ?? PickiError.defaultHttpStatus(code);
    this.details = options?.details;
  }

  private static defaultHttpStatus(code: PickiErrorCode): number {
    switch (code) {
      case "VALIDATION_ERROR":
        return 400;
      case "UNAUTHORIZED":
        return 401;
      case "FORBIDDEN":
        return 403;
      case "NOT_FOUND":
        return 404;
      case "CONFLICT":
      case "IDEMPOTENCY_REPLAY":
      case "STATE_TRANSITION_INVALID":
      case "SERVICEABILITY_NOT_ELIGIBLE":
        return 409;
      default:
        return 500;
    }
  }
}
