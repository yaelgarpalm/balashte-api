import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import * as dotenv from 'dotenv';
import { json, urlencoded, static as serveStatic } from 'express';
import { join } from 'path';
import { installPostgresCompat } from './database/postgres-compat';

dotenv.config();
installPostgresCompat();

const DEFAULT_CORS_ORIGINS = [
  'http://localhost:3000',
  'http://localhost:5173',
  'http://[::1]:3000',
  'http://[::1]:5173',
  'http://[2001:db8:2::10]:3000',
  'http://[2001:db8:2::10]:5173',
  'http://[2001:db8:2:0:cc38:d64e:d5a7:1fcb]:3000',
  'http://[2001:db8:2:0:cc38:d64e:d5a7:1fcb]:5173',
  'http://[2001:db8:2:0:4934:989e:efb7:a2ba]:3000',
  'http://[2001:db8:2:0:4934:989e:efb7:a2ba]:5173',
];

function getCorsOrigins() {
  const origins = process.env.CORS_ORIGINS || process.env.FRONTEND_ORIGINS;
  if (!origins) return DEFAULT_CORS_ORIGINS;
  return origins
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bodyParser: false });
  const port = Number(process.env.PORT || 4000);
  const host = process.env.HOST || '0.0.0.0';

  app.use(json({ limit: '100mb' }));
  app.use(urlencoded({ extended: true, limit: '100mb' }));
  app.use('/uploads', serveStatic(join(process.cwd(), 'uploads')));

  app.enableCors({
    origin: getCorsOrigins(),
    credentials: true,
  });

  try {
    await app.listen(port, host);
  } catch (err) {
    const error = err as NodeJS.ErrnoException;
    if (error.code === 'EADDRINUSE') {
      console.error(`Error: El puerto ${port} ya esta en uso.`);
      process.exit(1);
    }
    console.error('Error al iniciar el servidor:', error);
    process.exit(1);
  }

  const server = app.getHttpServer();
  server.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`Error: El puerto ${port} ya esta en uso.`);
      process.exit(1);
    }
    console.error('Error al iniciar el servidor:', err);
    process.exit(1);
  });

  const displayHost = host === '::' ? '[::]' : host;
  console.log(`Orchid POS - Backend NestJS corriendo en http://${displayHost}:${port}/api`);
}

bootstrap();
