import { useEffect, useState, type JSX } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "@/firebase/firebase";

interface ProtectedRouteProps {
  children: JSX.Element;
  requireAuth: boolean;
}

function ProtectedRoute({ children, requireAuth }: ProtectedRouteProps) {
  const [loading, setLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isEmailVerified, setIsEmailVerified] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setIsAuthenticated(!!user);
      setIsEmailVerified(user ? user.emailVerified : false);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!loading) {
      if (requireAuth && (!isAuthenticated || !isEmailVerified)) {
        navigate("/login", { state: { from: location.pathname } });
      } else if (!requireAuth && isAuthenticated && isEmailVerified) {
        navigate("/classes"); // Thay đổi từ /checkin sang /classes
      }
    }
  }, [
    loading,
    isAuthenticated,
    isEmailVerified,
    requireAuth,
    navigate,
    location.pathname,
  ]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        Đang tải...
      </div>
    );
  }

  return children;
}

export default ProtectedRoute;
