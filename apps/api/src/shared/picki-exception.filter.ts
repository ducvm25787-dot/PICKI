import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  Logger,
} from "@nestjs/common";
import type { Response } from "express";
import { PickiError } from "@picki/shared";

@Catch()
export class PickiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(PickiExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();

    if (exception instanceof PickiError) {
      res.status(exception.httpStatus).json({
        error: {
          code: exception.code,
          message: exception.message,
          details: exception.details,
        },
      });
      return;
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();
      res
        .status(status)
        .json(
          typeof body === "string"
            ? { error: { code: "HTTP_ERROR", message: body } }
            : body,
        );
      return;
    }

    this.logger.error(exception);
    const message =
      exception instanceof Error && /request entity too large|PayloadTooLarge/i.test(exception.message)
        ? "Ảnh quá lớn sau khi nén — chọn ảnh khác"
        : "Internal server error";
    res.status(500).json({
      error: { code: "INTERNAL_ERROR", message },
    });
  }
}
