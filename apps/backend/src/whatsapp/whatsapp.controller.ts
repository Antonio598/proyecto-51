import {
  Body,
  Controller,
  Headers,
  HttpCode,
  Logger,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Public } from '../auth/public.decorator';
import { IngestaService } from './ingesta.service';

@Controller('webhooks')
export class WhatsappController {
  private readonly logger = new Logger(WhatsappController.name);

  constructor(
    private readonly ingesta: IngestaService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Webhook de Evolution API. Configúralo en Evolution apuntando a
   * `POST <BACKEND_URL>/api/webhooks/evolution` con el header
   * `x-webhook-token: <EVOLUTION_WEBHOOK_TOKEN>`.
   *
   * Devuelve 200 siempre que el token sea válido, para que Evolution no reintente
   * indefinidamente por errores de nuestro lado (quedan en el log).
   */
  @Public()
  @Post('evolution')
  @HttpCode(200)
  async evolution(@Body() evento: unknown, @Headers('x-webhook-token') token?: string) {
    const esperado = this.config.get<string>('EVOLUTION_WEBHOOK_TOKEN');
    if (esperado && token !== esperado) {
      throw new UnauthorizedException('Token de webhook inválido');
    }

    try {
      return await this.ingesta.procesarEvento(evento as any);
    } catch (err) {
      this.logger.error(`Error al procesar webhook: ${(err as Error).message}`);
      return { procesado: false, motivo: 'error interno' };
    }
  }
}
