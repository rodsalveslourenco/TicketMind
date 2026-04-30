import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./auth/AuthContext";
import AppLayout from "./components/AppLayout";
import ProtectedRoute from "./components/ProtectedRoute";
import { useAppData } from "./data/AppDataContext";
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
import DepartmentsPage from "./pages/DepartmentsPage";
import LocationsPage from "./pages/LocationsPage";
import NotificationsPage from "./pages/NotificationsPage";
import EmailLayoutsPage from "./pages/EmailLayoutsPage";

function App() {
  const { isAuthenticated, user } = useAuth();
  const { navigationSections, permissionCatalog } = useAppData();
  const homePath = getUserHomePath(user, navigationSections, permissionCatalog);

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
        <Route element={<ProtectedRoute moduleKey="dashboard"><DashboardPage /></ProtectedRoute>} path="dashboard" />
        <Route element={<ProtectedRoute moduleKey="helpdesk_operations"><HelpdeskOperationsPage /></ProtectedRoute>} path="helpdesk-operations" />
        <Route element={<ProtectedRoute moduleKey="helpdesk_technicians"><TechniciansPage /></ProtectedRoute>} path="helpdesk-technicians" />
        <Route element={<ProtectedRoute moduleKey="tickets"><TicketsPage /></ProtectedRoute>} path="tickets" />
        <Route element={<ProtectedRoute moduleKey="assets"><AssetsPage /></ProtectedRoute>} path="assets" />
        <Route element={<ProtectedRoute moduleKey="assets"><LocationsPage /></ProtectedRoute>} path="locations" />
        <Route element={<ProtectedRoute moduleKey="inventory"><InventoryPage /></ProtectedRoute>} path="inventory" />
        <Route element={<ProtectedRoute moduleKey="brands_models"><BrandsModelsPage /></ProtectedRoute>} path="brands-models" />
        <Route element={<ProtectedRoute moduleKey="projects"><ProjectsPage /></ProtectedRoute>} path="projects" />
        <Route element={<ProtectedRoute moduleKey="knowledge"><KnowledgePage /></ProtectedRoute>} path="knowledge" />
        <Route element={<ProtectedRoute moduleKey="api_rest"><ApiConfigPage /></ProtectedRoute>} path="api-rest" />
        <Route element={<ProtectedRoute moduleKey="users"><UsersPage /></ProtectedRoute>} path="users" />
        <Route element={<ProtectedRoute moduleKey="users"><DepartmentsPage /></ProtectedRoute>} path="departments" />
        <Route element={<ProtectedRoute moduleKey="notifications"><NotificationsPage /></ProtectedRoute>} path="notifications" />
        <Route element={<ProtectedRoute moduleKey="email_layouts"><EmailLayoutsPage /></ProtectedRoute>} path="email-layouts" />
      </Route>
      <Route
        element={<Navigate replace to={isAuthenticated ? homePath : "/login"} />}
        path="*"
      />
    </Routes>
  );
}

export default App;
