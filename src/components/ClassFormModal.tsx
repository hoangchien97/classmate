import { Button, Modal, Form, Input } from "antd";
import { useEffect, useState } from "react";
import { collection, addDoc } from "firebase/firestore";
import { db } from "@/firebase/firebase";
import { toast } from "react-toastify";

interface ClassFormProps {
  visible: boolean;
  onClose: () => void;
  onCreated: (newClass: any) => void;
  userProfile: { id: string; role: string; name: string };
  initialValues?: {
    name: string;
    description?: string;
  };
  title: string;
}


const ClassFormModal = ({
  visible,
  onClose,
  onCreated,
  userProfile,
  initialValues,
  title,
}: ClassFormProps) => {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);

  // Reset form when modal is opened/closed

  useEffect(() => {
    if (visible) {
      form.setFieldsValue(initialValues || { name: "", description: "" });
      form.resetFields(); // Reset all fields and validation errors
    } else {
      form.resetFields(); // Also reset when closing
    }
  }, [visible, initialValues, form]);

  const handleFinish = async (values: { name: string; description: string }) => {
    if (!values.name) {
      toast.error("Vui lòng nhập tên lớp học");
      return;
    }
    if (!userProfile.id) {
      toast.error("Không tìm thấy thông tin người dùng");
      return;
    }
    setLoading(true);
    try {
      const newClassData = {
        name: values.name,
        description: values.description || "",
        teacherId: userProfile.id,
        studentIds: [],
        joinRequests: [],
        schedule: [],
        createdAt: new Date(),
      };
      const docRef = await addDoc(collection(db, "classes"), newClassData);
      const newClass = { id: docRef.id, ...newClassData };
      toast.success("Lớp học đã được tạo thành công!");
      toast.info("Bạn có thể thêm lịch học cho lớp này trong phần Lịch học");
      form.resetFields();
      onCreated(newClass);
    } catch (err: any) {
      toast.error("Lỗi khi tạo lớp học: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      title={title}
      open={visible}
      onCancel={onClose}
      footer={null}
      width={500}
      centered
    >
      <Form
        form={form}
        layout="vertical"
        onFinish={handleFinish}
        initialValues={initialValues || { name: "", description: "" }}
      >
        <Form.Item
          name="name"
          label="Tên lớp học"
          rules={[{ required: true, message: "Vui lòng nhập tên lớp học" }]}
        >
          <Input placeholder="Nhập tên lớp học" disabled={loading} />
        </Form.Item>

        <Form.Item
          name="description"
          label="Mô tả"
        >
          <Input.TextArea placeholder="Nhập mô tả cho lớp học" rows={3} disabled={loading} />
        </Form.Item>

        <div className="flex justify-end space-x-2 mt-4">
          <Button onClick={onClose} disabled={loading}>Hủy</Button>
          <Button type="primary" htmlType="submit" loading={loading} disabled={loading}>
            Lưu lớp học
          </Button>
        </div>
      </Form>
    </Modal>
  );
};

export default ClassFormModal;