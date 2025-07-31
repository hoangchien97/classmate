import { Outlet } from "react-router-dom";

function AuthLayout() {
  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-100">
      <div className="w-full max-w-md p-8 bg-white rounded-lg shadow-md">
        <h1 className="text-3xl font-bold text-center text-blue-500 mb-6">
          ClassMate
        </h1>
        <Outlet />
      </div>
    </div>
  );
}

export default AuthLayout;
