import { MembershipTier } from "../types";

/**
 * STRIPE SERVICE
 * 
 * En un entorno de producción real, estas funciones harían llamadas a TU Backend (Node.js/Express/Next.js).
 * El backend usaría la librería oficial 'stripe' con tu Secret Key para crear las sesiones.
 * 
 * Aquí simulamos esa comunicación para que el flujo de UI sea funcional.
 */

// 1. Iniciar Flujo de Suscripción (Checkout)
export const createSubscriptionCheckout = async (tier: MembershipTier, email: string): Promise<void> => {
  console.log(`[Stripe Service] Iniciando Checkout para ${tier.name} (${tier.stripePriceId}) - Usuario: ${email}`);
  
  return new Promise((resolve) => {
    setTimeout(() => {
      // SIMULACIÓN: En producción, aquí rediriges a window.location.href = session.url
      // session.url viene de tu backend: await axios.post('/api/create-checkout-session', ...)
      
      const mockStripeUrl = "https://checkout.stripe.com/c/pay/mock_session_id";
      alert(`[SIMULACIÓN] Redirigiendo a Stripe Checkout Segura:\n\nPlan: ${tier.name}\nPrecio: $${tier.price}/mes\nID Stripe: ${tier.stripePriceId}\n\n(En producción, el usuario saldría de la web hacia Stripe)`);
      
      // Simular éxito y redirección al dashboard
      window.location.hash = "#/dashboard?status=success";
      resolve();
    }, 1500);
  });
};

// 2. Acceder al Portal de Cliente (Para cancelar/cambiar tarjeta)
export const redirectToCustomerPortal = async (): Promise<void> => {
  console.log(`[Stripe Service] Solicitando enlace al Customer Portal`);
  
  return new Promise((resolve) => {
    setTimeout(() => {
      alert(`[SIMULACIÓN] Redirigiendo al Portal de Facturación de Stripe.\nAquí el usuario puede:\n- Actualizar tarjeta\n- Descargar facturas fiscalmente válidas\n- Cancelar suscripción`);
      resolve();
    }, 1000);
  });
};

// 3. Verificar estado de suscripción (Sync Backend)
export const checkSubscriptionStatus = async (userId: string) => {
    // Call backend to check DB status updated by Webhooks
    return 'active';
};