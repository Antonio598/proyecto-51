import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { JwtUser } from './current-user.decorator';

interface JwtPayload {
  sub: string;
  email: string;
  rol: string;
  nombre: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get<string>('JWT_SECRET') ?? 'dev_secret',
    });
  }

  async validate(payload: JwtPayload): Promise<JwtUser> {
    const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user || !user.activo) {
      throw new UnauthorizedException('Usuario inválido o inactivo');
    }
    return { userId: user.id, email: user.email, rol: user.rol, nombre: user.nombre };
  }
}
