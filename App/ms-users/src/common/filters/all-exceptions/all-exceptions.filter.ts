import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';

import { Request, Response } from 'express';

type RequestWithId = Request & {
  requestId?: string;
};

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();

    const response = ctx.getResponse<Response>();

    const request = ctx.getRequest<RequestWithId>();

    const isHttpException = exception instanceof HttpException;

    const parserErrors: Record<string, { status: number; message: string }> = {
      'entity.too.large': { status: 413, message: 'Carga excesiva' },
      'entity.parse.failed': { status: 400, message: 'Cuerpo de solicitud inválido' },
      'encoding.unsupported': { status: 415, message: 'Codificación no admitida' },
      'charset.unsupported': { status: 415, message: 'Codificación de caracteres no admitida' },
      'request.aborted': { status: 400, message: 'Solicitud interrumpida' },
      'request.size.invalid': { status: 400, message: 'Tamaño de solicitud inválido' },
    };
    const parserType =
      exception instanceof Error && 'type' in exception && typeof exception.type === 'string'
        ? exception.type
        : undefined;
    const parserError = parserType ? parserErrors[parserType] : undefined;

    const status = isHttpException
      ? exception.getStatus()
      : (parserError?.status ?? HttpStatus.INTERNAL_SERVER_ERROR);

    let message: string | string[] = parserError?.message ?? 'Internal server error';

    if (isHttpException) {
      const exceptionResponse = exception.getResponse();

      if (typeof exceptionResponse === 'string') {
        message = exceptionResponse;
      } else if (
        typeof exceptionResponse === 'object' &&
        exceptionResponse !== null &&
        'message' in exceptionResponse
      ) {
        message = (
          exceptionResponse as {
            message: string | string[];
          }
        ).message;
      }
    }

    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(
        `Error interno requestId=${request.requestId ?? 'unknown'}`,
      );
    }

    response.status(status).json({
      statusCode: status,
      message,
      timestamp: new Date().toISOString(),
      path: request.url,
      requestId: request.requestId,
    });
  }
}
