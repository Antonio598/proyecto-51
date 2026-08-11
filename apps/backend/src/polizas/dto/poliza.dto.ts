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
  primaNeta?: number;

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
  @IsString()
  @MinLength(3)
  folio: string;

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
