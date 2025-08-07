import { useState, useEffect } from "react";
import { Outlet, useNavigate } from "react-router-dom";
import { signOut, onAuthStateChanged } from "firebase/auth";
import { auth } from "@/firebase/firebase";
import { Layout, Menu, Avatar, Dropdown, type MenuProps } from "antd";
import { UserOutlined, LogoutOutlined, EditOutlined } from "@ant-design/icons";
import UserProfile from "@/components/UserProfile";
import { useSelector, useDispatch } from "react-redux";
import { fetchUser, clearUser } from "@/store/userSlice";
import type { RootState, AppDispatch } from "@/store";
import { toast } from "react-toastify";

const { Header, Content } = Layout;

function MainLayout() {
  const [modalOpen, setModalOpen] = useState(false);
  const navigate = useNavigate();
  const dispatch = useDispatch<AppDispatch>();
  const { userProfile: user } = useSelector((state: RootState) => state.user);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (authUser) => {
      if (authUser) {
        dispatch(fetchUser(authUser.uid));
      } else {
        dispatch(clearUser());
      }
    });
    return () => unsubscribe();
  }, [dispatch]);

  const handleLogout = async () => {
    try {
      await signOut(auth);
      toast.success("Đăng xuất thành công!");
      navigate("/login");
    } catch (err: unknown) {
      toast.error(
        "Lỗi đăng xuất: " +
          (err instanceof Error ? err.message : "Unknown error")
      );
    }
  };

  // Định nghĩa menu cho Dropdown theo chuẩn mới
  const dropdownMenu: MenuProps = {
    items: [
      {
        key: "profile",
        icon: <EditOutlined />,
        label: "Hồ sơ",
        onClick: () => setModalOpen(true),
      },
      {
        key: "logout",
        icon: <LogoutOutlined />,
        label: "Đăng xuất",
        onClick: handleLogout,
      },
    ],
  };

  return (
    <Layout style={{ minHeight: "100vh" }}>
      <Header className="!bg-blue-600 !px-0">
        <div className="container mx-auto flex justify-between items-center h-full">
          <div
            className="text-white text-xl font-bold cursor-pointer"
            onClick={() => navigate("/classes")}
          >
            ClassMate
          </div>
          <Menu
            mode="horizontal"
            theme="dark"
            selectable={false}
            className="!bg-transparent flex-1 justify-end items-center"
            items={[
              {
                key: "schedule",
                label: (
                  <span onClick={() => navigate("/schedule")}>Lịch học</span>
                ),
                className: "hidden sm:inline-block",
              },
              {
                key: "user",
                label: (
                  <Dropdown menu={dropdownMenu} trigger={["click"]}>
                    <span className="flex items-center gap-2 cursor-pointer">
                      <Avatar
                        src={user.avatar}
                        icon={<UserOutlined />}
                        size="large"
                      />
                      <span className="hidden sm:inline">{user.name}</span>
                    </span>
                  </Dropdown>
                ),
              },
            ]}
          />
        </div>
      </Header>
      <Content className="container mx-auto p-4 w-full">
        <Outlet />
      </Content>

      {/* Profile Modal */}
      <UserProfile
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        user={user}
      />
    </Layout>
  );
}

export default MainLayout;
