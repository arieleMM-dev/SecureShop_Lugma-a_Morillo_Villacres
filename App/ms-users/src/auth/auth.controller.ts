import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
} from '@nestjs/common';

import type { AuditedRequest } from '../audit/audit.module.js';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service.js';
import { Public } from './decorators/public/public.decorator.js';
import { LoginDto } from './dto/login.dto/login.dto.js';
import { CurrentUser } from './decorators/current-user/current-user.decorator.js';
import type { AuthenticatedUser } from './interfaces/authenticated-user/authenticated-user.interface.js';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /*
   * Ruta pública.
   */
  @Public()
  @ApiOkResponse({
    description: 'JWT RS256 y perfil de login',
    schema: {
      type: 'object',
      required: ['accessToken', 'tokenType', 'expiresIn', 'user'],
      properties: {
        accessToken: { type: 'string' },
        tokenType: { type: 'string', enum: ['Bearer'] },
        expiresIn: { type: 'integer' },
        user: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            username: { type: 'string' },
            email: { type: 'string', format: 'email' },
            roles: { type: 'array', items: { type: 'string' } },
          },
        },
      },
    },
  })
  @ApiUnauthorizedResponse({ description: 'Credenciales inválidas' })
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @Throttle({
    default: {
      limit: 5,
      ttl: 60_000,
    },
  })
  async login(
    @Body()
    dto: LoginDto,
    @Req() req: AuditedRequest,
  ) {
    const result = await this.authService.login(dto);
    req.auditActorId = result.user.id;
    return result;
  }

  /*
   * Requiere JWT.
   *
   * No requiere rol particular.
   */
  @ApiBearerAuth()
  @ApiOkResponse({
    description: 'Usuario activo y roles vigentes desde PostgreSQL',
    schema: {
      type: 'object',
      properties: {
        userId: { type: 'string', format: 'uuid' },
        username: { type: 'string' },
        email: { type: 'string', format: 'email' },
        roles: { type: 'array', items: { type: 'string' } },
      },
    },
  })
  @Get(['profile', 'me'])
  me(
    @CurrentUser()
    user: AuthenticatedUser,
  ) {
    return user;
  }

  @ApiBearerAuth()
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(
    @CurrentUser()
    user: AuthenticatedUser,
  ): Promise<void> {
    await this.authService.logout(user.userId);
  }
}
