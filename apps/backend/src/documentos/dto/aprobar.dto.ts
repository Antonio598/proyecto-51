import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
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
  @IsString()
  flotaNombre?: string | null;

  @IsOptional()
  @IsString()
  folio?: string | null;

  @IsOptional()
  @IsEnum(TipoUnidad)
  tipo?: TipoUnidad;

  @IsOptional()
  @IsString()
  aseguradoNombre?: string | null;

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
  numeroEconomico?: string | null;

  @IsOptional()
  @IsString()
  placas?: string | null;

  @IsOptional()
  @IsString()
  numeroMotor?: string | null;

  @IsOptional()
  @IsString()
  tipoCarga?: string | null;

  @IsOptional()
  @IsString()
  usoUnidad?: string | null;

  @IsOptional()
  @IsString()
  tipoCobertura?: string | null;

  @IsOptional()
  @IsBoolean()
  dobleRemolque?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  valorAsegurado?: number | null;

  @IsOptional()
  @IsString()
  tipoAdaptacion?: string | null;

  @IsOptional()
  @IsString()
  coberturaAdaptacion?: string | null;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  sumaAseguradaAdaptacion?: number | null;
}

export class AprobarExtraccionDto {
  /** Necesario sólo si el documento llegó de un número no registrado. */
  @IsOptional()
  @IsString()
  clienteId?: string;

  /** RFC del cliente extraído/corregido; se guarda en la ficha del cliente. */
  @IsOptional()
  @IsString()
  clienteRfc?: string;

  @IsOptional()
  @IsString()
  clienteRazonSocial?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UnidadCorregidaDto)
  unidades: UnidadCorregidaDto[];
}
