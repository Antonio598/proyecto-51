import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Prefijo global de la API
  app.setGlobalPrefix('api');

  // Validación automática de DTOs (class-validator)
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  // CORS para el frontend Next.js
  app.enableCors({
    origin: process.env.FRONTEND_ORIGIN?.split(',') ?? true,
    credentials: true,
  });

  const port = Number(process.env.BACKEND_PORT ?? 3001);
  await app.listen(port);
  new Logger('Bootstrap').log(`API escuchando en http://localhost:${port}/api`);
}

bootstrap();
