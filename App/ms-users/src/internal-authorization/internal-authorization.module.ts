import {
  Module,
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  Controller,
  Post,
  Body,
  Req,
  UseGuards,
  Version,
  VERSION_NEUTRAL,
  HttpCode,
  BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { timingSafeEqual, createHash } from 'node:crypto';
import { TLSSocket } from 'node:tls';
import {
  ApiTags,
  ApiSecurity,
  ApiOperation,
  ApiResponse,
} from '@nestjs/swagger';
import { AuthModule } from '../auth/auth.module.js';
import { Public } from '../auth/decorators/public/public.decorator.js';
import { JwtStrategy } from '../auth/strategies/jwt.strategy/jwt.strategy.js';
import { JwtPayload } from '../auth/interfaces/jwt-payload/jwt-payload.interface.js';
import type { AuditedRequest } from '../audit/audit.module.js';
import { CheckAuthorizationDto } from './check.dto.js';
@Injectable()
export class ServiceAuthGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<AuditedRequest>();
    if (!(req.socket instanceof TLSSocket) || !req.socket.encrypted)
      throw new UnauthorizedException(
        'Se requiere TLS directo para el canal interno',
      );
    const header = req.header('X-Service-Token');
    if (!header || header.length > 512)
      throw new UnauthorizedException('Servicio no autorizado');
    const digest = (value: string) =>
      createHash('sha256').update(value).digest();
    if (
      !timingSafeEqual(
        digest(header),
        digest(this.config.getOrThrow<string>('STEGO_SERVICE_TOKEN')),
      )
    )
      throw new UnauthorizedException('Servicio no autorizado');
    req.serviceId = 'STEGO';
    return true;
  }
}
@ApiTags('Autorización interna')
@ApiSecurity('ServiceToken')
@Controller('internal/authorization')
export class InternalAuthorizationController {
  constructor(
    private readonly jwt: JwtService,
    private readonly strategy: JwtStrategy,
  ) {}
  @Public()
  @UseGuards(ServiceAuthGuard)
  @Version(VERSION_NEUTRAL)
  @Post('check')
  @HttpCode(200)
  @ApiOperation({
    summary:
      'Decisión vigente para STEGO sobre TLS; resource_owner_id procede del registro del análisis en STEGO',
  })
  @ApiResponse({
    status: 200,
    schema: {
      type: 'object',
      required: ['subject_id', 'action', 'resource_id', 'allowed', 'reason'],
      properties: {
        subject_id: { type: 'string', format: 'uuid' },
        action: {
          type: 'string',
          enum: ['steganography.analyze', 'steganography.results.read'],
        },
        resource_id: { type: 'string', format: 'uuid', nullable: true },
        allowed: { type: 'boolean' },
        reason: {
          type: 'string',
          enum: [
            'active_role_grants_permission',
            'active_role_does_not_grant_permission',
          ],
        },
      },
    },
    description:
      'Decisión actual, allowed true o false; no constituye permiso permanente',
  })
  @ApiResponse({
    status: 401,
    description: 'Servicio, canal o token de usuario inválido',
  })
  async check(@Body() dto: CheckAuthorizationDto, @Req() req: AuditedRequest) {
    let user;
    try {
      const payload = await this.jwt.verifyAsync<JwtPayload>(dto.subject_token);
      user = await this.strategy.validate(payload);
    } catch {
      throw new UnauthorizedException(
        'Token de usuario inválido o sesión expirada',
      );
    }
    req.auditActorId = user.userId;
    if (
      dto.action === 'steganography.results.read' &&
      (!dto.resource_id || !dto.resource_owner_id)
    )
      throw new BadRequestException(
        'La consulta de resultado requiere recurso y propietario verificados por STEGO',
      );
    const admin = user.roles.includes('ADMIN');
    const analyst = user.roles.includes('ANALYST');
    const allowed =
      admin ||
      (analyst &&
        (dto.action === 'steganography.analyze' ||
          dto.resource_owner_id === user.userId));
    const decision = {
      subject_id: user.userId,
      action: dto.action,
      resource_id: dto.resource_id ?? null,
      allowed,
      reason: allowed
        ? 'active_role_grants_permission'
        : 'active_role_does_not_grant_permission',
    };
    req.auditDecision = decision;
    return decision;
  }
}
@Module({
  imports: [AuthModule],
  controllers: [InternalAuthorizationController],
  providers: [ServiceAuthGuard],
})
export class InternalAuthorizationModule {}
