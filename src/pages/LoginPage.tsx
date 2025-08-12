
import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { signInWithEmailAndPassword, sendPasswordResetEmail } from "firebase/auth";
import { auth } from "@/firebase/firebase";
import { Form, Input, Button, Typography } from "antd";
import { toast } from "react-toastify";


function LoginPage() {
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleLogin = async (values: { email: string; password: string }) => {
    setLoading(true);
    try {
      const userCredential = await signInWithEmailAndPassword(auth, values.email, values.password);
      const user = userCredential.user;
      if (!user.emailVerified) {
        toast.error("Vui lòng xác nhận email trước khi đăng nhập.");
        await auth.signOut();
        setLoading(false);
        return;
      }
      toast.success("Đăng nhập thành công!");
      navigate("/classes");
    } catch (err: any) {
      if (err.code === "auth/invalid-credential") {
        toast.error("Email hoặc mật khẩu không đúng. Vui lòng kiểm tra lại.");
      } else if (err.code === "auth/user-disabled") {
        toast.error("Tài khoản đã bị vô hiệu hóa. Liên hệ quản trị viên.");
      } else {
        toast.error("Lỗi đăng nhập: " + err.message);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async (email: string) => {
    if (!email) {
      toast.error("Vui lòng nhập email để khôi phục mật khẩu.");
      return;
    }
    try {
      await sendPasswordResetEmail(auth, email);
      toast.success("Email khôi phục mật khẩu đã được gửi!");
    } catch (err: any) {
      toast.error("Lỗi gửi email khôi phục: " + err.message);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-[70vh] w-full">
      <div
        className="w-full max-w-md p-6 rounded-2xl shadow-2xl border border-blue-100/60 backdrop-blur-md"
        style={{
          background: 'rgba(255,255,255,0.95)',
          boxShadow: '0 8px 32px 0 rgba(31, 38, 135, 0.18), 0 1.5px 8px 0 rgba(59,130,246,0.10)',
          border: '1.5px solid #e0e7ef',
        }}
      >
        <h2 className="text-2xl font-bold text-blue-500 mb-6 text-center">Đăng nhập</h2>
        <Form
          layout="vertical"
          onFinish={handleLogin}
          className="mt-6"
          autoComplete="off"
        >
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
            label="Mật khẩu"
            name="password"
            rules={[
              { required: true, message: "Vui lòng nhập mật khẩu!" },
              { min: 6, message: "Mật khẩu phải có ít nhất 6 ký tự!" },
            ]}
          >
            <Input.Password placeholder="Nhập mật khẩu" size="large" />
          </Form.Item>
          <Form.Item>
            <Button
              type="primary"
              htmlType="submit"
              className="w-full"
              size="large"
              loading={loading}
            >
              Đăng nhập
            </Button>
          </Form.Item>
          <Form.Item shouldUpdate className="mb-2 text-center">
            {({ getFieldValue }) => (
              <Button
                type="link"
                className="text-blue-500 p-0"
                onClick={() => handleResetPassword(getFieldValue("email"))}
                disabled={!getFieldValue("email")}
              >
                Quên mật khẩu?
              </Button>
            )}
          </Form.Item>
        </Form>
        <p className="mt-2 text-sm text-center">
          Chưa có tài khoản?{' '}
          <Link to="/register" className="text-blue-500 hover:underline">
            Đăng ký
          </Link>
        </p>
      </div>
    </div>
  );
}

export default LoginPage;
