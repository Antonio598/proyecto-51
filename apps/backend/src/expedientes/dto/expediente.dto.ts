import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { EstadoExpediente } from '@prisma/client';

export class CrearExpedienteDto {
  @IsString()
  clienteId: string;

  @IsOptional()
  @IsString()
  siniestralidad?: string;

  /** Aseguradoras a las que se solicitó propuesta; al completarlas se genera el comparativo. */
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  aseguradorasSolicitadas: string[];
}

export class ActualizarExpedienteDto {
  @IsOptional()
  @IsString()
  siniestralidad?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  aseguradorasSolicitadas?: string[];
}

class CoberturasDto {
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) responsabilidadCivil: number | null;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) danosMateriales: number | null;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) roboTotal: number | null;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) gastosMedicosOcupantes: number | null;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) responsabilidadCivilCarga: number | null;
  @IsOptional() @IsBoolean() asistenciaJuridica: boolean;
  @IsOptional() @IsString() extras: string | null;
}

class DeduciblesDto {
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) danosMateriales: number | null;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) roboTotal: number | null;
}

/** Captura estructurada (no texto libre) de lo que regresó cada aseguradora. */
export class PropuestaAseguradoraDto {
  @IsString()
  aseguradoraId: string;

  @ValidateNested()
  @Type(() => CoberturasDto)
  coberturas: CoberturasDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => DeduciblesDto)
  deducibles?: DeduciblesDto;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  prima?: number;

  @IsOptional()
  @IsString()
  condiciones?: string;
}

export class CambiarEstadoDto {
  @IsEnum(EstadoExpediente)
  estado: EstadoExpediente;
}

export class ComentarioDto {
  @IsString()
  contenido: string;
}

export class GenerarPropuestaDto {
  @IsString()
  aseguradoraId: string;
}
