import React from 'react';
import { HashRouter as Router, Routes, Route } from 'react-router-dom';
import { Layout } from './components/Layout';
import { Home } from './pages/Home';
import { Memberships } from './pages/Memberships';
import { Agenda } from './pages/Agenda';
import { Dashboard } from './pages/Dashboard';
import { Admin } from './pages/Admin';
import { AuthProvider } from './context/AuthContext';

const App: React.FC = () => {
  return (
    <AuthProvider>
      <Router>
        <Layout>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/memberships" element={<Memberships />} />
            <Route path="/agenda" element={<Agenda />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/admin" element={<Admin />} />
          </Routes>
        </Layout>
      </Router>
    </AuthProvider>
  );
};

export default App;