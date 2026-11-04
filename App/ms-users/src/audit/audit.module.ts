import {
  Global,
  Module,
  Injectable,
  NestMiddleware,
  Logger,
  BeforeApplicationShutdown,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import type { Request, Response, NextFunction } from 'express';
export type AuditedRequest = Request & {
  user?: { userId?: string };
  auditActorId?: string;
  serviceId?: string;
  auditDecision?: {
    action: string;
    resource_id: string | null;
    allowed: boolean;
  };
};

@Injectable()
export class AuditMiddleware
  implements NestMiddleware, BeforeApplicationShutdown
{
  private readonly pending = new Set<Promise<unknown>>();
  async beforeApplicationShutdown() {
    await Promise.allSettled(this.pending);
  }
  private readonly logger = new Logger('Audit');
  constructor(private readonly database: DataSource) {}
  use(req: AuditedRequest, res: Response, next: NextFunction) {
    res.once('finish', () => {
      const uuid = (value: unknown) =>
        typeof value === 'string' &&
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
          value,
        )
          ? value
          : null;
      const actor = uuid(req.auditActorId ?? req.user?.userId);
      const route =
        typeof req.route?.path === 'string'
          ? req.route.path.slice(0, 200)
          : 'unmatched';
      const entry = this.database
        .query(
          `INSERT INTO auth_audit_events (request_id,actor_id,service_id,method,route,status_code,action,resource_id,allowed) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
          [
            (req as unknown as { requestId?: string }).requestId ?? 'unknown',
            actor,
            req.serviceId ?? null,
            req.method,
            route,
            res.statusCode,
            req.auditDecision?.action ?? null,
            uuid(req.auditDecision?.resource_id ?? req.params.id),
            req.auditDecision?.allowed ?? null,
          ],
        )
        .catch(() =>
          this.logger.error(
            'No se pudo persistir un evento de auditoría; sin datos de solicitud',
          ),
        );
      this.pending.add(entry);
      void entry.finally(() => this.pending.delete(entry));
    });
    next();
  }
}
@Global()
@Module({ providers: [AuditMiddleware], exports: [AuditMiddleware] })
export class AuditModule {}
