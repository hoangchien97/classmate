import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  createUserWithEmailAndPassword,
  fetchSignInMethodsForEmail,
  sendEmailVerification,
  signOut,
} from "firebase/auth";
import {
  doc,
  setDoc,
  query,
  collection,
  where,
  getDocs,
} from "firebase/firestore";
import { parsePhoneNumber } from "libphonenumber-js";
import { auth, db } from "@/firebase/firebase";

function RegisterPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [role, setRole] = useState("student");
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const navigate = useNavigate();

  const checkEmailExists = async (email: string) => {
    try {
      const methods = await fetchSignInMethodsForEmail(auth, email);
      return methods.length > 0;
    } catch (err) {
      throw new Error("Lỗi kiểm tra email: " + err.message);
    }
  };

  const checkPhoneNumberExists = async (phone: string) => {
    try {
      const q = query(
        collection(db, "users"),
        where("phoneNumber", "==", phone)
      );
      const querySnapshot = await getDocs(q);
      return !querySnapshot.empty;
    } catch (err) {
      throw new Error("Lỗi kiểm tra số điện thoại: " + err.message);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccessMessage("");

    try {
      // Kiểm tra email trùng
      if (await checkEmailExists(email)) {
        throw new Error("Email đã được sử dụng.");
      }

      // Chuẩn hóa và kiểm tra số điện thoại
      let formattedPhone = "";
      if (phoneNumber) {
        const phone = parsePhoneNumber(phoneNumber, "VN");
        if (!phone.isValid()) {
          throw new Error("Số điện thoại không hợp lệ.");
        }
        formattedPhone = phone.format("E.164");
        if (await checkPhoneNumberExists(formattedPhone)) {
          throw new Error("Số điện thoại đã được sử dụng.");
        }
      }

      // Tạo tài khoản Firebase Auth
      const userCredential = await createUserWithEmailAndPassword(
        auth,
        email,
        password
      );
      const user = userCredential.user;

      // Gửi email xác nhận
      await sendEmailVerification(user);

      // Lưu thông tin vào Firestore trước khi đăng xuất
      await setDoc(doc(db, "users", user.uid), {
        userId: user.uid,
        email: user.email,
        phoneNumber: formattedPhone,
        name,
        role,
        avatar: "",
        fcmToken: "",
        providers: ["email"],
      });

      // Đăng xuất sau khi lưu document
      await signOut(auth);

      setSuccessMessage(
        "Đăng ký thành công! Vui lòng kiểm tra email để xác nhận tài khoản."
      );
      setTimeout(() => navigate("/login"), 3000); // Chuyển hướng sau 3 giây
    } catch (err: any) {
      setError(err.message);
    }
  };

  return (
    <div>
      <h2 className="text-2xl font-bold text-center text-blue-500">Đăng ký</h2>
      {error && <p className="mt-4 text-red-500">{error}</p>}
      {successMessage && (
        <p className="mt-4 text-green-500">{successMessage}</p>
      )}
      <form onSubmit={handleRegister} className="mt-6 space-y-4">
        <div>
          <label
            htmlFor="name"
            className="block text-sm font-medium text-gray-700"
          >
            Họ và tên
          </label>
          <input
            id="name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full px-3 py-2 mt-1 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            required
          />
        </div>
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
            htmlFor="phoneNumber"
            className="block text-sm font-medium text-gray-700"
          >
            Số điện thoại (tùy chọn)
          </label>
          <input
            id="phoneNumber"
            type="tel"
            value={phoneNumber}
            onChange={(e) => setPhoneNumber(e.target.value)}
            className="w-full px-3 py-2 mt-1 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="VD: 0912345678"
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
        <div>
          <label className="block text-sm font-medium text-gray-700">
            Vai trò
          </label>
          <select
            value={role}
            onChange={(e) => setRole(e.target.value)}
            className="w-full px-3 py-2 mt-1 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="student">Học sinh</option>
            <option value="teacher">Giáo viên</option>
          </select>
        </div>
        <button
          type="submit"
          className="w-full py-2 mt-4 text-white bg-blue-500 rounded-md hover:bg-blue-600"
        >
          Đăng ký
        </button>
      </form>
      <p className="mt-4 text-sm text-center">
        Đã có tài khoản?{" "}
        <a href="/login" className="text-blue-500 hover:underline">
          Đăng nhập
        </a>
      </p>
    </div>
  );
}

export default RegisterPage;
