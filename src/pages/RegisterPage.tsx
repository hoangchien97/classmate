
import { useNavigate, Link } from "react-router-dom";
import { useState } from "react";
import { createUserWithEmailAndPassword, fetchSignInMethodsForEmail, sendEmailVerification, signOut } from "firebase/auth";
import { doc, setDoc, query, collection, where, getDocs } from "firebase/firestore";
import { parsePhoneNumber } from "libphonenumber-js";
import { auth, db } from "@/firebase/firebase";
import { Form, Input, Button, Select, Typography } from "antd";
import { toast } from "react-toastify";


function RegisterPage() {
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const checkEmailExists = async (email: string) => {
    const methods = await fetchSignInMethodsForEmail(auth, email);
    return methods.length > 0;
  };

  const checkPhoneNumberExists = async (phone: string) => {
    const q = query(collection(db, "users"), where("phoneNumber", "==", phone));
    const querySnapshot = await getDocs(q);
    return !querySnapshot.empty;
  };

  const handleRegister = async (values: any) => {
    setLoading(true);
    try {
      // Kiểm tra email trùng
      if (await checkEmailExists(values.email)) {
        toast.error("Email đã được sử dụng.");
        setLoading(false);
        return;
      }

      // Chuẩn hóa và kiểm tra số điện thoại
      let formattedPhone = "";
      if (values.phoneNumber) {
        const phone = parsePhoneNumber(values.phoneNumber, "VN");
        if (!phone.isValid()) {
          toast.error("Số điện thoại không hợp lệ.");
          setLoading(false);
          return;
        }
        formattedPhone = phone.format("E.164");
        if (await checkPhoneNumberExists(formattedPhone)) {
          toast.error("Số điện thoại đã được sử dụng.");
          setLoading(false);
          return;
        }
      }

      // Tạo tài khoản Firebase Auth
      const userCredential = await createUserWithEmailAndPassword(
        auth,
        values.email,
        values.password
      );
      const user = userCredential.user;

      // Gửi email xác nhận
      await sendEmailVerification(user);

      // Lưu thông tin vào Firestore trước khi đăng xuất
      await setDoc(doc(db, "users", user.uid), {
        userId: user.uid,
        email: user.email,
        phoneNumber: formattedPhone,
        name: values.name,
        role: values.role,
        avatar: "",
        fcmToken: "",
        providers: ["email"],
      });

      // Đăng xuất sau khi lưu document
      await signOut(auth);

      toast.success("Đăng ký thành công! Vui lòng kiểm tra email để xác nhận tài khoản.");
      setTimeout(() => navigate("/login"), 3000);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-[70vh] w-full">
      <div
        className="w-full max-w-md p-6 rounded-2xl shadow-2xl border border-blue-100/60 backdrop-blur-md"
        style={{
          background: 'rgba(255,255,255,0.75)',
          boxShadow: '0 8px 32px 0 rgba(31, 38, 135, 0.18), 0 1.5px 8px 0 rgba(59,130,246,0.10)',
          border: '1.5px solid #e0e7ef',
        }}
      >
        <h2 className="text-2xl font-bold text-blue-500 mb-6 text-center">Đăng ký</h2>
        <Form
          layout="vertical"
          onFinish={handleRegister}
          className="mt-6"
          autoComplete="off"
        >
          <Form.Item
            label="Họ và tên"
            name="name"
            rules={[{ required: true, message: "Vui lòng nhập họ và tên!" }]}
          >
            <Input placeholder="Nhập họ và tên" size="large" />
          </Form.Item>
          <Form.Item
            label="Email"
            name="email"
            rules={[
              { required: true, message: "Vui lòng nhập email!" },
              { type: "email", message: "Email không hợp lệ!" },
            ]}
          >
            <Input placeholder="Nhập email" size="large" />
          </Form.Item>
          <Form.Item
            label="Số điện thoại (tùy chọn)"
            name="phoneNumber"
            rules={[]}
          >
            <Input placeholder="VD: 0912345678" size="large" />
          </Form.Item>
          <Form.Item
            label="Mật khẩu"
            name="password"
            rules={[
              { required: true, message: "Vui lòng nhập mật khẩu!" },
              { min: 6, message: "Mật khẩu phải có ít nhất 6 ký tự!" },
            ]}
          >
            <Input.Password placeholder="Nhập mật khẩu" size="large" />
          </Form.Item>
          <Form.Item
            label="Vai trò"
            name="role"
            initialValue="student"
            rules={[{ required: true, message: "Vui lòng chọn vai trò!" }]}
          >
            <Select size="large">
              <Select.Option value="student">Học sinh</Select.Option>
              <Select.Option value="teacher">Giáo viên</Select.Option>
            </Select>
          </Form.Item>
          <Form.Item>
            <Button
              type="primary"
              htmlType="submit"
              className="w-full"
              size="large"
              loading={loading}
            >
              Đăng ký
            </Button>
          </Form.Item>
        </Form>
        <p className="mt-4 text-sm text-center">
          Đã có tài khoản?{' '}
          <Link to="/login" className="text-blue-500 hover:underline">
            Đăng nhập
          </Link>
        </p>
      </div>
    </div>
  );
}

export default RegisterPage;
