import { useEffect, useState, type JSX } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "@/firebase/firebase.ts";

interface ProtectedRouteProps {
  children: JSX.Element;
  requireAuth: boolean;
}

function ProtectedRoute({ children, requireAuth }: ProtectedRouteProps) {
  const [loading, setLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setIsAuthenticated(!!user);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        Đang tải...
      </div>
    );
  }

  if (requireAuth && !isAuthenticated) {
    navigate("/login", { state: { from: location.pathname } });
    return null;
  }

  if (!requireAuth && isAuthenticated) {
    navigate("/checkin");
    return null;
  }

  return children;
}

export default ProtectedRoute;
