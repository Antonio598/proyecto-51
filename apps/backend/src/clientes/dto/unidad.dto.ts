import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { TipoUnidad } from '@prisma/client';

export class CreateUnidadDto {
  @IsOptional()
  @IsEnum(TipoUnidad)
  tipo?: TipoUnidad;

  @IsOptional()
  @IsString()
  vin?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1950)
  @Max(2100)
  anio?: number;

  @IsOptional()
  @IsString()
  marca?: string;

  @IsOptional()
  @IsString()
  modelo?: string;

  @IsOptional()
  @IsString()
  descripcion?: string;

  @IsOptional()
  @IsString()
  tipoCarga?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  valorAsegurado?: number;

  // Cualquier columna extra del layout Excel del despacho.
  @IsOptional()
  camposExtra?: Record<string, unknown>;
}

export class UpdateUnidadDto extends CreateUnidadDto {
  @IsOptional()
  @IsBoolean()
  activo?: boolean;
}
