import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./auth/AuthContext";
import AppLayout from "./components/AppLayout";
import ProtectedRoute from "./components/ProtectedRoute";
import DashboardPage from "./pages/DashboardPage";
import LoginPage from "./pages/LoginPage";
import TicketsPage from "./pages/TicketsPage";
import KnowledgePage from "./pages/KnowledgePage";
import AssetsPage from "./pages/AssetsPage";
import ReportsPage from "./pages/ReportsPage";
import AutomationsPage from "./pages/AutomationsPage";
import AdminPage from "./pages/AdminPage";

function App() {
  const { isAuthenticated } = useAuth();

  return (
    <Routes>
      <Route
        path="/login"
        element={
          isAuthenticated ? <Navigate to="/app/dashboard" replace /> : <LoginPage />
        }
      />

      <Route
        path="/app"
        element={
          <ProtectedRoute>
            <AppLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Navigate to="/app/dashboard" replace />} />
        <Route path="dashboard" element={<DashboardPage />} />
        <Route path="tickets" element={<TicketsPage />} />
        <Route path="knowledge" element={<KnowledgePage />} />
        <Route path="assets" element={<AssetsPage />} />
        <Route path="reports" element={<ReportsPage />} />
        <Route path="automations" element={<AutomationsPage />} />
        <Route path="admin" element={<AdminPage />} />
      </Route>

      <Route
        path="*"
        element={<Navigate to={isAuthenticated ? "/app/dashboard" : "/login"} replace />}
      />
    </Routes>
  );
}

export default App;
