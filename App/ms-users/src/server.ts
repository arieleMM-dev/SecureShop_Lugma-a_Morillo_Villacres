import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { createServer, Server } from 'node:https';
import { readFileSync } from 'node:fs';
import { AppModule } from './app.module.js';
import { setupApp } from './setup-app.js';

export async function startAuth() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  let tls: Server | undefined;
  try {
    setupApp(app);
    app.enableShutdownHooks();
    const config = app.get(ConfigService);
    tls = createServer(
      {
        minVersion: 'TLSv1.3',
        cert: readFileSync(config.getOrThrow<string>('AUTH_TLS_CERT_PATH')),
        key: readFileSync(config.getOrThrow<string>('AUTH_TLS_KEY_PATH')),
      },
      app.getHttpAdapter().getInstance(),
    );
    const secureServer = tls;
    const close = app.close.bind(app);
    app.close = async () => {
      if (secureServer.listening)
        await new Promise<void>((resolve, reject) =>
          secureServer.close((error) => (error ? reject(error) : resolve())),
        );
      await close();
    };
    const host = config.getOrThrow<string>('AUTH_BIND_HOST');
    await app.listen(config.get<number>('PORT') ?? 3001, host);
    await new Promise<void>((resolve, reject) => {
      secureServer.once('error', reject);
      secureServer.listen(
        config.get<number>('AUTH_INTERNAL_PORT') ?? 3443,
        host,
        resolve,
      );
    });
    return { app, tls: secureServer };
  } catch {
    await app.close();
    throw new Error(
      'No se pudo iniciar AUTH con ambos listeners y TLS configurado',
    );
  }
}
