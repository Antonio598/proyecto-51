import {
  Body,
  Controller,
  Post,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { PortalService } from './portal.service';
import { SubirPortalDto } from './dto/subir.dto';
import { ConsultarPortalDto } from './dto/consultar.dto';
import { Public } from '../auth/public.decorator';

/**
 * Portal público de autoservicio. NO requiere sesión (@Public salta el JWT),
 * pero está limitado por IP (@Throttle) para contener el abuso.
 */
@Controller('portal')
export class PortalController {
  constructor(private readonly portal: PortalService) {}

  @Public()
  @UseGuards(ThrottlerGuard)
  // Límite holgado: un envío grande se sube en muchas tandas pequeñas, así que
  // cada envío son muchas peticiones. Aun así, acota el abuso por IP.
  @Throttle({ default: { ttl: 600_000, limit: 300 } })
  @Post('subir')
  @UseInterceptors(
    // Cada tanda es pequeña (el navegador descomprime y reparte). Se deja margen
    // holgado por archivo por si alguien sube un solo archivo grande.
    FilesInterceptor('archivos', 30, {
      limits: { fileSize: 20 * 1024 * 1024, files: 30 },
    }),
  )
  subir(@UploadedFiles() archivos: Express.Multer.File[], @Body() dto: SubirPortalDto) {
    return this.portal.recibir({
      telefono: dto.telefono,
      email: dto.email,
      nombre: dto.nombre,
      loteId: dto.loteId,
      categoria: dto.categoria,
      archivos: (archivos ?? []).map((a) => ({
        buffer: a.buffer,
        nombre: a.originalname,
        mime: a.mimetype,
      })),
    });
  }

  /**
   * Consulta de cuenta: el cliente ve su flota, pólizas y cobranza dando
   * teléfono + correo. Límite más holgado que la subida, pero acotado por IP.
   */
  @Public()
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { ttl: 600_000, limit: 20 } })
  @Post('consultar')
  consultar(@Body() dto: ConsultarPortalDto) {
    return this.portal.consultar({ telefono: dto.telefono, email: dto.email });
  }
}
