import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { onAuthStateChanged } from "firebase/auth";
import {
  doc,
  getDoc,
  updateDoc,
  deleteDoc,
  arrayUnion,
  arrayRemove,
  collection,
  query,
  where,
  getDocs,
  Timestamp,
  addDoc,
} from "firebase/firestore";
import { auth, db } from "@/firebase/firebase";
import {
  Button,
  Card,
  Tabs,
  Table,
  message,
  Spin,
  Descriptions,
  Tag,
  Space,
  Popconfirm,
} from "antd";
import {
  UserOutlined,
  ScheduleOutlined,
  EditOutlined,
  DeleteOutlined,
  CheckCircleOutlined,
  ArrowLeftOutlined,
} from "@ant-design/icons";
import ClassFormModal from "@/components/ClassFormModal";
import { ToastContainer, toast } from "react-toastify";

const { TabPane } = Tabs;

function ClassDetailPage() {
  const { classId } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [classData, setClassData] = useState<any>(null);
  const [students, setStudents] = useState<any[]>([]);
  const [allStudents, setAllStudents] = useState<any[]>([]);
  const [userRole, setUserRole] = useState("");
  const [userId, setUserId] = useState("");
  const [showEditModal, setShowEditModal] = useState(false);
  const [currentTab, setCurrentTab] = useState("info");
  const [canCheckin, setCanCheckin] = useState(false);
  const [checkedStudents, setCheckedStudents] = useState<string[]>([]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        setUserId(user.uid);
        const userDoc = await getDoc(doc(db, "users", user.uid));
        if (userDoc.exists()) {
          const userData = userDoc.data();
          setUserRole(userData.role);

          // Fetch class data
          if (classId) {
            await fetchClassData(classId);
            // Luôn fetch all students để giáo viên có thể thêm/xóa thành viên
            await fetchAllStudents();
          }
        } else {
          message.error("Không tìm thấy thông tin người dùng");
          navigate("/login");
        }
      } else {
        message.error("Vui lòng đăng nhập để sử dụng tính năng này");
        navigate("/login");
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, [classId, navigate]);

  // Check if checkin is available for current class
  useEffect(() => {
    if (!classData || !classData.schedule || classData.schedule.length === 0) {
      setCanCheckin(false);
      return;
    }

    const checkSchedule = () => {
      const now = new Date();
      const today = now.getDay(); // 0 = Sunday, 1 = Monday, etc.

      // Find if there's a session today
      const todaySession = classData.schedule.find(
        (s: any) => s.dayOfWeek === today
      );
      if (!todaySession) {
        setCanCheckin(false);
        return;
      }

      // Check if current time is within 30 minutes of start time
      const [hours, minutes] = todaySession.startTime.split(":").map(Number);
      const sessionStart = new Date(now);
      sessionStart.setHours(hours, minutes, 0, 0);

      const diffMinutes = (now.getTime() - sessionStart.getTime()) / 60000;
      setCanCheckin(diffMinutes >= -15 && diffMinutes <= 30);
    };

    // Run the check now
    checkSchedule();

    // Set an interval to check every minute
    const interval = setInterval(checkSchedule, 60000);
    return () => clearInterval(interval);
  }, [classData]);

  const fetchClassData = async (id: string) => {
    try {
      const classDoc = await getDoc(doc(db, "classes", id));
      if (classDoc.exists()) {
        const data = { id: classDoc.id, ...classDoc.data() };
        setClassData(data);

        // Luôn fetch danh sách học sinh trong lớp
        if (Array.isArray(data.studentIds) && data.studentIds.length > 0) {
          await fetchStudentDetails(data.studentIds);
        } else {
          setStudents([]);
        }

        // Get checked-in students
        if (data.checkins) {
          setCheckedStudents(data.checkins.map((c: any) => c.studentId));
        }
      } else {
        message.error("Không tìm thấy lớp học này");
        navigate("/classes");
      }
    } catch (error: any) {
      message.error(`Lỗi khi tải thông tin lớp học: ${error.message}`);
    }
  };

  const fetchStudentDetails = async (studentIds: string[]) => {
    try {
      const studentsData = await Promise.all(
        studentIds.map(async (id) => {
          const studentDoc = await getDoc(doc(db, "users", id));
          if (studentDoc.exists()) {
            return { id, ...studentDoc.data() };
          }
          return null; // Skip invalid student IDs
        })
      );
      // Filter out null values and update state
      setStudents(
        studentsData.filter(
          (student): student is NonNullable<typeof student> => student !== null
        )
      );
    } catch (error: any) {
      message.error(`Lỗi khi tải thông tin học sinh: ${error.message}`);
      setStudents([]);
    }
  };

  const fetchAllStudents = async () => {
    try {
      const q = query(collection(db, "users"), where("role", "==", "student"));
      const querySnapshot = await getDocs(q);
      debugger;
      const studentsData = querySnapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));
      debugger;

      setAllStudents(studentsData);
    } catch (error: any) {
      message.error(`Lỗi khi tải danh sách học sinh: ${error.message}`);
    }
  };

  const handleUpdateClass = async (classData: {
    name: string;
    description: string;
  }) => {
    try {
      await updateDoc(doc(db, "classes", classId!), {
        name: classData.name,
        description: classData.description || "",
      });

      setClassData({
        ...classData,
        name: classData.name,
        description: classData.description || "",
      });

      setShowEditModal(false);
      toast.success("Cập nhật lớp học thành công!");
    } catch (error: any) {
      toast.error(`Lỗi khi cập nhật lớp học: ${error.message}`);
    }
  };

  const handleDeleteClass = async () => {
    try {
      await deleteDoc(doc(db, "classes", classId!));
      toast.success("Đã xóa lớp học thành công!");
      navigate("/classes");
    } catch (error: any) {
      toast.error(`Lỗi khi xóa lớp học: ${error.message}`);
    }
  };

  const handleAddStudent = async (studentId: string) => {
    try {
      await updateDoc(doc(db, "classes", classId!), {
        studentIds: arrayUnion(studentId),
      });

      // Update local state
      const student = allStudents.find((s) => s.id === studentId);
      if (student) {
        setStudents([...students, student]);
        setClassData({
          ...classData,
          studentIds: [...(classData.studentIds || []), studentId],
        });
        toast.success("Đã thêm học sinh vào lớp!");
      }
    } catch (error: any) {
      toast.error(`Lỗi khi thêm học sinh: ${error.message}`);
    }
  };

  const handleRemoveStudent = async (studentId: string) => {
    try {
      await updateDoc(doc(db, "classes", classId!), {
        studentIds: arrayRemove(studentId),
      });

      // Update local state
      setStudents(students.filter((s) => s.id !== studentId));
      setClassData({
        ...classData,
        studentIds: classData.studentIds.filter(
          (id: string) => id !== studentId
        ),
      });
      toast.success("Đã xóa học sinh khỏi lớp!");
    } catch (error: any) {
      toast.error(`Lỗi khi xóa học sinh: ${error.message}`);
    }
  };

  const handleCheckin = async (studentId: string) => {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const sessionsQuery = query(
        collection(db, "sessions"),
        where("classId", "==", classId!),
        where("date", ">=", Timestamp.fromDate(today))
      );
      const querySnapshot = await getDocs(sessionsQuery);
      let sessionId = querySnapshot.docs[0]?.id;

      if (!sessionId) {
        const docRef = await addDoc(collection(db, "sessions"), {
          classId,
          date: Timestamp.fromDate(today),
          attendees: [],
          createdAt: Timestamp.fromDate(today),
          createdBy: userId,
        });
        sessionId = docRef.id;
      }

      await updateDoc(doc(db, "sessions", sessionId), {
        attendees: arrayUnion({
          studentId,
          status: "present",
          time: Timestamp.now(),
          checkedBy: userId,
        }),
      });

      setCheckedStudents([...checkedStudents, studentId]);
      toast.success("Điểm danh thành công!");
    } catch (error: any) {
      toast.error(`Lỗi khi điểm danh: ${error.message}`);
    }
  };

  const handleSelfCheckin = async () => {
    if (!canCheckin) {
      toast.error("Không thể điểm danh lúc này!");
      return;
    }

    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const sessionsQuery = query(
        collection(db, "sessions"),
        where("classId", "==", classId!),
        where("date", ">=", Timestamp.fromDate(today))
      );
      const querySnapshot = await getDocs(sessionsQuery);
      let sessionId = querySnapshot.docs[0]?.id;

      if (!sessionId) {
        const docRef = await addDoc(collection(db, "sessions"), {
          classId,
          date: Timestamp.fromDate(today),
          attendees: [],
          createdAt: Timestamp.fromDate(today),
          createdBy: userId,
        });
        sessionId = docRef.id;
      }

      await updateDoc(doc(db, "sessions", sessionId), {
        attendees: arrayUnion({
          studentId: userId,
          status: "present",
          time: Timestamp.now(),
        }),
      });

      setCheckedStudents([...checkedStudents, userId]);
      toast.success("Điểm danh thành công!");
    } catch (error: any) {
      toast.error(`Lỗi khi điểm danh: ${error.message}`);
    }
  };

  if (loading) {
    return <Spin tip="Đang tải..." className="flex justify-center mt-20" />;
  }

  if (!classData) {
    return (
      <div className="text-center p-10">
        <h2 className="text-xl">Không tìm thấy thông tin lớp học</h2>
        <Button
          type="primary"
          className="mt-4"
          onClick={() => navigate("/classes")}
        >
          Quay lại danh sách lớp
        </Button>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-4">
      <ToastContainer />

      {/* Header with back button */}
      <div className="flex items-center mb-6">
        <Button
          icon={<ArrowLeftOutlined />}
          onClick={() => navigate("/classes")}
          className="mr-4"
        >
          Quay lại
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold">{classData.name}</h1>
          <p className="text-gray-500">
            {classData.description || "Không có mô tả"}
          </p>
        </div>

        {userRole === "teacher" && classData.teacherId === userId && (
          <Space>
            <Button
              icon={<EditOutlined />}
              onClick={() => setShowEditModal(true)}
            >
              Chỉnh sửa
            </Button>
            <Popconfirm
              title="Xóa lớp học?"
              description="Bạn có chắc chắn muốn xóa lớp học này không?"
              onConfirm={handleDeleteClass}
              okText="Có"
              cancelText="Không"
            >
              <Button danger icon={<DeleteOutlined />}>
                Xóa lớp
              </Button>
            </Popconfirm>
          </Space>
        )}

        {userRole === "student" &&
          canCheckin &&
          !checkedStudents.includes(userId) && (
            <Button
              type="primary"
              icon={<CheckCircleOutlined />}
              onClick={handleSelfCheckin}
            >
              Điểm danh
            </Button>
          )}
      </div>

      <Card className="mb-6">
        <Tabs
          defaultActiveKey="info"
          onChange={(key) => setCurrentTab(key)}
          className="max-w-6xl mx-auto"
        >
          <TabPane
            tab={
              <span>
                <UserOutlined />
                Thông tin lớp học
              </span>
            }
            key="info"
          >
            <Descriptions bordered column={1} className="mt-4">
              <Descriptions.Item label="Tên lớp học">
                {classData.name}
              </Descriptions.Item>
              <Descriptions.Item label="Mô tả">
                {classData.description || "Không có mô tả"}
              </Descriptions.Item>
              <Descriptions.Item label="Số lượng học sinh">
                {classData.studentIds?.length || 0}
              </Descriptions.Item>
              <Descriptions.Item label="Số buổi học">
                {classData.schedule?.length || 0}
              </Descriptions.Item>
              <Descriptions.Item label="Ngày tạo">
                {classData.createdAt
                  ? new Date(
                      classData.createdAt.seconds * 1000
                    ).toLocaleDateString()
                  : "N/A"}
              </Descriptions.Item>
            </Descriptions>
          </TabPane>

          <TabPane
            tab={
              <span>
                <UserOutlined />
                Danh sách học sinh
              </span>
            }
            key="students"
          >
            {userRole === "teacher" && (
              <div className="mb-4">
                <h3 className="mb-2 font-medium">Thêm học sinh vào lớp</h3>
                <div className="flex">
                  <select
                    className="border rounded p-2 flex-1 mr-2"
                    onChange={(e) => {
                      if (e.target.value) {
                        handleAddStudent(e.target.value);
                        e.target.value = "";
                      }
                    }}
                    disabled={allStudents.length === 0}
                  >
                    <option value="">-- Chọn học sinh --</option>
                    {allStudents
                      .filter((s) => !classData.studentIds?.includes(s.id))
                      .map((student) => (
                        <option key={student.id} value={student.id}>
                          {student.name || student.email}
                        </option>
                      ))}
                  </select>
                </div>
                {allStudents.length === 0 && (
                  <p className="text-gray-500 mt-2">
                    Không tìm thấy học sinh nào để thêm
                  </p>
                )}
              </div>
            )}

            {students.length > 0 ? (
              <Table
                dataSource={students}
                rowKey="id"
                pagination={false}
                columns={[
                  {
                    title: "Tên",
                    dataIndex: "name",
                    key: "name",
                    render: (text) => text || "Chưa cập nhật",
                  },
                  {
                    title: "Email",
                    dataIndex: "email",
                    key: "email",
                  },
                  {
                    title: "Trạng thái",
                    key: "status",
                    render: (_, record) => (
                      <Tag
                        color={
                          checkedStudents.includes(record.id)
                            ? "green"
                            : "orange"
                        }
                      >
                        {checkedStudents.includes(record.id)
                          ? "Đã điểm danh"
                          : "Chưa điểm danh"}
                      </Tag>
                    ),
                  },
                  ...(userRole === "teacher"
                    ? [
                        {
                          title: "Hành động",
                          key: "action",
                          render: (_, record) => (
                            <Space>
                              {!checkedStudents.includes(record.id) &&
                                canCheckin && (
                                  <Button
                                    type="primary"
                                    size="small"
                                    onClick={() => handleCheckin(record.id)}
                                  >
                                    Điểm danh
                                  </Button>
                                )}
                              <Button
                                danger
                                size="small"
                                onClick={() => handleRemoveStudent(record.id)}
                              >
                                Xóa
                              </Button>
                            </Space>
                          ),
                        },
                      ]
                    : []),
                ]}
              />
            ) : (
              <div className="text-center py-8">
                <p className="text-gray-500 mb-4">
                  Chưa có học sinh nào trong lớp này
                </p>
              </div>
            )}
          </TabPane>

          <TabPane
            tab={
              <span>
                <ScheduleOutlined />
                Lịch học
              </span>
            }
            key="schedule"
          >
            {classData.schedule && classData.schedule.length > 0 ? (
              <Table
                dataSource={classData.schedule}
                rowKey={(record, index) => index!.toString()}
                pagination={false}
                columns={[
                  {
                    title: "Thứ",
                    key: "dayOfWeek",
                    render: (_, record) => {
                      const days = [
                        "Chủ nhật",
                        "Thứ hai",
                        "Thứ ba",
                        "Thứ tư",
                        "Thứ năm",
                        "Thứ sáu",
                        "Thứ bảy",
                      ];
                      return days[record.dayOfWeek];
                    },
                  },
                  {
                    title: "Giờ bắt đầu",
                    dataIndex: "startTime",
                    key: "startTime",
                  },
                  {
                    title: "Giờ kết thúc",
                    dataIndex: "endTime",
                    key: "endTime",
                  },
                ]}
              />
            ) : (
              <div className="text-center py-8">
                <p className="text-gray-500 mb-4">Chưa có lịch học nào</p>
                {userRole === "teacher" && (
                  <Button type="primary" onClick={() => navigate("/schedule")}>
                    Thêm lịch học
                  </Button>
                )}
              </div>
            )}
          </TabPane>
        </Tabs>
      </Card>

      {/* Edit class modal */}
      <ClassFormModal
        visible={showEditModal}
        onClose={() => setShowEditModal(false)}
        onSave={handleUpdateClass}
        initialValues={{
          name: classData.name,
          description: classData.description || "",
        }}
        title="Chỉnh sửa lớp học"
      />
    </div>
  );
}

export default ClassDetailPage;
