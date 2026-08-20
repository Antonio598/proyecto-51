import { Global, Module } from '@nestjs/common';
import { CorreoService } from './correo.service';

// Global: cualquier módulo (cobranza, facturas, expedientes…) puede inyectar
// CorreoService sin importar este módulo, igual que Storage/Notificaciones.
@Global()
@Module({
  providers: [CorreoService],
  exports: [CorreoService],
})
export class CorreoModule {}
