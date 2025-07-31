import { Outlet, useNavigate } from "react-router-dom";
import { signOut } from "firebase/auth";
import { auth } from "@/firebase/firebase";

function MainLayout() {
  const navigate = useNavigate();

  const handleLogout = async () => {
    try {
      await signOut(auth);
      navigate("/login");
    } catch (err: any) {
      console.error("Lỗi đăng xuất:", err.message);
    }
  };

  return (
    <div className="min-h-screen bg-gray-100">
      <header className="bg-blue-500 text-white p-4">
        <div className="container mx-auto flex justify-between items-center">
          <h1 className="text-xl font-bold">ClassMate</h1>
          <nav className="flex items-center space-x-4">
            <a href="/checkin" className="text-white hover:underline">
              Check-in
            </a>
            <button
              onClick={handleLogout}
              className="text-white hover:underline focus:outline-none"
            >
              Đăng xuất
            </button>
          </nav>
        </div>
      </header>
      <main className="container mx-auto p-4">
        <Outlet />
      </main>
    </div>
  );
}

export default MainLayout;
