import { loadJwtKeys } from './key-material.js';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { UsersModule } from '../users/users.module.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { JwtStrategy } from './strategies/jwt.strategy/jwt.strategy.js';

@Module({
  imports: [
    ConfigModule,
    UsersModule,
    PassportModule.register({
      defaultStrategy: 'jwt',
      session: false,
    }),

    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        ...loadJwtKeys(
          config.getOrThrow<string>('JWT_PRIVATE_KEY_PATH'),
          config.getOrThrow<string>('JWT_PUBLIC_KEY_PATH'),
        ),
        verifyOptions: {
          algorithms: ['RS256'],
          issuer: config.getOrThrow<string>('JWT_ISSUER'),
          audience: config.getOrThrow<string>('JWT_AUDIENCE'),
        },

        signOptions: {
          algorithm: 'RS256',
          expiresIn: config.get<number>('JWT_EXPIRES_IN_SECONDS') ?? 900,
          issuer: config.getOrThrow<string>('JWT_ISSUER'),
          audience: config.getOrThrow<string>('JWT_AUDIENCE'),
        },
      }),
    }),
  ],

  controllers: [AuthController],
  providers: [AuthService, JwtStrategy],
  exports: [AuthService, JwtModule, JwtStrategy],
})
export class AuthModule {}
