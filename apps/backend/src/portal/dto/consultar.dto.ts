import { IsEmail, IsString, MinLength } from 'class-validator';

export class ConsultarPortalDto {
  @IsString()
  @MinLength(8, { message: 'Escribe un teléfono válido.' })
  telefono: string;

  @IsEmail({}, { message: 'Correo electrónico inválido.' })
  email: string;
}
