import { IsEmail, IsOptional, IsString, MinLength } from 'class-validator';

export class SubirPortalDto {
  @IsString()
  @MinLength(8, { message: 'Escribe un teléfono válido.' })
  telefono: string;

  @IsEmail({}, { message: 'Correo electrónico inválido.' })
  email: string;

  @IsOptional()
  @IsString()
  nombre?: string;
}
