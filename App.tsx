import React, { useEffect } from "react";
import { HashRouter as Router, Routes, Route } from 'react-router-dom';
import { Layout } from './components/Layout';
import { Home } from './pages/Home';
import { Memberships } from './pages/Memberships';
import { Agenda } from './pages/Agenda';
import { Dashboard } from './pages/Dashboard';
import { Admin } from './pages/Admin';
import { AdminWhatsAppSettings } from "./pages/AdminWhatsAppSettings";
import { AdminStripeSettings } from "./pages/AdminStripeSettings";
import { AdminUsersPermissions } from "./pages/AdminUsersPermissions";
import { AuthProvider } from './context/AuthContext';
import { ToastProvider } from './context/ToastContext';
import { ToastContainer } from './components/ToastContainer';

const App: React.FC = () => {
  return (
    <ToastProvider>
      <AuthProvider>
        <Router>
          <Layout>
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/memberships" element={<Memberships />} />
              <Route path="/agenda" element={<Agenda />} />
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/admin" element={<Admin />} />
              <Route path="/admin/whatsapp" element={<AdminWhatsAppSettings />} />
              <Route path="/admin/stripe" element={<AdminStripeSettings />} />
              <Route path="/admin/users-permissions" element={<AdminUsersPermissions />} />
            </Routes>
          </Layout>
        </Router>
        <ToastContainer />
      </AuthProvider>
    </ToastProvider>
  );
};

export default App;
