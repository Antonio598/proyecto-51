import { Body, Controller, Get, Post } from '@nestjs/common';
import { IsOptional, IsString, MinLength } from 'class-validator';
import { Rol } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { Roles } from '../auth/roles.decorator';

class CrearAseguradoraDto {
  @IsString()
  @MinLength(2)
  nombre: string;

  @IsOptional()
  @IsString()
  contacto?: string;

  /** Notas del orden de captura del portal, útiles para los checklists de emisión. */
  @IsOptional()
  @IsString()
  notasPortal?: string;
}

@Controller('aseguradoras')
export class AseguradorasController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  listar() {
    return this.prisma.aseguradora.findMany({
      where: { activo: true },
      orderBy: { nombre: 'asc' },
    });
  }

  @Roles(Rol.administracion, Rol.admin)
  @Post()
  crear(@Body() dto: CrearAseguradoraDto) {
    return this.prisma.aseguradora.create({ data: dto });
  }
}
