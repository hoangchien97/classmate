
import { Outlet } from "react-router-dom";
import { Layout } from "antd";

const { Content } = Layout;

// You can replace this with your own student-friendly image URL
const studentBg =
  'https://images.unsplash.com/photo-1513258496099-48168024aec0?auto=format&fit=crop&w=1500&q=80';

function AuthLayout() {
  return (
    <Layout
      className="auth-layout-container"
      style={{
        minHeight: '100vh',
        background: `linear-gradient(rgba(0,0,0,0.25), rgba(0,0,0,0.25)), url(${studentBg}) center center/cover no-repeat fixed`,
        overflow: 'auto',
      }}
    >
      <Content className="flex items-center justify-center min-h-full p-2 sm:p-4 custom-scrollbar w-full" style={{ background: 'rgba(255,255,255,0.5)' }}>
        <div className="container mx-auto flex items-center justify-center">
          <div className="w-full flex items-center justify-center">
            <Outlet />
          </div>
        </div>
      </Content>
    </Layout>
  );
}

export default AuthLayout;
