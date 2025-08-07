import { useRef, useEffect } from "react";
import { Modal, Button, Form, Input, Avatar, Tag, Tooltip } from "antd";
import { UserOutlined, EditOutlined, CameraOutlined } from "@ant-design/icons";
import { useDispatch } from "react-redux";
import { updateUserProfile } from "@/store/userSlice";
import type { AppDispatch } from "@/store";
import { toast } from "react-toastify";
import type { IUser } from "@/assets/interfaces/user";

interface UserProfileProps {
  open: boolean;
  onClose: () => void;
  user: IUser & { updateStatus?: string };
}

type FormValues = Omit<IUser, "id">;

const ROLE_LABEL: Record<string, string> = {
  student: "Học viên",
  teacher: "Giáo viên",
};

const ROLE_COLOR: Record<string, string> = {
  student: "blue",
  teacher: "gold",
};

function UserProfile({ open, onClose, user }: UserProfileProps) {
  const [form] = Form.useForm<FormValues>();
  const dispatch = useDispatch<AppDispatch>();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Initialize form when modal opens or user data changes
  useEffect(() => {
    if (open && user.id) {
      form.setFieldsValue({
        name: user.name || "",
        email: user.email || "",
        avatar: user.avatar || "/avatar-default.avif",
        role: user.role,
      });
    }
  }, [open, user, form]);

  // Reset form to original user data
  const resetForm = () => {
    form.setFieldsValue({
      name: user.name || "",
      email: user.email || "",
      avatar: user.avatar || "/avatar-default.avif",
      role: user.role,
    });
  };

  const handleSaveProfile = async () => {
    if (!user.id) return;

    try {
      const values = await form.validateFields();

      await dispatch(
        updateUserProfile({
          userId: user.id,
          name: values.name,
          avatar: values.avatar,
        })
      ).unwrap();

      toast.success("Cập nhật thành công!");
      onClose();
    } catch (error: unknown) {
      console.error("Update profile error:", error);

      if (error && typeof error === "object" && "errorFields" in error) {
        return;
      }

      let errorMessage = "Lưu thất bại!";

      if (typeof error === "string") {
        if (error.includes("Photo URL too long")) {
          errorMessage = "Ảnh đại diện quá lớn! Vui lòng chọn ảnh nhỏ hơn.";
        } else if (error.includes("INVALID_PROFILE_ATTRIBUTE")) {
          errorMessage =
            "Thông tin cá nhân không hợp lệ! Vui lòng kiểm tra lại.";
        }
      }

      toast.error(errorMessage);
    }
  };

  // Xử lý upload avatar khi chọn file
  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 500 * 1024) {
      toast.error("Ảnh phải nhỏ hơn 500KB!");
      e.target.value = ""; // reset input file
      return;
    }

    const reader = new FileReader();
    reader.onload = (ev) => {
      const result = ev.target?.result as string;
      form.setFieldValue("avatar", result);
      e.target.value = ""; // reset input file để lần sau chọn lại cùng file vẫn trigger
    };
    reader.readAsDataURL(file);
  };

  // Khi click vào avatar sẽ trigger chọn file
  const handleAvatarClick = () => {
    fileInputRef.current?.click();
  };

  const handleCancel = () => {
    resetForm();
    onClose();
  };

  // Lấy giá trị avatar từ form, nếu chưa có thì lấy từ user
  const watchedAvatar = Form.useWatch("avatar", form);
  const avatarValue =
    watchedAvatar !== undefined && watchedAvatar !== ""
      ? watchedAvatar
      : user.avatar || "/avatar-default.avif";

  return (
    <Modal
      open={open}
      title="Hồ sơ cá nhân"
      onCancel={handleCancel}
      centered
      destroyOnClose={true}
      footer={[
        <Button key="cancel" onClick={handleCancel}>
          Hủy
        </Button>,
        <Button
          key="save"
          type="primary"
          loading={user.updateStatus === "loading"}
          onClick={handleSaveProfile}
          icon={<EditOutlined />}
        >
          Lưu
        </Button>,
      ]}
    >
      <Form form={form} layout="vertical">
        <div className="flex flex-col gap-2 justify-center items-center">
          <Form.Item name="avatar" style={{ marginBottom: 0 }}>
            <div
              style={{
                position: "relative",
                display: "inline-block",
                cursor: "pointer",
                marginBottom: 8,
              }}
              onClick={handleAvatarClick}
              onMouseEnter={(e) => {
                const overlay = e.currentTarget.querySelector(
                  ".avatar-overlay"
                ) as HTMLElement;
                if (overlay) overlay.style.opacity = "1";
              }}
              onMouseLeave={(e) => {
                const overlay = e.currentTarget.querySelector(
                  ".avatar-overlay"
                ) as HTMLElement;
                if (overlay) overlay.style.opacity = "0";
              }}
            >
              <Tooltip title="Đổi ảnh đại diện">
                <Avatar
                  src={avatarValue}
                  size={96}
                  icon={<UserOutlined />}
                  style={{
                    border: "2px solid #e5e7eb",
                    background: "#fff",
                  }}
                />
              </Tooltip>
              <div
                className="avatar-overlay"
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: 96,
                  height: 96,
                  background: "rgba(0,0,0,0.35)",
                  color: "#fff",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  borderRadius: "50%",
                  opacity: 0,
                  transition: "opacity 0.2s",
                  pointerEvents: "none",
                  fontSize: 32,
                }}
              >
                <CameraOutlined />
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                style={{ display: "none" }}
                onChange={handleAvatarChange}
              />
            </div>
          </Form.Item>

          {user.role && (
            <Tag
              color={ROLE_COLOR[user.role]}
              style={{ fontSize: 14, marginTop: 4 }}
            >
              {ROLE_LABEL[user.role]}
            </Tag>
          )}
        </div>

        <Form.Item
          label="Tên"
          name="name"
          rules={[
            { required: true, message: "Vui lòng nhập tên!" },
            { max: 32, message: "Tên không được quá 32 ký tự!" },
          ]}
        >
          <Input placeholder="Nhập tên của bạn" />
        </Form.Item>

        <Form.Item label="Email" name="email">
          <Input disabled />
        </Form.Item>
      </Form>
    </Modal>
  );
}

export default UserProfile;
