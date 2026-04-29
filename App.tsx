import React, { lazy, Suspense } from 'react';
import { HashRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Layout } from './components/Layout';
import { AuthProvider } from './context/AuthContext';
import { ToastProvider } from './context/ToastContext';
import { ToastContainer } from './components/ToastContainer';
import { AppErrorBoundary } from './components/AppErrorBoundary';
import { PageSkeleton } from './components/PageSkeleton';
import { ForcePasswordChange } from './components/ForcePasswordChange';
import { MemberOnboardingFlow } from './components/MemberOnboardingFlow';
import { useAuth } from './context/AuthContext';
import type { UserRole } from './types';

// Eager — critical for first paint
import { Home } from './pages/Home';

// Lazy — loaded only when the route is visited
const Memberships       = lazy(() => import('./pages/Memberships').then(m => ({ default: m.Memberships })));
const Agenda            = lazy(() => import('./pages/Agenda').then(m => ({ default: m.Agenda })));
const Dashboard         = lazy(() => import('./pages/Dashboard').then(m => ({ default: m.Dashboard })));
const Admin             = lazy(() => import('./pages/Admin').then(m => ({ default: m.Admin })));
const AdminWhatsApp     = lazy(() => import('./pages/AdminWhatsAppSettings').then(m => ({ default: m.AdminWhatsAppSettings })));
const AdminStripe       = lazy(() => import('./pages/AdminStripeSettings').then(m => ({ default: m.AdminStripeSettings })));
const AdminUsers        = lazy(() => import('./pages/AdminUsersPermissions').then(m => ({ default: m.AdminUsersPermissions })));
const OnboardingAdmin   = lazy(() => import('./pages/OnboardingAdmin').then(m => ({ default: m.OnboardingAdmin })));
const ResetPassword     = lazy(() => import('./pages/ResetPassword').then(m => ({ default: m.ResetPassword })));
const CustomCharge      = lazy(() => import('./pages/CustomChargePage').then(m => ({ default: m.CustomChargePage })));
const NotFound          = lazy(() => import('./pages/NotFound').then(m => ({ default: m.NotFound })));

// Redirige a "/" si el usuario no tiene alguno de los roles requeridos
const RequireRole: React.FC<{ roles: UserRole[]; children: React.ReactNode; redirectTo?: string }> = ({
  roles,
  children,
  redirectTo = '/',
}) => {
  const { isSessionLoading, hasRole } = useAuth();
  if (isSessionLoading) return <PageSkeleton />;
  if (!hasRole(roles)) return <Navigate to={redirectTo} replace />;
  return <>{children}</>;
};

const InnerApp: React.FC = () => {
  const { mustChangePassword, needsOnboarding } = useAuth();
  return (
    <>
      {/* Skip-to-content — visible solo cuando recibe focus (keyboard a11y) */}
      <a href="#main-content" className="skip-to-content">Saltar al contenido</a>
      <Router>
        <AppErrorBoundary>
          <Layout>
            <Suspense fallback={<PageSkeleton />}>
              <Routes>
                <Route path="/"                              element={<Home />} />
                <Route path="/memberships"                   element={<Memberships />} />
                <Route path="/agenda"                        element={<Agenda />} />
                <Route path="/dashboard"                     element={<Dashboard />} />
                <Route path="/admin"                         element={<Admin />} />
                <Route path="/admin/whatsapp"                element={<RequireRole roles={['admin']} redirectTo="/admin"><AdminWhatsApp /></RequireRole>} />
                <Route path="/admin/stripe"                  element={<RequireRole roles={['admin']} redirectTo="/admin"><AdminStripe /></RequireRole>} />
                <Route path="/admin/users-permissions"       element={<RequireRole roles={['admin']} redirectTo="/admin"><AdminUsers /></RequireRole>} />
                <Route path="/settings/agenda-integrations"  element={<Navigate to="/admin" replace />} />
                <Route path="/admin/onboarding"              element={<RequireRole roles={['admin', 'staff']} redirectTo="/admin"><OnboardingAdmin /></RequireRole>} />
                <Route path="/reset-password"               element={<ResetPassword />} />
                <Route path="/custom-charge/:id"            element={<CustomCharge />} />
                <Route path="*"                              element={<NotFound />} />
              </Routes>
            </Suspense>
          </Layout>
        </AppErrorBoundary>
      </Router>
      {/* ForcePasswordChange takes priority — shown first (z-[9999]) */}
      {mustChangePassword && <ForcePasswordChange />}
      {/* After password is set, member-only onboarding appears (z-[9998]) */}
      {!mustChangePassword && needsOnboarding && <MemberOnboardingFlow />}
    </>
  );
};

const App: React.FC = () => (
  <ToastProvider>
    <AuthProvider>
      <InnerApp />
      <ToastContainer />
    </AuthProvider>
  </ToastProvider>
);

export default App;
