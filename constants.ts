import { MembershipTier, Zone, ZoneId } from './types';

// Sub-zonas individuales (usadas en plan Select y como detalle clínico)
export const ZONES: Zone[] = [
  // ZONA I — IDENTIDAD
  { id: 'FACE_FULL', name: 'Rostro Completo', description: 'Frente, entrecejo, bigote y mentón.' },
  { id: 'NECK', name: 'Cuello', description: 'Anterior y lateral.' },
  // ZONA II — PRESENCIA
  { id: 'NAPE', name: 'Nuca y Cuello Posterior', description: 'Posterior del cuello.' },
  { id: 'UPPER_BACK', name: 'Espalda Alta', description: 'Dorsales superiores + línea media.' },
  // ZONA III — EQUILIBRIO
  { id: 'ABDOMEN', name: 'Abdomen y Línea Alba', description: 'Vientre completo.' },
  { id: 'LOWER_BACK', name: 'Lumbar Baja', description: 'Zona lumbar.' },
  { id: 'THIGHS', name: 'Muslos Completos', description: 'Frontal, lateral y posterior.' },
  // ZONA IV — FUNCIÓN
  { id: 'UNDERARMS', name: 'Axilas', description: 'Ambas axilas.' },
  { id: 'ARMS_FULL', name: 'Brazos Completos', description: 'Antebrazo y brazo.' },
  { id: 'BIKINI', name: 'Bikini Frontal', description: 'Línea de bikini.' },
  { id: 'GLUTEUS', name: 'Glúteos', description: 'Glúteos completos.' },
  { id: 'LOWER_LEGS', name: 'Pierna Baja', description: 'Pantorrilla y espinilla.' },
];

// Las 4 Zonas VELUM completas — seleccionables en planes Master (Essential, Advance, Progress)
export const MASTER_ZONES = [
  {
    id: 'ZONE_I',
    name: 'Zona I',
    label: 'Identidad',
    tagline: 'Lo que el mundo ve primero',
    areas: ['Rostro Completo', 'Cuello Anterior'],
    subZoneIds: ['FACE_FULL', 'NECK'] as ZoneId[],
  },
  {
    id: 'ZONE_II',
    name: 'Zona II',
    label: 'Presencia',
    tagline: 'Elegancia en el porte',
    areas: ['Nuca y Cuello Posterior', 'Espalda Alta'],
    subZoneIds: ['NAPE', 'UPPER_BACK'] as ZoneId[],
  },
  {
    id: 'ZONE_III',
    name: 'Zona III',
    label: 'Equilibrio',
    tagline: 'El núcleo del cuerpo',
    areas: ['Abdomen y Línea Alba', 'Lumbar Baja', 'Muslos Completos'],
    subZoneIds: ['ABDOMEN', 'LOWER_BACK', 'THIGHS'] as ZoneId[],
  },
  {
    id: 'ZONE_IV',
    name: 'Zona IV',
    label: 'Función',
    tagline: 'Comodidad en movimiento',
    areas: ['Axilas', 'Brazos Completos', 'Bikini Frontal', 'Glúteos', 'Pierna Baja'],
    subZoneIds: ['UNDERARMS', 'ARMS_FULL', 'BIKINI', 'GLUTEUS', 'LOWER_LEGS'] as ZoneId[],
  },
] as const;

// Clasificación de tamaño para plan Select
export const SMALL_ZONE_IDS: ZoneId[] = ['FACE_FULL', 'NECK', 'NAPE', 'UNDERARMS', 'BIKINI', 'GLUTEUS', 'LOWER_BACK'];
export const MEDIUM_ZONE_IDS: ZoneId[] = ['UPPER_BACK', 'ABDOMEN', 'ARMS_FULL', 'LOWER_LEGS', 'THIGHS'];
export const SELECT_MAX_SMALL = 3;
export const SELECT_MAX_MEDIUM = 2;

// Depósito de reserva de cita (MXN). Debe coincidir con DEPOSIT_AMOUNT_CENTS/100 en el backend.
export const APPOINTMENT_DEPOSIT_MXN = 200;

// ⚠️ IMPORTANTE — FUENTE DE VERDAD:
// Los precios aquí son FALLBACKS VISUALES ÚNICAMENTE para cuando el catálogo del backend no está disponible.
// La fuente de verdad real son los precios configurados en Admin → Stripe → Planes (guardados en AppSetting.stripePlanCatalog).
// El sistema de cobro real usa el Stripe Price ID configurado en el admin, no el planCode.
// Al cambiar precios, actualízalos en Admin → Stripe → Planes. Los valores aquí son solo presentación inicial.
export const MEMBERSHIPS: MembershipTier[] = [
  {
    id: 1,
    name: 'Essential',
    price: 499,
    maxZones: 1,
    description: 'Empieza con lo esencial. Elige 1 de las 4 Zonas VELUM.',
    isFullBody: false,
    stripePriceId: 'essential',
    selectionMode: 'master',
  },
  {
    id: 2,
    name: 'Select',
    price: 699,
    maxZones: 5, // 3 pequeñas + 2 medianas
    description: 'Personaliza tu tratamiento. Combina 3 áreas pequeñas y 2 medianas.',
    isFullBody: false,
    stripePriceId: 'select',
    selectionMode: 'custom',
  },
  {
    id: 3,
    name: 'Advance',
    price: 799,
    maxZones: 2,
    description: 'Avanza más rápido. Elige 2 de las 4 Zonas VELUM.',
    isFullBody: false,
    stripePriceId: 'advance',
    selectionMode: 'master',
  },
  {
    id: 4,
    name: 'Progress',
    price: 1049,
    maxZones: 3,
    description: 'Resultados integrales. Elige 3 de las 4 Zonas VELUM.',
    isFullBody: false,
    stripePriceId: 'progress',
    selectionMode: 'master',
  },
  {
    id: 5,
    name: 'Signature',
    price: 1299,
    maxZones: 4,
    description: 'Cuerpo completo. Las 4 Zonas VELUM incluidas. Sin elegir.',
    isFullBody: true,
    stripePriceId: 'signature',
    selectionMode: 'master',
  },
];