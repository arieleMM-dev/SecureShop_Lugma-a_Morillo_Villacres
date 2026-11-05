const { AppController } = require('../dist/app.controller.js');
require('reflect-metadata');
const fs = require('node:fs');
const { NestFactory } = require('@nestjs/core');
const { Module } = require('@nestjs/common');
const path = require('node:path');
const { createAuthOpenApi } = require('../dist/openapi.js');
const { UsersController } = require('../dist/users/users.controller.js');
const { RolesController } = require('../dist/roles/roles.controller.js');
const {
  UserRolesController,
} = require('../dist/user-roles/user-roles.controller.js');
const { AuthController } = require('../dist/auth/auth.controller.js');
const {
  InternalAuthorizationController,
  ServiceAuthGuard,
} = require('../dist/internal-authorization/internal-authorization.module.js');
const { UsersService } = require('../dist/users/users.service.js');
const { RolesService } = require('../dist/roles/roles.service.js');
const {
  UserRolesService,
} = require('../dist/user-roles/user-roles.service.js');
const { AuthService } = require('../dist/auth/auth.service.js');
const { JwtService } = require('@nestjs/jwt');
const {
  JwtStrategy,
} = require('../dist/auth/strategies/jwt.strategy/jwt.strategy.js');
const { ConfigService } = require('@nestjs/config');
class DocsModule {}
Module({
  controllers: [
    AppController,
    UsersController,
    RolesController,
    UserRolesController,
    AuthController,
    InternalAuthorizationController,
  ],
  providers: [
    UsersService,
    RolesService,
    UserRolesService,
    AuthService,
    JwtService,
    JwtStrategy,
    ConfigService,
    ServiceAuthGuard,
  ].map((provide) => ({ provide, useValue: {} })),
})(DocsModule);
(async () => {
  const app = await NestFactory.create(DocsModule, { logger: false });
  app.setGlobalPrefix('api', { exclude: ['internal/authorization/check'] });
  app.enableVersioning({
    type: require('@nestjs/common').VersioningType.URI,
    defaultVersion: '1',
  });
  const output = path.resolve(__dirname, '../../docs/contratos/openapi-auth.json');
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, JSON.stringify(createAuthOpenApi(app), null, 2) + '\n');
  await app.close();
})().catch(() => {
  process.exitCode = 1;
});
