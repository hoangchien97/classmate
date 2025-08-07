import { useRoutes, Navigate } from "react-router-dom";
import AuthLayout from "../layouts/AuthLayout";
import MainLayout from "../layouts/MainLayout";
import LoginPage from "../pages/LoginPage";
import RegisterPage from "../pages/RegisterPage";
import ProtectedRoute from "../components/ProtectedRoute";
import ProfilePage from "@/pages/ProfilePage";
import SchedulePage from "@/pages/SchedulePage";
import ClassesPage from "@/pages/ClassesPage";
import ClassDetailPage from "@/pages/ClassDetailPage"; // Add this import

function Routes() {
  return useRoutes([
    {
      element: (
        <ProtectedRoute requireAuth={false}>
          <AuthLayout />
        </ProtectedRoute>
      ),
      children: [
        { path: "login", element: <LoginPage /> },
        { path: "register", element: <RegisterPage /> },
      ],
    },
    {
      element: (
        <ProtectedRoute requireAuth={true}>
          <MainLayout />
        </ProtectedRoute>
      ),
      children: [
        { path: "classes", element: <ClassesPage /> },
        { path: "classes/:classId", element: <ClassDetailPage /> }, // Add this route
        { path: "schedule", element: <SchedulePage /> },
        { path: "profile", element: <ProfilePage /> },
        { path: "/", element: <Navigate to="/classes" replace /> },
      ],
    },
  ]);
}

export default Routes;
