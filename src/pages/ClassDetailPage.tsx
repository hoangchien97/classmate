import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { onAuthStateChanged } from "firebase/auth";
import {
  doc,
  getDoc,
} from "firebase/firestore";
import { auth, db } from "@/firebase/firebase";
import {
  Button,
  Card,
  Tabs,
  message,
  Spin,
} from "antd";
import {
  UserOutlined,
  ScheduleOutlined,
  ArrowLeftOutlined,
} from "@ant-design/icons";
import ClassInfoTab from "@/components/ClassInfoTab";
import StudentsTab from "@/components/StudentsTab";
import ScheduleTab from "@/components/ScheduleTab";
import JoinRequestsTab from "@/components/JoinRequestsTab";
import { ToastContainer, toast } from "react-toastify";

const { TabPane } = Tabs;

interface Student {
  id: string;
  name?: string;
  email: string;
  role: string;
}

interface ClassData {
  id: string;
  name: string;
  description?: string;
  teacherId: string;
  createdAt?: { seconds: number };
  studentIds?: string[];
  joinRequests?: Array<{
    studentId: string;
    studentName?: string;
    requestedAt: { seconds: number };
  }>;
}

function ClassDetailPage() {
  const { classId } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [classData, setClassData] = useState<ClassData | null>(null);
  const [students, setStudents] = useState<Student[]>([]);
  const [userRole, setUserRole] = useState("");
  const [userId, setUserId] = useState("");

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        setUserId(user.uid);
        const userDoc = await getDoc(doc(db, "users", user.uid));
        if (userDoc.exists()) {
          const userData = userDoc.data();
          setUserRole(userData.role);
          if (classId) {
            await fetchClassData(classId);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classId, navigate]);

  const fetchClassData = async (id: string) => {
    try {
      const classDoc = await getDoc(doc(db, "classes", id));
      if (classDoc.exists()) {
        const data = { id: classDoc.id, ...classDoc.data() } as ClassData;
        setClassData(data);
        if (Array.isArray(data.studentIds) && data.studentIds.length > 0) {
          await fetchStudentDetails(data.studentIds);
        } else {
          setStudents([]);
        }
      } else {
        message.error("Không tìm thấy lớp học này");
        navigate("/classes");
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : "Lỗi không xác định";
      message.error(`Lỗi khi tải thông tin lớp học: ${errorMessage}`);
    }
  };

  const fetchStudentDetails = async (studentIds: string[]) => {
    try {
      const studentsData = await Promise.all(
        studentIds.map(async (id) => {
          const studentDoc = await getDoc(doc(db, "users", id));
          if (studentDoc.exists()) {
            return { id, ...studentDoc.data() } as Student;
          }
          return null;
        })
      );
      setStudents(studentsData.filter((student): student is Student => student !== null));
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : "Lỗi không xác định";
      message.error(`Lỗi khi tải thông tin học sinh: ${errorMessage}`);
      setStudents([]);
    }
  };

  const handleClassDataChange = (newClassData: ClassData) => {
    setClassData(newClassData);
  };

  const handleStudentsChange = (newStudents: Student[]) => {
    setStudents(newStudents);
    if (classData) {
      setClassData({
        ...classData,
        studentIds: newStudents.map(s => s.id)
      });
    }
  };

  const handleStudentAdded = async (studentId: string) => {
    // Refresh student list when a new student is added
    if (classData?.studentIds) {
      const updatedStudentIds = [...(classData.studentIds || []), studentId];
      await fetchStudentDetails(updatedStudentIds);
    }
  };

  const handleJoinRequestsChange = (newRequests: Array<{
    studentId: string;
    studentName?: string;
    requestedAt: { seconds: number };
  }>) => {
    if (classData) {
      setClassData({
        ...classData,
        joinRequests: newRequests
      });
    }
  };

  const handleShowMessage = (type: 'success' | 'error', message: string) => {
    if (type === 'success') {
      toast.success(message);
    } else {
      toast.error(message);
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
      
      {/* Header */}
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
          <p className="text-gray-500">{classData.description || "Không có mô tả"}</p>
        </div>
      </div>

      {/* Main Content */}
      <Card className="mb-6">
        <Tabs
          defaultActiveKey="info"
          className="max-w-6xl mx-auto"
        >
          {/* Tab thông tin lớp học */}
          <TabPane
            tab={
              <span>
                <UserOutlined />
                Thông tin lớp học
              </span>
            }
            key="info"
          >
            <ClassInfoTab
              classId={classId!}
              userRole={userRole}
              userId={userId}
              initialClassData={classData}
              onClassDataChange={handleClassDataChange}
              onShowMessage={handleShowMessage}
            />
          </TabPane>

          {/* Tab danh sách học sinh */}
          <TabPane
            tab={
              <span>
                <UserOutlined />
                Danh sách học sinh ({students.length})
              </span>
            }
            key="students"
          >
            <StudentsTab
              classId={classId!}
              userRole={userRole}
              initialStudents={students}
              classData={classData}
              onStudentsChange={handleStudentsChange}
              onShowMessage={handleShowMessage}
            />
          </TabPane>

          {/* Tab lịch học */}
          <TabPane
            tab={
              <span>
                <ScheduleOutlined />
                Lịch học
              </span>
            }
            key="schedule"
          >
            <ScheduleTab
              classId={classId!}
              userRole={userRole}
              userId={userId}
              classData={classData}
              onShowMessage={handleShowMessage}
            />
          </TabPane>

          {/* Tab yêu cầu tham gia */}
          {userRole === "teacher" && (
            <TabPane
              tab={
                <span>
                  <UserOutlined />
                  Yêu cầu tham gia ({classData.joinRequests?.length || 0})
                </span>
              }
              key="joinRequests"
            >
              <JoinRequestsTab
                classId={classId!}
                userRole={userRole}
                joinRequests={classData.joinRequests}
                onRequestsChange={handleJoinRequestsChange}
                onStudentAdded={handleStudentAdded}
                onShowMessage={handleShowMessage}
              />
            </TabPane>
          )}
        </Tabs>
      </Card>
    </div>
  );
}

export default ClassDetailPage;