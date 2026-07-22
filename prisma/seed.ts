// Seed de datos de prueba para la Fase A.
// Crea usuarios por rol, aseguradoras y un par de clientes con flota.
// Ejecutar: npm run prisma:seed
import {
  EstadoCobranza,
  EstadoExpediente,
  EstadoPoliza,
  PrismaClient,
  Rol,
  TipoUnidad,
} from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

function sumarDias(fecha: Date, dias: number): Date {
  const d = new Date(fecha);
  d.setDate(d.getDate() + dias);
  return d;
}

async function main() {
  const passwordHash = await bcrypt.hash('cambiar123', 10);

  // --- Usuarios (uno por rol) ---
  const usuarios: Array<{ nombre: string; email: string; rol: Rol }> = [
    { nombre: 'Admin General', email: 'admin@despacho.mx', rol: Rol.admin },
    { nombre: 'Ana Captura', email: 'captura@despacho.mx', rol: Rol.captura },
    { nombre: 'Tomás Técnico', email: 'tecnico@despacho.mx', rol: Rol.tecnico },
    { nombre: 'Carla Comercial', email: 'comercial@despacho.mx', rol: Rol.comercial },
    { nombre: 'Adán Administración', email: 'admon@despacho.mx', rol: Rol.administracion },
  ];
  for (const u of usuarios) {
    await prisma.user.upsert({
      where: { email: u.email },
      update: {},
      create: { ...u, passwordHash },
    });
  }

  // --- Aseguradoras ---
  const axa = await prisma.aseguradora.upsert({
    where: { nombre: 'AXA' },
    update: {},
    create: { nombre: 'AXA', contacto: 'Portal AXA Seguros' },
  });
  await prisma.aseguradora.upsert({
    where: { nombre: 'Qualitas' },
    update: {},
    create: { nombre: 'Qualitas', contacto: 'Portal Qualitas' },
  });

  // --- Cliente 1 con flota ---
  const cliente1 = await prisma.cliente.upsert({
    where: { whatsappNumber: '+525512345678' },
    update: {},
    create: {
      razonSocial: 'Transportes del Norte SA de CV',
      rfc: 'TNO120315AB1',
      contactoNombre: 'Luis Ramírez',
      contactoEmail: 'luis@transportesnorte.mx',
      whatsappNumber: '+525512345678',
      unidades: {
        create: [
          {
            tipo: TipoUnidad.tractocamion,
            vin: '3AKJHHDR7JSJX1234',
            anio: 2019,
            marca: 'Kenworth',
            modelo: 'T680',
            descripcion: 'Tractocamión de arrastre',
            tipoCarga: 'Carga general',
            valorAsegurado: 1850000.0,
          },
          {
            tipo: TipoUnidad.remolque,
            vin: '1JJV532W3KL567890',
            anio: 2020,
            marca: 'Wabash',
            modelo: 'DuraPlate',
            descripcion: 'Caja seca 53 pies',
            tipoCarga: 'Carga general',
            valorAsegurado: 650000.0,
          },
        ],
      },
    },
  });

  // --- Cliente 2 ---
  const cliente2 = await prisma.cliente.upsert({
    where: { whatsappNumber: '+528187654321' },
    update: {},
    create: {
      razonSocial: 'Logística Bajío SA de CV',
      rfc: 'LBA150620XY2',
      contactoNombre: 'María Fernández',
      whatsappNumber: '+528187654321',
      datosFiscales: {
        domicilio: 'Av. Industria 145, León, Gto.',
        codigoPostal: '37160',
        regimen: '601 — General de Ley Personas Morales',
        usoCfdi: 'G03 — Gastos en general',
      },
      unidades: {
        create: [
          {
            tipo: TipoUnidad.camion,
            vin: '4V4NC9EH5KN987654',
            anio: 2021,
            marca: 'Volvo',
            modelo: 'VNL',
            descripcion: 'Camión rígido',
            tipoCarga: 'Materiales de construcción',
            valorAsegurado: 1200000.0,
          },
        ],
      },
    },
  });

  // ── Datos para probar la Fase C sin construir el estado a mano ──
  // Expediente ya aprobado, con dos propuestas capturadas: listo para emitir.
  const qualitas = await prisma.aseguradora.findUniqueOrThrow({ where: { nombre: 'Qualitas' } });
  const tecnico = await prisma.user.findUniqueOrThrow({
    where: { email: 'tecnico@despacho.mx' },
  });

  const expedienteExistente = await prisma.expediente.findFirst({
    where: { clienteId: cliente1.id },
  });

  if (!expedienteExistente) {
    const expediente = await prisma.expediente.create({
      data: {
        clienteId: cliente1.id,
        estado: EstadoExpediente.aprobado,
        siniestralidad: '2 siniestros en los últimos 12 meses, ambos por daños materiales menores.',
        aseguradorasSolicitadas: [axa.id, qualitas.id],
        createdById: tecnico.id,
      },
    });

    await prisma.propuestaAseguradora.createMany({
      data: [
        {
          expedienteId: expediente.id,
          aseguradoraId: axa.id,
          coberturas: {
            responsabilidadCivil: 4000000,
            danosMateriales: 2500000,
            roboTotal: 2500000,
            gastosMedicosOcupantes: 300000,
            responsabilidadCivilCarga: 1500000,
            asistenciaJuridica: true,
            extras: 'Gastos de grúa sin límite',
          },
          deducibles: { danosMateriales: 5, roboTotal: 10 },
          prima: 186000,
          condiciones: 'Vigencia anual. Pago fraccionado sin recargo.',
        },
        {
          expedienteId: expediente.id,
          aseguradoraId: qualitas.id,
          coberturas: {
            responsabilidadCivil: 3500000,
            danosMateriales: 2500000,
            roboTotal: 2500000,
            gastosMedicosOcupantes: 250000,
            responsabilidadCivilCarga: 1000000,
            asistenciaJuridica: true,
            extras: null,
          },
          deducibles: { danosMateriales: 5, roboTotal: 10 },
          prima: 172000,
          condiciones: 'Requiere instalación de GPS en todas las unidades.',
        },
      ],
    });
    console.log(`  Expediente aprobado creado (${expediente.folioInterno.slice(-8)})`);
  }

  // ── Datos para probar la Fase D: póliza emitida con un cobro ya vencido ──
  const polizaExistente = await prisma.poliza.findFirst({ where: { clienteId: cliente2.id } });

  if (!polizaExistente) {
    const unidad = await prisma.unidad.findFirstOrThrow({ where: { clienteId: cliente2.id } });
    const inicio = sumarDias(new Date(), -45); // vigencia iniciada hace 45 días
    const fin = new Date(inicio);
    fin.setFullYear(fin.getFullYear() + 1);

    const poliza = await prisma.poliza.create({
      data: {
        clienteId: cliente2.id,
        unidadId: unidad.id,
        aseguradoraId: axa.id,
        folio: 'AXA-DEMO-00123',
        estado: EstadoPoliza.emitida,
        vigenciaInicio: inicio,
        vigenciaFin: fin,
        prima: 96000,
      },
    });

    // Corte vencido: su fecha de pago cayó hace 15 días.
    await prisma.corte.create({
      data: {
        polizaId: poliza.id,
        periodo: `${inicio.getFullYear()}-${String(inicio.getMonth() + 1).padStart(2, '0')}`,
        fechaCorte: inicio,
        fechaProximoPago: sumarDias(inicio, 30),
        montoEsperado: 8000,
        estado: EstadoCobranza.vencido,
      },
    });
    console.log(`  Póliza emitida con cobro vencido creada (${poliza.folio})`);
  }

  console.log('\nSeed completado.');
  console.log(`  Usuarios: ${usuarios.length} (password: cambiar123)`);
  console.log('  Aseguradoras: AXA, Qualitas');
  console.log(`  Clientes: ${cliente1.razonSocial}, ${cliente2.razonSocial}`);
  console.log('\nPuedes probar de inmediato:');
  console.log('  · Fase C → Expedientes: hay uno aprobado listo para generar propuesta y emitir.');
  console.log('  · Fase D → Cobranza: hay un cobro vencido para ver el dashboard y el cron.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
