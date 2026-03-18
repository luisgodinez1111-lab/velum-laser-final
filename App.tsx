import React, { lazy, Suspense } from 'react';
import { HashRouter as Router, Routes, Route } from 'react-router-dom';
import { Layout } from './components/Layout';
import { AuthProvider } from './context/AuthContext';
import { ToastProvider } from './context/ToastContext';
import { ToastContainer } from './components/ToastContainer';
import { AppErrorBoundary } from './components/AppErrorBoundary';
import { PageSkeleton } from './components/PageSkeleton';
import { ForcePasswordChange } from './components/ForcePasswordChange';
import { useAuth } from './context/AuthContext';

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
const AgendaIntegrations = lazy(() => import('./pages/settings/AgendaIntegrations').then(m => ({ default: m.AgendaIntegrations })));
const OnboardingAdmin   = lazy(() => import('./pages/OnboardingAdmin').then(m => ({ default: m.OnboardingAdmin })));
const ResetPassword     = lazy(() => import('./pages/ResetPassword').then(m => ({ default: m.ResetPassword })));
const CustomCharge      = lazy(() => import('./pages/CustomChargePage').then(m => ({ default: m.CustomChargePage })));
const NotFound          = lazy(() => import('./pages/NotFound').then(m => ({ default: m.NotFound })));

const InnerApp: React.FC = () => {
  const { mustChangePassword } = useAuth();
  return (
    <>
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
                <Route path="/admin/whatsapp"                element={<AdminWhatsApp />} />
                <Route path="/admin/stripe"                  element={<AdminStripe />} />
                <Route path="/admin/users-permissions"       element={<AdminUsers />} />
                <Route path="/settings/agenda-integrations"  element={<AgendaIntegrations />} />
                <Route path="/admin/onboarding"              element={<OnboardingAdmin />} />
                <Route path="/reset-password"               element={<ResetPassword />} />
                <Route path="/custom-charge/:id"            element={<CustomCharge />} />
                <Route path="*"                              element={<NotFound />} />
              </Routes>
            </Suspense>
          </Layout>
        </AppErrorBoundary>
      </Router>
      {mustChangePassword && <ForcePasswordChange />}
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
