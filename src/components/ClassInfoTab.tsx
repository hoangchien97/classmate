import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { doc, getDoc, updateDoc, deleteDoc, collection, query, where, getDocs } from "firebase/firestore";
import { db } from "@/firebase/firebase";
import { Button, Descriptions, Space, Popconfirm, message } from "antd";
import { EditOutlined, DeleteOutlined } from "@ant-design/icons";
import ClassFormModal from "@/components/ClassFormModal";

interface ClassData {
  id: string;
  name: string;
  description?: string;
  teacherId: string;
  createdAt?: { seconds: number };
  studentIds?: string[];
}

interface ClassInfoTabProps {
  classId: string;
  userRole: string;
  userId: string;
  initialClassData?: ClassData;
  onClassDataChange?: (classData: ClassData) => void;
  onShowMessage?: (type: 'success' | 'error', message: string) => void;
}

function ClassInfoTab({ classId, userRole, userId, initialClassData, onClassDataChange, onShowMessage }: ClassInfoTabProps) {
  const navigate = useNavigate();
  const [classData, setClassData] = useState<ClassData | null>(initialClassData || null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [loading, setLoading] = useState(!initialClassData);
  const [scheduleCount, setScheduleCount] = useState(0);

  const fetchClassData = async () => {
    try {
      setLoading(true);
      const classDoc = await getDoc(doc(db, "classes", classId));
      if (classDoc.exists()) {
        const data = { id: classDoc.id, ...classDoc.data() } as ClassData;
        setClassData(data);
        onClassDataChange?.(data);
      } else {
        message.error("Không tìm thấy lớp học này");
        navigate("/classes");
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : "Lỗi không xác định";
      message.error(`Lỗi khi tải thông tin lớp học: ${errorMessage}`);
    } finally {
      setLoading(false);
    }
  };

  const fetchScheduleCount = async () => {
    try {
      const schedulesQuery = query(
        collection(db, "schedules"),
        where("classId", "==", classId)
      );
      const schedulesSnapshot = await getDocs(schedulesQuery);
      setScheduleCount(schedulesSnapshot.docs.length);
    } catch (error: unknown) {
      console.error("Error fetching schedule count:", error);
    }
  };

  useEffect(() => {
    if (!initialClassData) {
      fetchClassData();
    }
    fetchScheduleCount();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classId, initialClassData]);

  const handleUpdateClass = async (updateData: { name: string; description: string }) => {
    try {
      await updateDoc(doc(db, "classes", classId), {
        name: updateData.name,
        description: updateData.description || "",
      });
      
      const updatedClassData = { 
        ...classData!, 
        name: updateData.name, 
        description: updateData.description || "" 
      };
      setClassData(updatedClassData);
      onClassDataChange?.(updatedClassData);
      setShowEditModal(false);
      onShowMessage?.('success', "Cập nhật lớp học thành công!");
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : "Lỗi không xác định";
      onShowMessage?.('error', `Lỗi khi cập nhật lớp học: ${errorMessage}`);
    }
  };

  const handleDeleteClass = async () => {
    try {
      // Hiển thị loading state
      message.loading("Đang xóa lớp học và dữ liệu liên quan...", 0);

      // 1. Xóa tất cả các lịch học của lớp này
      const schedulesQuery = query(
        collection(db, "schedules"),
        where("classId", "==", classId)
      );
      const schedulesSnapshot = await getDocs(schedulesQuery);
      const deleteSchedulePromises = schedulesSnapshot.docs.map((doc) =>
        deleteDoc(doc.ref)
      );

      if (deleteSchedulePromises.length > 0) {
        await Promise.all(deleteSchedulePromises);
      }

      // 2. Xóa lớp học
      await deleteDoc(doc(db, "classes", classId));

      // Đóng loading message
      message.destroy();

      // Hiển thị success message với thông tin chi tiết
      const successMessage = scheduleCount > 0 
        ? `Đã xóa lớp học và ${scheduleCount} lịch học liên quan thành công!`
        : "Đã xóa lớp học thành công!";
      
      onShowMessage?.('success', successMessage);
      navigate("/classes");
    } catch (error: unknown) {
      // Đóng loading message nếu có lỗi
      message.destroy();
      console.error("Error deleting class and schedules:", error);
      const errorMessage = error instanceof Error ? error.message : "Lỗi không xác định";
      onShowMessage?.('error', `Lỗi khi xóa lớp học: ${errorMessage}`);
    }
  };

  if (loading || !classData) {
    return <div>Đang tải thông tin lớp học...</div>;
  }

  return (
    <div>
      
      {/* Header Actions */}
      {userRole === "teacher" && classData.teacherId === userId && (
        <div className="mb-6 flex justify-end">
          <Space>
            <Button
              icon={<EditOutlined />}
              onClick={() => setShowEditModal(true)}
            >
              Chỉnh sửa
            </Button>
            <Popconfirm
              title="Xóa lớp học và tất cả dữ liệu liên quan?"
              description={
                <div>
                  <p>Hành động này sẽ xóa:</p>
                  <ul className="ml-4 mt-2">
                    <li>• Lớp học "{classData.name}"</li>
                    <li>• Tất cả {scheduleCount} lịch học của lớp</li>
                    <li>• Dữ liệu không thể khôi phục</li>
                  </ul>
                  <p className="mt-2 font-medium text-red-600">Bạn có chắc chắn muốn tiếp tục?</p>
                </div>
              }
              onConfirm={handleDeleteClass}
              okText="Có, xóa tất cả"
              cancelText="Hủy"
              okType="danger"
              placement="bottomRight"
            >
              <Button danger icon={<DeleteOutlined />}>
                Xóa lớp
              </Button>
            </Popconfirm>
          </Space>
        </div>
      )}

      {/* Class Information */}
      <Descriptions bordered column={1} className="mt-4">
        <Descriptions.Item label="Tên lớp học">{classData.name}</Descriptions.Item>
        <Descriptions.Item label="Mô tả">{classData.description || "Không có mô tả"}</Descriptions.Item>
        <Descriptions.Item label="Ngày tạo">
          {classData.createdAt
            ? new Date(classData.createdAt.seconds * 1000).toLocaleDateString()
            : "N/A"}
        </Descriptions.Item>
        <Descriptions.Item label="Số học sinh">
          {classData.studentIds?.length || 0} học sinh
        </Descriptions.Item>
        <Descriptions.Item label="Số lịch học">
          {scheduleCount} lịch học
        </Descriptions.Item>
      </Descriptions>

      {/* Edit Modal */}
      <ClassFormModal
        visible={showEditModal}
        onClose={() => setShowEditModal(false)}
        onSave={handleUpdateClass}
        initialValues={{ name: classData.name, description: classData.description || "" }}
        title="Chỉnh sửa lớp học"
      />
    </div>
  );
}

export default ClassInfoTab;
