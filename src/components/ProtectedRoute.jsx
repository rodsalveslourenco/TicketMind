import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { getUserHomePath, hasAnyPermission } from "../data/permissions";

function ProtectedRoute({ children, requiredPermissions = [] }) {
  const { loading, isAuthenticated, user } = useAuth();
  const location = useLocation();

  if (loading) {
    return <div className="screen-center">Carregando sessão...</div>;
  }

  if (!isAuthenticated) {
    return <Navigate replace state={{ from: location }} to="/login" />;
  }

  if (requiredPermissions.length && !hasAnyPermission(user, requiredPermissions)) {
    return <Navigate replace to={getUserHomePath(user)} />;
  }

  return children;
}

export default ProtectedRoute;
