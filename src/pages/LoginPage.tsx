import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
} from "firebase/auth";
import { auth } from "@/firebase/firebase";

function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const navigate = useNavigate();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    // Validate cơ bản
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError("Email không hợp lệ.");
      return;
    }
    if (password.length < 6) {
      setError("Mật khẩu phải có ít nhất 6 ký tự.");
      return;
    }

    try {
      const userCredential = await signInWithEmailAndPassword(
        auth,
        email,
        password
      );
      const user = userCredential.user;

      if (!user.emailVerified) {
        setError("Vui lòng xác nhận email trước khi đăng nhập.");
        await auth.signOut();
        return;
      }

      navigate("/checkin");
    } catch (err: any) {
      if (err.code === "auth/invalid-credential") {
        setError("Email hoặc mật khẩu không đúng. Vui lòng kiểm tra lại.");
      } else if (err.code === "auth/user-disabled") {
        setError("Tài khoản đã bị vô hiệu hóa. Liên hệ quản trị viên.");
      } else {
        setError("Lỗi đăng nhập: " + err.message);
      }
    }
  };

  const handleResetPassword = async () => {
    if (!email) {
      setError("Vui lòng nhập email để khôi phục mật khẩu.");
      return;
    }
    try {
      await sendPasswordResetEmail(auth, email);
      alert("Email khôi phục mật khẩu đã được gửi!");
    } catch (err: any) {
      setError("Lỗi gửi email khôi phục: " + err.message);
    }
  };

  return (
    <div>
      <h2 className="text-2xl font-bold text-center text-blue-500">
        Đăng nhập
      </h2>
      {error && <p className="mt-4 text-red-500">{error}</p>}
      <form onSubmit={handleLogin} className="mt-6 space-y-4">
        <div>
          <label
            htmlFor="email"
            className="block text-sm font-medium text-gray-700"
          >
            Email
          </label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full px-3 py-2 mt-1 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            required
          />
        </div>
        <div>
          <label
            htmlFor="password"
            className="block text-sm font-medium text-gray-700"
          >
            Mật khẩu
          </label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full px-3 py-2 mt-1 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            required
          />
        </div>
        <button
          type="submit"
          className="w-full py-2 mt-4 text-white bg-blue-500 rounded-md hover:bg-blue-600"
        >
          Đăng nhập
        </button>
      </form>
      <div className="mt-4 text-center">
        <button
          onClick={handleResetPassword}
          className="text-sm text-blue-500 hover:underline"
          disabled={!email}
        >
          Quên mật khẩu?
        </button>
        <p className="mt-2 text-sm">
          Chưa có tài khoản?{" "}
          <a href="/register" className="text-blue-500 hover:underline">
            Đăng ký
          </a>
        </p>
      </div>
    </div>
  );
}

export default LoginPage;
