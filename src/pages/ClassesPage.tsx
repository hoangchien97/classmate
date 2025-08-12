/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "@/firebase/firebase";
import {
  Button,
  Spin,
  Card,
  List,
  Tag,
  Empty,
  Typography,
} from "antd";
import {
  PlusOutlined,
  CalendarOutlined,
  TeamOutlined,
  BookOutlined,
  ArrowRightOutlined,
} from "@ant-design/icons";
import ClassFormModal from "@/components/ClassFormModal";
import { toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import { useSelector } from "react-redux";
import type { RootState } from "@/store";

const { Title, Text } = Typography;

function ClassesPage() {
  const { userProfile } = useSelector((state: RootState) => state.user);
  const [classes, setClasses] = useState<any[]>([]);
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
    <div className="min-h-screen from-blue-50 to-white py-8 px-2 md:px-0">
      <div className="container mx-auto max-w-7xl">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
          <div>
            <Title level={2} style={{ margin: 0, fontWeight: 700, letterSpacing: 0.5 }}>
              Lớp học của tôi
            </Title>
          </div>
          {userProfile.role === "teacher" && (
            <Button
              type="primary"
              size="large"
              icon={<PlusOutlined />}
              onClick={() => setShowClassModal(true)}
              className="transition-all duration-200 shadow-md hover:shadow-xl hover:-translate-y-1"
              style={{ borderRadius: 8 }}
            >
              Tạo lớp học mới
            </Button>
          )}
        </div>

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
                      className="transition-all duration-200 shadow-md hover:shadow-xl hover:-translate-y-1"
                      style={{ borderRadius: 8 }}
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
                gutter: 32,
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
                    <div className="transition-transform duration-200 hover:scale-[1.03]">
                      <Card
                        hoverable
                        className="h-full flex flex-col border-0 shadow-lg rounded-xl overflow-hidden bg-white/90 backdrop-blur-md transition-all duration-200 group"
                        style={{ minHeight: 320 }}
                        cover={
                          <div
                            className="relative"
                            style={{
                              height: "90px",
                              background:
                                "linear-gradient(135deg, #1677ff 0%, #4096ff 100%)",
                              borderTopLeftRadius: "12px",
                              borderTopRightRadius: "12px",
                              padding: "18px 18px 10px 18px",
                            }}
                          >
                            <BookOutlined
                              style={{
                                fontSize: "28px",
                                color: "white",
                                position: "absolute",
                                right: "18px",
                                top: "18px",
                                opacity: 0.85,
                                filter: "drop-shadow(0 2px 6px rgba(0,0,0,0.12))",
                              }}
                            />
                            <h3
                              className="transition-all duration-200 group-hover:scale-105"
                              style={{
                                color: "white",
                                fontSize: "20px",
                                fontWeight: 700,
                                margin: 0,
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                                letterSpacing: 0.2,
                              }}
                            >
                              {classItem.name}
                            </h3>
                            <Tag
                              color={userProfile.role === "teacher" ? "blue" : "green"}
                              style={{
                                marginTop: "10px",
                                backgroundColor: "rgba(255, 255, 255, 0.22)",
                                color: "white",
                                border: "none",
                                fontWeight: 500,
                                fontSize: 13,
                                letterSpacing: 0.1,
                              }}
                            >
                              {userProfile.role === "teacher" ? "Giảng dạy" : "Đang học"}
                            </Tag>
                          </div>
                        }
                        bodyStyle={{
                          padding: "18px 18px 10px 18px",
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
                          <Text type="secondary" ellipsis style={{ fontSize: 15 }}>
                            {classItem.description || "Không có mô tả"}
                          </Text>
                        </div>

                        <div className="flex flex-row items-center justify-between gap-3 mb-3 px-1">
                          <div className="flex-1 flex items-center justify-center bg-green-50 border border-green-200 rounded-lg py-2 px-3 mr-1 min-w-[110px] transition-all group-hover:shadow-md">
                            <TeamOutlined style={{ color: '#52c41a', fontSize: 20, marginRight: 8 }} />
                            <span className="font-bold text-green-700 text-lg mr-1">{studentCount}</span>
                            <span className="text-green-700 text-sm font-medium">Học sinh</span>
                          </div>
                          <div className="flex-1 flex items-center justify-center bg-blue-50 border border-blue-200 rounded-lg py-2 px-3 min-w-[110px] transition-all group-hover:shadow-md">
                            <CalendarOutlined style={{ color: '#1677ff', fontSize: 20, marginRight: 8 }} />
                            <span className="font-bold text-blue-700 text-lg mr-1">{scheduleCount}</span>
                            <span className="text-blue-700 text-sm font-medium">Lịch học</span>
                          </div>
                        </div>

                        <Button
                          type="primary"
                          block
                          icon={<ArrowRightOutlined />}
                          onClick={() => navigateToClassDetail(classItem.id)}
                          className="transition-all duration-200 font-semibold tracking-wide shadow hover:shadow-lg hover:-translate-y-0.5"
                          style={{ borderRadius: 8, fontSize: 15 }}
                        >
                          Xem chi tiết
                        </Button>
                      </Card>
                    </div>
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
          onCreated={async (newClass) => {
            setClasses([newClass, ...classes]);
            setScheduleCounts((prev) => ({
              ...prev,
              [newClass.id]: 0,
            }));
            setShowClassModal(false);
          }}
          userProfile={userProfile as any}
          title="Tạo lớp học mới"
        />
      </div>
    </div>
  );
}

export default ClassesPage;
