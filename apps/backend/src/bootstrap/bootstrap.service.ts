import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Rol } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Siembra los datos mínimos en el primer arranque, para que un despliegue
 * nuevo quede usable sin pegar SQL ni ejecutar scripts a mano.
 *
 * Es idempotente: si ya hay usuarios, no toca nada.
 */
@Injectable()
export class BootstrapService implements OnModuleInit {
  private readonly logger = new Logger(BootstrapService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async onModuleInit() {
    try {
      await this.crearAdminSiNoHayUsuarios();
      await this.crearAseguradorasBase();
    } catch (err) {
      // Un fallo aquí no debe impedir que el sistema arranque.
      this.logger.warn(`No se pudo inicializar: ${(err as Error).message}`);
    }
  }

  private async crearAdminSiNoHayUsuarios() {
    if ((await this.prisma.user.count()) > 0) return;

    const email = this.config.get<string>('ADMIN_EMAIL') ?? 'admin@despacho.mx';
    const password = this.config.get<string>('ADMIN_PASSWORD') ?? 'cambiar123';

    await this.prisma.user.create({
      data: {
        nombre: 'Administrador',
        email,
        passwordHash: await bcrypt.hash(password, 10),
        rol: Rol.admin,
      },
    });

    this.logger.log('═══════════════════════════════════════════════');
    this.logger.log(' Primer arranque: usuario administrador creado');
    this.logger.log(`   Correo:     ${email}`);
    if (!this.config.get('ADMIN_PASSWORD')) {
      this.logger.warn(`   Contraseña: ${password}  ← CÁMBIALA AL ENTRAR`);
    }
    this.logger.log('═══════════════════════════════════════════════');
  }

  /** Catálogo inicial de aseguradoras; se puede ampliar desde el panel. */
  private async crearAseguradorasBase() {
    if ((await this.prisma.aseguradora.count()) > 0) return;

    await this.prisma.aseguradora.createMany({
      data: [
        { nombre: 'AXA', contacto: 'Portal AXA Seguros' },
        { nombre: 'Qualitas', contacto: 'Portal Qualitas' },
      ],
      skipDuplicates: true,
    });
    this.logger.log('Catálogo de aseguradoras inicializado (AXA, Qualitas).');
  }
}
