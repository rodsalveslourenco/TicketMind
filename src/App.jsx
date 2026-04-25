import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./auth/AuthContext";
import AppLayout from "./components/AppLayout";
import ProtectedRoute from "./components/ProtectedRoute";
import DashboardPage from "./pages/DashboardPage";
import LoginPage from "./pages/LoginPage";
import TicketsPage from "./pages/TicketsPage";
import KnowledgePage from "./pages/KnowledgePage";

function App() {
  const { isAuthenticated } = useAuth();

  return (
    <Routes>
      <Route
        element={isAuthenticated ? <Navigate replace to="/app/dashboard" /> : <LoginPage />}
        path="/login"
      />

      <Route
        element={
          <ProtectedRoute>
            <AppLayout />
          </ProtectedRoute>
        }
        path="/app"
      >
        <Route element={<Navigate replace to="/app/dashboard" />} index />
        <Route element={<DashboardPage />} path="dashboard" />
        <Route element={<TicketsPage />} path="tickets" />
        <Route element={<KnowledgePage />} path="knowledge" />
      </Route>

      <Route
        element={<Navigate replace to={isAuthenticated ? "/app/dashboard" : "/login"} />}
        path="*"
      />
    </Routes>
  );
}

export default App;
