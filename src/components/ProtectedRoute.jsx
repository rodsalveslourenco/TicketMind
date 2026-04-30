import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { useAppData } from "../data/AppDataContext";
import { canAccessModule, getUserHomePath, hasAnyPermission } from "../data/permissions";

function ProtectedRoute({ children, requiredPermissions = [], moduleKey = "" }) {
  const { loading, isAuthenticated, user } = useAuth();
  const { navigationSections, permissionCatalog } = useAppData();
  const location = useLocation();

  if (loading) {
    return <div className="screen-center">Carregando sessão...</div>;
  }

  if (!isAuthenticated) {
    return <Navigate replace state={{ from: location }} to="/login" />;
  }

  if (moduleKey && !canAccessModule(user, moduleKey, permissionCatalog)) {
    return <Navigate replace to={getUserHomePath(user, navigationSections, permissionCatalog)} />;
  }

  if (requiredPermissions.length && !hasAnyPermission(user, requiredPermissions)) {
    return <Navigate replace to={getUserHomePath(user, navigationSections, permissionCatalog)} />;
  }

  return children;
}

export default ProtectedRoute;
