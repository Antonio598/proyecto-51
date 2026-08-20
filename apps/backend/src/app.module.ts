import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { PrismaModule } from './prisma/prisma.module';
import { AuditModule } from './audit/audit.module';
import { StorageModule } from './storage/storage.module';
import { CorreoModule } from './correo/correo.module';
import { IaModule } from './ia/ia.module';
import { GeneracionModule } from './generacion/generacion.module';
import { NotificacionesModule } from './notificaciones/notificaciones.module';
import { AuthModule } from './auth/auth.module';
import { ClientesModule } from './clientes/clientes.module';
import { AseguradorasModule } from './aseguradoras/aseguradoras.module';
import { WhatsappModule } from './whatsapp/whatsapp.module';
import { DocumentosModule } from './documentos/documentos.module';
import { ExpedientesModule } from './expedientes/expedientes.module';
import { PolizasModule } from './polizas/polizas.module';
import { CobranzaModule } from './cobranza/cobranza.module';
import { PagosModule } from './pagos/pagos.module';
import { FacturasModule } from './facturas/facturas.module';
import { HealthModule } from './health/health.module';
import { BootstrapModule } from './bootstrap/bootstrap.module';
import { UsuariosModule } from './usuarios/usuarios.module';
import { PortalModule } from './portal/portal.module';
import { JwtAuthGuard } from './auth/jwt-auth.guard';
import { RolesGuard } from './auth/roles.guard';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    // Límite de peticiones (protege el portal público). ttl en milisegundos.
    ThrottlerModule.forRoot([{ ttl: 600_000, limit: 100 }]),
    PrismaModule,
    AuditModule,
    StorageModule,
    CorreoModule,
    IaModule,
    GeneracionModule,
    NotificacionesModule,
    AuthModule,
    ClientesModule,
    AseguradorasModule,
    WhatsappModule,
    DocumentosModule,
    ExpedientesModule,
    PolizasModule,
    CobranzaModule,
    PagosModule,
    FacturasModule,
    HealthModule,
    BootstrapModule,
    UsuariosModule,
    PortalModule,
  ],
  providers: [
    // JWT global: todos los endpoints exigen token salvo los marcados @Public().
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    // RBAC global: aplica @Roles() cuando el endpoint lo declara.
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
