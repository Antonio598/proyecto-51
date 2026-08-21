import { Type } from 'class-transformer';
import {
  IsDate,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  Min,
  MinLength,
} from 'class-validator';

export class PrepararEmisionDto {
  @IsString()
  aseguradoraId: string;

  @Type(() => Date)
  @IsDate()
  vigenciaInicio: Date;

  // Emisión por flota: si viene, sólo se emiten las unidades de esa flota.
  @IsOptional()
  @IsString()
  flotaId?: string;
}

export class CrearPorEnlaceDto {
  @IsString()
  aseguradoraId: string;

  @IsUrl({}, { message: 'La liga de la póliza no es una URL válida.' })
  urlNube: string;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  vigenciaInicio?: Date;

  @IsOptional()
  @IsString()
  flotaId?: string;
}

export class ActualizarEnlaceDto {
  @IsUrl({}, { message: 'La liga de la póliza no es una URL válida.' })
  urlNube: string;
}

export class ActualizarCobranzaDto {
  @IsOptional()
  @IsString()
  folio?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  prima?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  primaNeta?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  financiamiento?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  gastosExpedicion?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  iva?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  primaTotal?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(60)
  numeroPagos?: number;
}

export class MarcarEmitidaDto {
  // Al emitir se captura el número de serie (VIN) de la unidad. El folio de la
  // aseguradora es opcional (se captura después en los datos de cobranza).
  @IsOptional()
  @IsString()
  @MinLength(5)
  serie?: string;

  @IsOptional()
  @IsString()
  folio?: string;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  vigenciaInicio?: Date;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  vigenciaFin?: Date;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  prima?: number;
}
