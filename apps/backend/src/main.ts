import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { AppModule } from './app.module';

/**
 * Variables sin las cuales el sistema no puede arrancar.
 * Se comprueban antes de levantar Nest para dar un mensaje claro en los logs
 * en vez de un stack trace a mitad del arranque.
 */
const REQUERIDAS: Record<string, string> = {
  DATABASE_URL: 'cadena de conexión a Supabase (pooler, puerto 6543)',
  JWT_SECRET: 'secreto para firmar las sesiones',
};

/** Sin éstas el sistema arranca, pero hay funciones que fallarán al usarse. */
const RECOMENDADAS: Record<string, string> = {
  SUPABASE_URL: 'almacenamiento de documentos',
  SUPABASE_SERVICE_ROLE_KEY: 'almacenamiento de documentos',
  ANTHROPIC_API_KEY: 'extracción de documentos y redacción de propuestas',
  EVOLUTION_API_URL: 'envío y recepción por WhatsApp',
  EVOLUTION_API_KEY: 'envío y recepción por WhatsApp',
  N8N_SERVICE_TOKEN: 'cron de cobranza desde n8n',
};

function revisarEntorno(logger: Logger): void {
  const faltantes = Object.keys(REQUERIDAS).filter((k) => !process.env[k]);

  if (faltantes.length > 0) {
    logger.error('No se puede arrancar: faltan variables de entorno obligatorias.');
    for (const clave of faltantes) {
      logger.error(`  · ${clave} — ${REQUERIDAS[clave]}`);
    }
    logger.error('Defínelas en el panel de tu servicio y vuelve a desplegar.');
    process.exit(1);
  }

  const incompletas = Object.keys(RECOMENDADAS).filter((k) => !process.env[k]);
  if (incompletas.length > 0) {
    logger.warn('El sistema arrancará, pero estas funciones no estarán disponibles:');
    for (const clave of incompletas) {
      logger.warn(`  · ${clave} — ${RECOMENDADAS[clave]}`);
    }
  }
}

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  revisarEntorno(logger);

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

  // CORS para el frontend. Cuando ambos van en la misma imagen, el panel
  // llama por el mismo dominio y esto no llega a usarse.
  app.enableCors({
    origin: process.env.FRONTEND_ORIGIN?.split(',') ?? true,
    credentials: true,
  });

  const port = Number(process.env.BACKEND_PORT ?? 3001);
  // 0.0.0.0 para que sea alcanzable dentro del contenedor.
  await app.listen(port, '0.0.0.0');
  logger.log(`API escuchando en el puerto ${port}`);
}

bootstrap().catch((err) => {
  // Sin esto, un fallo al arrancar deja el contenedor reiniciándose sin
  // que quede constancia del motivo en los logs.
  new Logger('Bootstrap').error(`Fallo al arrancar: ${err?.message ?? err}`, err?.stack);
  process.exit(1);
});
