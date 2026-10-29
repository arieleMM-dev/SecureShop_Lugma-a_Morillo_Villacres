import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module.js';
import { setupApp } from './setup-app.js';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  setupApp(app);
  app.enableShutdownHooks();
  const port = app.get(ConfigService).get<number>('PORT') ?? 3001;
  await app.listen(port);
  console.log(`User Service: http://localhost:${port}/api/v1`);
}
void bootstrap();
