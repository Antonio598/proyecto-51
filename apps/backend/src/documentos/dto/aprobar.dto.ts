import { Type } from 'class-transformer';
import {
  IsArray,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { TipoUnidad } from '@prisma/client';

export class UnidadCorregidaDto {
  @IsOptional()
  @IsEnum(TipoUnidad)
  tipo?: TipoUnidad;

  @IsOptional()
  @IsString()
  vin?: string | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1950)
  @Max(2100)
  anio?: number | null;

  @IsOptional()
  @IsString()
  marca?: string | null;

  @IsOptional()
  @IsString()
  modelo?: string | null;

  @IsOptional()
  @IsString()
  descripcion?: string | null;

  @IsOptional()
  @IsString()
  tipoCarga?: string | null;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  valorAsegurado?: number | null;
}

export class AprobarExtraccionDto {
  /** Necesario sólo si el documento llegó de un número no registrado. */
  @IsOptional()
  @IsString()
  clienteId?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UnidadCorregidaDto)
  unidades: UnidadCorregidaDto[];
}
