import { lazy, Suspense } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";

import ProtectedRoute from "./components/ProtectedRoute.jsx";
import ConnectionStatus from "./components/ConnectionStatus.jsx";
import AppInstallPrompt from "./components/AppInstallPrompt.jsx";
import ServiceUnavailable from "./pages/ServiceUnavailable.jsx";

const AdminPanel = lazy(() => import("./pages/AdminPanel.jsx"));
const Bar = lazy(() => import("./pages/Bar.jsx"));
const Billing = lazy(() => import("./pages/Billing.jsx"));
const Cassa = lazy(() => import("./pages/Cassa.jsx"));
const Cliente = lazy(() => import("./pages/Cliente.jsx"));
const Contattaci = lazy(() => import("./pages/Contattaci.jsx"));
const Cucina = lazy(() => import("./pages/Cucina.jsx"));
const Dashboard = lazy(() => import("./pages/Dashboard.jsx"));
const Demo = lazy(() => import("./pages/Demo.jsx"));
const Errori = lazy(() => import("./pages/Errori.jsx"));
const ForgotPassword = lazy(() => import("./pages/ForgotPassword.jsx"));
const Landing = lazy(() => import("./pages/Landing.jsx"));
const LegalPage = lazy(() => import("./pages/LegalPage.jsx"));
const Login = lazy(() => import("./pages/Login.jsx"));
const NotFound = lazy(() => import("./pages/NotFound.jsx"));
const Onboarding = lazy(() => import("./pages/Onboarding.jsx"));
const QRCodeTavoli = lazy(() => import("./pages/QRCodeTavoli.jsx"));
const Register = lazy(() => import("./pages/Register.jsx"));
const ResetPassword = lazy(() => import("./pages/ResetPassword.jsx"));
const Statistiche = lazy(() => import("./pages/Statistiche.jsx"));
const StaffAccess = lazy(() => import("./pages/StaffAccess.jsx"));
const Storico = lazy(() => import("./pages/Storico.jsx"));
const SuperAdmin = lazy(() => import("./pages/SuperAdmin.jsx"));
const Tavoli = lazy(() => import("./pages/Tavoli.jsx"));
const VerifyEmail = lazy(() => import("./pages/VerifyEmail.jsx"));

function PageFallback() {
  return (
    <div className="em-page-fallback" role="status" aria-live="polite">
      <i aria-hidden="true" />
      <span>Caricamento Ordynora...</span>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <ConnectionStatus />
      <AppInstallPrompt />
      <Suspense fallback={<PageFallback />}>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/login" element={<Login />} />
          <Route path="/staff" element={<StaffAccess />} />
          <Route path="/register" element={<Register />} />
          <Route path="/password-dimenticata" element={<ForgotPassword />} />
          <Route path="/reimposta-password" element={<ResetPassword />} />
          <Route path="/verifica-email" element={<VerifyEmail />} />
          <Route path="/demo" element={<Demo />} />
          <Route path="/demo-ristorante" element={<Demo />} />
          <Route path="/demo-commerciale" element={<Demo />} />
          <Route path="/privacy" element={<LegalPage />} />
          <Route path="/termini" element={<LegalPage />} />
          <Route path="/cookie" element={<LegalPage />} />
          <Route path="/servizio-non-disponibile" element={<ServiceUnavailable />} />

          <Route path="/menu" element={<Cliente />} />
          <Route path="/menu/:tavolo" element={<Cliente />} />
          <Route path="/menu/:slug/:tableToken" element={<Cliente />} />
          <Route path="/cliente/menu" element={<Cliente />} />
          <Route path="/cliente/menu/:tavolo" element={<Cliente />} />

          <Route path="/dashboard" element={<ProtectedRoute roles={["owner", "admin"]}><Dashboard /></ProtectedRoute>} />
          <Route path="/onboarding" element={<ProtectedRoute roles={["owner", "admin"]}><Onboarding /></ProtectedRoute>} />
          <Route path="/setup" element={<ProtectedRoute roles={["owner", "admin"]}><Onboarding /></ProtectedRoute>} />
          <Route path="/billing" element={<ProtectedRoute roles={["owner", "admin"]}><Billing /></ProtectedRoute>} />
          <Route path="/contattaci" element={<ProtectedRoute roles={["owner", "admin"]}><Contattaci /></ProtectedRoute>} />
          <Route path="/admin" element={<ProtectedRoute roles={["owner", "admin"]}><AdminPanel /></ProtectedRoute>} />
          <Route path="/super-admin" element={<ProtectedRoute roles={["superadmin"]}><SuperAdmin /></ProtectedRoute>} />
          <Route path="/cucina" element={<ProtectedRoute roles={["owner", "admin", "kitchen"]}><Cucina /></ProtectedRoute>} />
          <Route path="/bar" element={<ProtectedRoute roles={["owner", "admin", "bar"]}><Bar /></ProtectedRoute>} />
          <Route path="/cassa" element={<ProtectedRoute roles={["owner", "admin", "cashier"]}><Cassa /></ProtectedRoute>} />
          <Route path="/tavoli" element={<ProtectedRoute roles={["owner", "admin", "cashier", "waiter"]}><Tavoli /></ProtectedRoute>} />
          <Route path="/qr" element={<ProtectedRoute roles={["owner", "admin"]}><QRCodeTavoli /></ProtectedRoute>} />
          <Route path="/storico" element={<ProtectedRoute roles={["owner", "admin"]}><Storico /></ProtectedRoute>} />
          <Route path="/statistiche" element={<ProtectedRoute roles={["owner", "admin"]}><Statistiche /></ProtectedRoute>} />
          <Route path="/integrazioni" element={<ProtectedRoute roles={["owner", "admin"]}><Navigate to="/admin?tab=settings" replace /></ProtectedRoute>} />
          <Route path="/errori" element={<ProtectedRoute roles={["owner", "admin"]}><Errori /></ProtectedRoute>} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
