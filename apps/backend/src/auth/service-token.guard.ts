import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Autentica llamadas máquina-a-máquina desde n8n mediante un token de servicio.
 * Los endpoints que lo usan van marcados con @Public() para saltar el JWT
 * y protegidos con este guard en su lugar.
 */
@Injectable()
export class ServiceTokenGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const esperado = this.config.get<string>('N8N_SERVICE_TOKEN');
    if (!esperado) {
      throw new UnauthorizedException('N8N_SERVICE_TOKEN no está configurado en el servidor');
    }
    const request = context.switchToHttp().getRequest();
    if (request.headers['x-service-token'] !== esperado) {
      throw new UnauthorizedException('Token de servicio inválido');
    }
    return true;
  }
}
