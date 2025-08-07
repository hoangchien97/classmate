/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { collection, addDoc, getDocs, query, where } from "firebase/firestore";
import { db } from "@/firebase/firebase";
import {
  Button,
  Alert,
  Spin,
  Card,
  List,
  Tag,
  Empty,
  Typography,
  Badge,
} from "antd";
import {
  PlusOutlined,
  CalendarOutlined,
  TeamOutlined,
  BookOutlined,
  ArrowRightOutlined,
} from "@ant-design/icons";
import ClassFormModal from "@/components/ClassFormModal";
import { ToastContainer, toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import { useSelector } from "react-redux";
import type { RootState } from "@/store";

const { Title, Text } = Typography;

function ClassesPage() {
  const { userProfile } = useSelector((state: RootState) => state.user);
  const [classes, setClasses] = useState<any[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [scheduleCounts, setScheduleCounts] = useState<Record<string, number>>(
    {}
  );
  const navigate = useNavigate();
  const [showClassModal, setShowClassModal] = useState(false);

  // Lấy số lượng lịch học gốc cho mỗi lớp
  const getScheduleCount = async (classId: string) => {
    try {
      const schedulesQuery = query(
        collection(db, "schedules"),
        where("classId", "==", classId)
      );
      const querySnapshot = await getDocs(schedulesQuery);

      // Lọc chỉ lấy các bản ghi gốc (parentId === id)
      const parentSchedules = querySnapshot.docs
        .map((doc) => ({
          id: doc.id,
          parentId: doc.data().parentId || doc.id,
        }))
        .filter((schedule) => schedule.parentId === schedule.id);

      return parentSchedules.length;
    } catch (error) {
      console.error(
        `Error getting schedule count for class ${classId}:`,
        error
      );
      return 0;
    }
  };

  // Fetch số lượng lịch học cho tất cả các lớp
  const fetchAllScheduleCounts = async (classItems: any[]) => {
    const counts: Record<string, number> = {};

    // Dùng Promise.all để fetch song song
    await Promise.all(
      classItems.map(async (classItem) => {
        counts[classItem.id] = await getScheduleCount(classItem.id);
      })
    );

    setScheduleCounts(counts);
  };

  // Fetch classes for the user
  const fetchClassesForUser = async () => {
    try {
      // Nếu không có userProfile.id, không thể fetch lớp học
      if (!userProfile.id) {
        setLoading(false);
        return;
      }

      let classQuery;
      if (userProfile.role === "teacher") {
        classQuery = query(
          collection(db, "classes"),
          where("teacherId", "==", userProfile.id)
        );
      } else {
        classQuery = query(
          collection(db, "classes"),
          where("studentIds", "array-contains", userProfile.id)
        );
      }

      const querySnapshot = await getDocs(classQuery);
      const classesData = querySnapshot.docs.map((doc) => {
        const data = doc.data();
        return {
          id: doc.id,
          ...data,
          createdAt: data.createdAt ?? null,
        };
      });

      // Sort classes by creation date (newest first)
      classesData.sort((a, b) => {
        return (b.createdAt?.seconds ?? 0) - (a.createdAt?.seconds ?? 0);
      });

      setClasses(classesData);

      // Sau khi có danh sách lớp, fetch số lịch học cho mỗi lớp
      await fetchAllScheduleCounts(classesData);
    } catch (err: any) {
      setError("Lỗi khi tải danh sách lớp học: " + err.message);
      toast.error("Lỗi khi tải danh sách lớp học: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  // Gọi fetch classes khi component mount và khi userProfile thay đổi
  useEffect(() => {
    // Kiểm tra nếu người dùng đã đăng nhập (có userProfile.id)
    if (!userProfile.id) return;
    fetchClassesForUser();
  }, [userProfile]);

  const handleCreateClass = async (classData: {
    name: string;
    description: string;
  }) => {
    if (!classData.name) {
      setError("Vui lòng nhập tên lớp học");
      toast.error("Vui lòng nhập tên lớp học");
      return;
    }

    if (!userProfile.id) {
      setError("Không tìm thấy thông tin người dùng");
      toast.error("Không tìm thấy thông tin người dùng");
      return;
    }

    try {
      const newClassData = {
        name: classData.name,
        description: classData.description || "",
        teacherId: userProfile.id,
        studentIds: [],
        joinRequests: [],
        schedule: [],
        createdAt: new Date(),
      };

      const docRef = await addDoc(collection(db, "classes"), newClassData);
      const newClass = { id: docRef.id, ...newClassData };
      setClasses([newClass, ...classes]);

      // Cập nhật scheduleCounts với lớp mới (chưa có lịch học)
      setScheduleCounts((prev) => ({
        ...prev,
        [docRef.id]: 0,
      }));

      setShowClassModal(false);
      setError("");
      toast.success("Lớp học đã được tạo thành công!");
      toast.info("Bạn có thể thêm lịch học cho lớp này trong phần Lịch học");
    } catch (err: any) {
      setError("Lỗi khi tạo lớp học: " + err.message);
      toast.error("Lỗi khi tạo lớp học: " + err.message);
    }
  };

  const navigateToClassDetail = (classId: string) => {
    navigate(`/classes/${classId}`);
  };

  if (loading) {
    return (
      <div
        className="flex justify-center items-center h-full"
        style={{ minHeight: "60vh" }}
      >
        <Spin tip="Đang tải danh sách lớp học..." size="large" />
      </div>
    );
  }

  return (
    <div className="container mx-auto p-4">
      <ToastContainer />

      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
        <div>
          <Title level={2} style={{ margin: 0 }}>
            Lớp học của tôi
          </Title>
          <div className="flex items-center gap-2 mt-2">
            <Text>{userProfile.name}</Text>
            <Tag color={userProfile.role === "teacher" ? "blue" : "green"}>
              {userProfile.role === "teacher" ? "Giáo viên" : "Học viên"}
            </Tag>
          </div>
        </div>

        {userProfile.role === "teacher" && (
          <Button
            type="primary"
            size="large"
            icon={<PlusOutlined />}
            onClick={() => setShowClassModal(true)}
          >
            Tạo lớp học mới
          </Button>
        )}
      </div>

      {error && (
        <Alert
          type="error"
          message={error}
          showIcon
          style={{ marginBottom: 16 }}
          closable
          onClose={() => setError("")}
        />
      )}

      {/* Class listing */}
      <div className="mb-8">
        {classes.length === 0 ? (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={
              <div className="text-center py-8">
                <p className="text-gray-500 mb-4 text-lg">
                  Bạn chưa có lớp học nào
                </p>
                {userProfile.role === "teacher" && (
                  <Button
                    type="primary"
                    onClick={() => setShowClassModal(true)}
                  >
                    Tạo lớp học mới
                  </Button>
                )}
              </div>
            }
          />
        ) : (
          <List
            grid={{
              gutter: 24,
              xs: 1,
              sm: 2,
              md: 2,
              lg: 3,
              xl: 4,
              xxl: 4,
            }}
            dataSource={classes}
            renderItem={(classItem) => {
              // Số lượng học sinh
              const studentCount = classItem.studentIds?.length || 0;

              // Lấy số lượng lịch học từ state scheduleCounts
              const scheduleCount = scheduleCounts[classItem.id] || 0;

              return (
                <List.Item>
                  <Card
                    hoverable
                    className="h-full flex flex-col"
                    style={{
                      borderRadius: "8px",
                      boxShadow: "0 2px 8px rgba(0,0,0,0.09)",
                    }}
                    cover={
                      <div
                        style={{
                          height: "80px",
                          background:
                            "linear-gradient(135deg, #1677ff 0%, #4096ff 100%)",
                          borderTopLeftRadius: "8px",
                          borderTopRightRadius: "8px",
                          padding: "16px",
                          position: "relative",
                        }}
                      >
                        <BookOutlined
                          style={{
                            fontSize: "24px",
                            color: "white",
                            position: "absolute",
                            right: "16px",
                            top: "16px",
                          }}
                        />
                        <h3
                          style={{
                            color: "white",
                            fontSize: "18px",
                            fontWeight: "bold",
                            margin: 0,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {classItem.name}
                        </h3>
                        <Tag
                          color={
                            userProfile.role === "teacher" ? "blue" : "green"
                          }
                          style={{
                            marginTop: "8px",
                            backgroundColor: "rgba(255, 255, 255, 0.2)",
                            color: "white",
                            border: "none",
                          }}
                        >
                          {userProfile.role === "teacher"
                            ? "Giảng dạy"
                            : "Đang học"}
                        </Tag>
                      </div>
                    }
                    bodyStyle={{
                      padding: "16px",
                      flex: "1",
                      display: "flex",
                      flexDirection: "column",
                    }}
                  >
                    <div
                      style={{
                        flex: 1,
                        minHeight: "60px",
                        marginBottom: "16px",
                        overflow: "hidden",
                      }}
                    >
                      <Text type="secondary" ellipsis={{ rows: 3 }}>
                        {classItem.description || "Không có mô tả"}
                      </Text>
                    </div>

                    <div className="grid grid-cols-2 gap-2 mb-3">
                      <Badge
                        count={studentCount}
                        overflowCount={999}
                        style={{ backgroundColor: "#52c41a" }}
                      >
                        <div className="flex items-center gap-2 bg-gray-50 rounded p-2">
                          <TeamOutlined style={{ color: "#52c41a" }} />
                          <Text>Học sinh</Text>
                        </div>
                      </Badge>

                      <Badge
                        count={scheduleCount}
                        overflowCount={999}
                        style={{ backgroundColor: "#1677ff" }}
                        showZero
                      >
                        <div className="flex items-center gap-2 bg-gray-50 rounded p-2">
                          <CalendarOutlined style={{ color: "#1677ff" }} />
                          <Text>Lịch học</Text>
                        </div>
                      </Badge>
                    </div>

                    <Button
                      type="primary"
                      block
                      icon={<ArrowRightOutlined />}
                      onClick={() => navigateToClassDetail(classItem.id)}
                    >
                      Xem chi tiết
                    </Button>
                  </Card>
                </List.Item>
              );
            }}
          />
        )}
      </div>

      {/* Create class modal */}
      <ClassFormModal
        visible={showClassModal}
        onClose={() => setShowClassModal(false)}
        onSave={handleCreateClass}
        title="Tạo lớp học mới"
      />
    </div>
  );
}

export default ClassesPage;
