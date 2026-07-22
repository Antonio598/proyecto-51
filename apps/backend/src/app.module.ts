import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { AuditModule } from './audit/audit.module';
import { StorageModule } from './storage/storage.module';
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
import { JwtAuthGuard } from './auth/jwt-auth.guard';
import { RolesGuard } from './auth/roles.guard';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuditModule,
    StorageModule,
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
  ],
  providers: [
    // JWT global: todos los endpoints exigen token salvo los marcados @Public().
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    // RBAC global: aplica @Roles() cuando el endpoint lo declara.
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
