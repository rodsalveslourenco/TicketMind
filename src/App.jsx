import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./auth/AuthContext";
import AppLayout from "./components/AppLayout";
import ProtectedRoute from "./components/ProtectedRoute";
import { getUserHomePath } from "./data/permissions";
import DashboardPage from "./pages/DashboardPage";
import LoginPage from "./pages/LoginPage";
import TicketsPage from "./pages/TicketsPage";
import UsersPage from "./pages/UsersPage";
import AssetsPage from "./pages/AssetsPage";
import InventoryPage from "./pages/InventoryPage";
import BrandsModelsPage from "./pages/BrandsModelsPage";
import ProjectsPage from "./pages/ProjectsPage";
import ApiConfigPage from "./pages/ApiConfigPage";
import ProfilePage from "./pages/ProfilePage";
import KnowledgePage from "./pages/KnowledgePage";
import HelpdeskOperationsPage from "./pages/HelpdeskOperationsPage";
import TechniciansPage from "./pages/TechniciansPage";

function App() {
  const { isAuthenticated, user } = useAuth();
  const homePath = getUserHomePath(user);

  return (
    <Routes>
      <Route
        element={isAuthenticated ? <Navigate replace to={homePath} /> : <LoginPage />}
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
        <Route element={<Navigate replace to={homePath} />} index />
        <Route element={<ProfilePage />} path="profile" />
        <Route element={<ProtectedRoute requiredPermissions={["dashboard_view"]}><DashboardPage /></ProtectedRoute>} path="dashboard" />
        <Route element={<ProtectedRoute requiredPermissions={["helpdesk_indicators_view", "sla_alerts_view", "tickets_admin"]}><HelpdeskOperationsPage /></ProtectedRoute>} path="helpdesk-operations" />
        <Route element={<ProtectedRoute requiredPermissions={["technicians_performance_view", "technicians_workload_view", "tickets_admin"]}><TechniciansPage /></ProtectedRoute>} path="helpdesk-technicians" />
        <Route element={<ProtectedRoute requiredPermissions={["tickets_view_own", "tickets_view_all", "tickets_admin"]}><TicketsPage /></ProtectedRoute>} path="tickets" />
        <Route element={<ProtectedRoute requiredPermissions={["assets_view", "assets_admin"]}><AssetsPage /></ProtectedRoute>} path="assets" />
        <Route element={<ProtectedRoute requiredPermissions={["inventory_view", "inventory_admin"]}><InventoryPage /></ProtectedRoute>} path="inventory" />
        <Route element={<ProtectedRoute requiredPermissions={["brands_models_view", "brands_models_admin"]}><BrandsModelsPage /></ProtectedRoute>} path="brands-models" />
        <Route element={<ProtectedRoute requiredPermissions={["projects_view", "projects_admin"]}><ProjectsPage /></ProtectedRoute>} path="projects" />
        <Route element={<ProtectedRoute requiredPermissions={["knowledge_view", "knowledge_admin"]}><KnowledgePage /></ProtectedRoute>} path="knowledge" />
        <Route element={<ProtectedRoute requiredPermissions={["api_rest_view", "api_rest_admin"]}><ApiConfigPage /></ProtectedRoute>} path="api-rest" />
        <Route element={<ProtectedRoute requiredPermissions={["users_view", "users_admin"]}><UsersPage /></ProtectedRoute>} path="users" />
      </Route>
      <Route
        element={<Navigate replace to={isAuthenticated ? homePath : "/login"} />}
        path="*"
      />
    </Routes>
  );
}

export default App;
