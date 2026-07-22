import {
  IsBoolean,
  IsEmail,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateClienteDto {
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  razonSocial: string;

  @IsOptional()
  @IsString()
  rfc?: string;

  @IsOptional()
  datosFiscales?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  contactoNombre?: string;

  @IsOptional()
  @IsEmail()
  contactoEmail?: string;

  // Número WhatsApp en formato E.164 (ej. +525512345678). Clave del match automático.
  @IsOptional()
  @IsString()
  whatsappNumber?: string;

  @IsOptional()
  @IsString()
  notas?: string;
}

export class UpdateClienteDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  razonSocial?: string;

  @IsOptional()
  @IsString()
  rfc?: string;

  @IsOptional()
  datosFiscales?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  contactoNombre?: string;

  @IsOptional()
  @IsEmail()
  contactoEmail?: string;

  @IsOptional()
  @IsString()
  whatsappNumber?: string;

  @IsOptional()
  @IsString()
  notas?: string;

  @IsOptional()
  @IsBoolean()
  activo?: boolean;
}
