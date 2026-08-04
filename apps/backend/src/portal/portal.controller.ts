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
  // Máx. 5 envíos cada 10 minutos por IP.
  @Throttle({ default: { ttl: 600_000, limit: 5 } })
  @Post('subir')
  @UseInterceptors(
    FilesInterceptor('archivos', 10, {
      limits: { fileSize: 15 * 1024 * 1024, files: 10 },
    }),
  )
  subir(@UploadedFiles() archivos: Express.Multer.File[], @Body() dto: SubirPortalDto) {
    return this.portal.recibir({
      telefono: dto.telefono,
      email: dto.email,
      nombre: dto.nombre,
      archivos: (archivos ?? []).map((a) => ({
        buffer: a.buffer,
        nombre: a.originalname,
        mime: a.mimetype,
      })),
    });
  }
}
