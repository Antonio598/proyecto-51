import { Controller, Get } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Public } from '../auth/public.decorator';

@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  /** Sondeo de vida para Docker/monitorización. No requiere autenticación. */
  @Public()
  @Get()
  async health() {
    let baseDatos = 'ok';
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      baseDatos = 'error';
    }
    return {
      estado: baseDatos === 'ok' ? 'ok' : 'degradado',
      baseDatos,
      hora: new Date().toISOString(),
    };
  }
}
