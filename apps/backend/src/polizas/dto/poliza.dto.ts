import { Type } from 'class-transformer';
import { IsDate, IsOptional, IsString, MinLength } from 'class-validator';

export class PrepararEmisionDto {
  @IsString()
  aseguradoraId: string;

  @Type(() => Date)
  @IsDate()
  vigenciaInicio: Date;
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
}
