import { Button, Modal, Form, Input } from "antd";
import { useEffect } from "react";

interface ClassFormProps {
  visible: boolean;
  onClose: () => void;
  onSave: (classData: { name: string; description: string }) => void;
  initialValues?: {
    name: string;
    description: string;
  };
  title: string;
}

const ClassFormModal = ({
  visible,
  onClose,
  onSave,
  initialValues,
  title,
}: ClassFormProps) => {
  const [form] = Form.useForm();

  // Reset form when modal is opened/closed
  useEffect(() => {
    if (visible) {
      form.setFieldsValue(initialValues || { name: "", description: "" });
    }
  }, [visible, initialValues, form]);

  const handleFinish = (values: any) => {
    onSave(values);
  };

  return (
    <Modal
      title={title}
      open={visible}
      onCancel={onClose}
      footer={null}
      width={500}
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
          <Input placeholder="Nhập tên lớp học" />
        </Form.Item>

        <Form.Item name="description" label="Mô tả">
          <Input.TextArea rows={4} placeholder="Nhập mô tả lớp học" />
        </Form.Item>

        <div className="flex justify-end space-x-2 mt-4">
          <Button onClick={onClose}>Hủy</Button>
          <Button type="primary" htmlType="submit">
            Lưu lớp học
          </Button>
        </div>
      </Form>
    </Modal>
  );
};

export default ClassFormModal;
