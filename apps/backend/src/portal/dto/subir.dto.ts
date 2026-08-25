import { IsEmail, IsOptional, IsString, MinLength } from 'class-validator';

export class SubirPortalDto {
  // RFC: dato principal con el que se identifica/crea al cliente.
  @IsString()
  @MinLength(10, { message: 'Escribe tu RFC.' })
  rfc: string;

  @IsOptional()
  @IsString()
  telefono?: string;

  @IsEmail({}, { message: 'Correo electrónico inválido.' })
  email: string;

  @IsOptional()
  @IsString()
  nombre?: string;

  /** Si viene, esta es otra tanda del mismo envío: se agrega a ese documento. */
  @IsOptional()
  @IsString()
  loteId?: string;

  /** "flota" (por defecto, va a la bandeja) o "comprobante" (va a Pagos). */
  @IsOptional()
  @IsString()
  categoria?: string;
}
