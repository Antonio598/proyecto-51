import { IsEmail, IsEnum, IsString, MinLength } from 'class-validator';
import { Rol } from '@prisma/client';

export class CrearUsuarioDto {
  @IsString()
  @MinLength(2)
  nombre: string;

  @IsEmail({}, { message: 'Correo electrónico inválido' })
  email: string;

  @IsString()
  @MinLength(6, { message: 'La contraseña debe tener al menos 6 caracteres' })
  password: string;

  @IsEnum(Rol, { message: 'Rol inválido' })
  rol: Rol;
}

export class CambiarPasswordDto {
  @IsString()
  actual: string;

  @IsString()
  @MinLength(6, { message: 'La nueva contraseña debe tener al menos 6 caracteres' })
  nueva: string;
}

export class ResetPasswordDto {
  @IsString()
  @MinLength(6, { message: 'La contraseña debe tener al menos 6 caracteres' })
  nueva: string;
}
