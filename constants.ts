import { MembershipTier, Zone, ZoneId } from './types';

// Zonas basadas en el PDF (Identidad, Presencia, Equilibrio, Función)
// Hemos desglosado las zonas específicas para que el usuario pueda seleccionarlas.
export const ZONES: Zone[] = [
  // ZONA I — IDENTIDAD
  { id: 'FACE_FULL', name: 'Rostro Completo', description: 'Incluye frente, entrecejo, bigote y mentón (Zona I).' },
  { id: 'NECK', name: 'Cuello', description: 'Anterior y lateral (Zona I).' },
  
  // ZONA II — PRESENCIA
  { id: 'NAPE', name: 'Nuca y Cuello Posterior', description: 'Zona II.' },
  { id: 'UPPER_BACK', name: 'Espalda Alta', description: 'Dorsales superiores + línea media (Zona II).' },
  
  // ZONA III — EQUILIBRIO
  { id: 'ABDOMEN', name: 'Abdomen y Línea Alba', description: 'Zona III.' },
  { id: 'LOWER_BACK', name: 'Lumbar Baja', description: 'Zona III.' },
  { id: 'THIGHS', name: 'Muslos Completos', description: 'Frontal, lateral y posterior (Zona III).' },
  
  // ZONA IV — FUNCIÓN
  { id: 'UNDERARMS', name: 'Axilas', description: 'Zona IV.' },
  { id: 'ARMS_FULL', name: 'Brazos Completos', description: 'Zona IV.' },
  { id: 'BIKINI', name: 'Bikini Frontal', description: 'Zona IV.' },
  { id: 'GLUTEUS', name: 'Glúteos', description: 'Zona IV.' },
  { id: 'LOWER_LEGS', name: 'Pierna Baja', description: 'Pantorrilla y espinilla (Zona IV).' },
];

// NOTA: stripePriceId aquí son solo referencias visuales / placeholders.
// El sistema de cobro usa planCode = name.toLowerCase() (essential, select, advance, progress, signature).
// Los Stripe Price IDs reales se configuran en Admin → Stripe → Planes (guardados en AppSetting).
export const MEMBERSHIPS: MembershipTier[] = [
  {
    id: 1,
    name: 'Essential',
    price: 499,
    maxZones: 1,
    description: '”Empiezo por lo esencial”. Ideal para iniciar el hábito.',
    isFullBody: false,
    stripePriceId: 'essential' // planCode — el Price ID real se configura en Admin → Stripe
  },
  {
    id: 2,
    name: 'Select',
    price: 699,
    maxZones: 2,
    description: 'Selección clínica inteligente. “Solo lo que realmente necesito”.',
    isFullBody: false,
    stripePriceId: 'select'
  },
  {
    id: 3,
    name: 'Advance',
    price: 799,
    maxZones: 2,
    description: '”Quiero avanzar más rápido”. Cobertura ampliada.',
    isFullBody: false,
    stripePriceId: 'advance'
  },
  {
    id: 4,
    name: 'Progress',
    price: 1049,
    maxZones: 3,
    description: '”Ya estoy comprometido”. Para resultados integrales.',
    isFullBody: false,
    stripePriceId: 'progress'
  },
  {
    id: 5,
    name: 'Signature',
    price: 1299,
    maxZones: 12, // All zones
    description: 'Cuerpo Completo. “Todo resuelto”. Tranquilidad total sin pensar en zonas.',
    isFullBody: true,
    stripePriceId: 'signature'
  },
];