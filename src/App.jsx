import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./auth/AuthContext";
import AppLayout from "./components/AppLayout";
import ProtectedRoute from "./components/ProtectedRoute";
import DashboardPage from "./pages/DashboardPage";
import LoginPage from "./pages/LoginPage";
import TicketsPage from "./pages/TicketsPage";
import UsersPage from "./pages/UsersPage";
import AssetsPage from "./pages/AssetsPage";
import ProjectsPage from "./pages/ProjectsPage";
import ApiConfigPage from "./pages/ApiConfigPage";

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
        <Route element={<AssetsPage />} path="assets" />
        <Route element={<ProjectsPage />} path="projects" />
        <Route element={<ApiConfigPage />} path="api-rest" />
        <Route element={<UsersPage />} path="users" />
      </Route>
      <Route
        element={<Navigate replace to={isAuthenticated ? "/app/dashboard" : "/login"} />}
        path="*"
      />
    </Routes>
  );
}

export default App;
