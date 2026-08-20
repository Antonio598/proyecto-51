import { IsEmail, IsString, MinLength } from 'class-validator';

export class ConsultarPortalDto {
  @IsString()
  @MinLength(10, { message: 'Escribe un RFC válido.' })
  rfc: string;

  @IsEmail({}, { message: 'Correo electrónico inválido.' })
  email: string;
}
