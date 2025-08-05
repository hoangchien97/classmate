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
  List,
  Select,
  Input,
  AutoComplete,
} from "antd";
import {
  UserOutlined,
  ScheduleOutlined,
  EditOutlined,
  DeleteOutlined,
  CheckCircleOutlined,
  ArrowLeftOutlined,
  PlusOutlined,
  CalendarOutlined,
} from "@ant-design/icons";
import ClassFormModal from "@/components/ClassFormModal";
import ScheduleEventModal from "@/components/ScheduleEventModal";
import { ToastContainer, toast } from "react-toastify";
import moment from "moment";
import { FORMAT_DATE, FORMAT_TIME_12H } from "@/constants";

const { TabPane } = Tabs;
const { Option } = Select;

interface Student {
  id: string;
  name?: string;
  email: string;
  role: string;
}

interface ScheduleEvent {
  id: string;
  title: string;
  start: Date;
  end: Date;
  description?: string;
  classId: string;
  teacherId: string;
  recurrence?: string;
  recurrenceEnd?: Date;
}

// Helper để format recurrence info
const formatRecurrenceInfo = (schedule: ScheduleEvent, recurringCount: number) => {
  if (schedule.recurrence === "weekly") {
    const daysMap = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const days = (schedule.weeklyDays || []).map((d: number) => daysMap[d]).join(", ");
    return `Weekly (${days}) until ${moment(schedule.recurrenceEnd).format("MMM D, YYYY")} (${recurringCount} sessions)`;
  }
  if (schedule.recurrence === "monthly") {
    return `Monthly (Day ${schedule.monthlyDay}) until ${moment(schedule.recurrenceEnd).format("MMM D, YYYY")} (${recurringCount} sessions)`;
  }
  return "One time";
};

// Lấy số lượng bản ghi con (sessions) cho mỗi lịch gốc
const getRecurringCount = async (parentId: string) => {
  const recurringQuery = query(
    collection(db, "schedules"),
    where("parentId", "==", parentId)
  );
  const recurringSnapshot = await getDocs(recurringQuery);
  return recurringSnapshot.docs.length + 1; // +1 cho bản ghi gốc
};

function ClassDetailPage() {
  const { classId } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [classData, setClassData] = useState<any>(null);
  const [students, setStudents] = useState<Student[]>([]);
  const [allStudents, setAllStudents] = useState<Student[]>([]);
  const [userRole, setUserRole] = useState("");
  const [userId, setUserId] = useState("");
  const [showEditModal, setShowEditModal] = useState(false);
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [currentTab, setCurrentTab] = useState("info");
  const [canCheckin, setCanCheckin] = useState(false);
  const [checkedStudents, setCheckedStudents] = useState<string[]>([]);
  const [classSchedules, setClassSchedules] = useState<ScheduleEvent[]>([]);
  
  // Student invitation states
  const [selectedStudents, setSelectedStudents] = useState<string[]>([]);
  const [studentSearchQuery, setStudentSearchQuery] = useState("");
  const [filteredStudents, setFilteredStudents] = useState<Student[]>([]);

  // State cho lịch gốc và số lượng sessions
  const [parentSchedules, setParentSchedules] = useState<ScheduleEvent[]>([]);
  const [recurringCounts, setRecurringCounts] = useState<{[id: string]: number}>({});
  const [selectedSchedule, setSelectedSchedule] = useState<ScheduleEvent | null>(null);

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
            await fetchClassSchedules(classId);
            if (userData.role === "teacher") {
              await fetchAllStudents();
            }
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

  // Fetch class schedules
  const fetchClassSchedules = async (id: string) => {
    try {
      const schedulesQuery = query(
        collection(db, "schedules"),
        where("classId", "==", id)
      );
      const querySnapshot = await getDocs(schedulesQuery);
      // Chỉ lấy các bản ghi gốc: parentId === id
      const schedulesData = querySnapshot.docs
        .map((doc) => {
          const data = doc.data();
          return {
            id: doc.id,
            title: data.title,
            start: data.start.toDate(),
            end: data.end.toDate(),
            description: data.description || "",
            classId: data.classId,
            teacherId: data.teacherId,
            recurrence: data.recurrence || "none",
            recurrenceEnd: data.recurrenceEnd ? data.recurrenceEnd.toDate() : null,
            parentId: data.parentId || doc.id,
            weeklyDays: data.weeklyDays || [],
            monthlyDay: data.monthlyDay || 1,
          };
        })
        .filter((schedule) => schedule.parentId === schedule.id); // chỉ lấy lịch gốc

      // Sort by start date
      schedulesData.sort((a, b) => a.start.getTime() - b.start.getTime());
      setClassSchedules(schedulesData);
    } catch (error: any) {
      message.error(`Lỗi khi tải lịch học: ${error.message}`);
    }
  };

  const fetchClassData = async (id: string) => {
    try {
      const classDoc = await getDoc(doc(db, "classes", id));
      if (classDoc.exists()) {
        const data = { id: classDoc.id, ...classDoc.data() };
        setClassData(data);
        if (Array.isArray(data.studentIds) && data.studentIds.length > 0) {
          await fetchStudentDetails(data.studentIds);
        } else {
          setStudents([]);
        }
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
            return { id, ...studentDoc.data() } as Student;
          }
          return null;
        })
      );
      setStudents(studentsData.filter((student): student is Student => student !== null));
    } catch (error: any) {
      message.error(`Lỗi khi tải thông tin học sinh: ${error.message}`);
      setStudents([]);
    }
  };

  const fetchAllStudents = async () => {
    try {
      const q = query(collection(db, "users"), where("role", "==", "student"));
      const querySnapshot = await getDocs(q);
      const studentsData = querySnapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as Student[];
      setAllStudents(studentsData);
      setFilteredStudents(studentsData);
    } catch (error: any) {
      message.error(`Lỗi khi tải danh sách học sinh: ${error.message}`);
    }
  };

  // Filter students based on search query
  useEffect(() => {
    if (!studentSearchQuery) {
      setFilteredStudents(allStudents.filter(s => !classData?.studentIds?.includes(s.id)));
    } else {
      const filtered = allStudents.filter(student => 
        !classData?.studentIds?.includes(student.id) &&
        (student.name?.toLowerCase().includes(studentSearchQuery.toLowerCase()) ||
         student.email.toLowerCase().includes(studentSearchQuery.toLowerCase()))
      );
      setFilteredStudents(filtered);
    }
  }, [studentSearchQuery, allStudents, classData]);

  // Chỉ lấy các bản ghi gốc (parentId === id)
  useEffect(() => {
    const fetchParentSchedules = async () => {
      const parents = classSchedules.filter(s => !s.parentId || s.parentId === s.id);
      setParentSchedules(parents);

      // Lấy số lượng sessions cho từng lịch gốc
      const counts: {[id: string]: number} = {};
      for (const schedule of parents) {
        counts[schedule.id] = await getRecurringCount(schedule.id);
      }
      setRecurringCounts(counts);
    };
    fetchParentSchedules();
  }, [classSchedules]);

  const handleUpdateClass = async (classData: { name: string; description: string }) => {
    try {
      await updateDoc(doc(db, "classes", classId!), {
        name: classData.name,
        description: classData.description || "",
      });
      setClassData({ ...classData, name: classData.name, description: classData.description || "" });
      setShowEditModal(false);
      toast.success("Cập nhật lớp học thành công!");
    } catch (error: any) {
      toast.error(`Lỗi khi cập nhật lớp học: ${error.message}`);
    }
  };

  const handleDeleteClass = async () => {
    try {
      // Hiển thị loading state
      message.loading("Đang xóa lớp học và dữ liệu liên quan...", 0);

      // 1. Đếm số lượng lịch học sẽ bị xóa
      const schedulesQuery = query(
        collection(db, "schedules"),
        where("classId", "==", classId!)
      );
      const schedulesSnapshot = await getDocs(schedulesQuery);
      const scheduleCount = schedulesSnapshot.docs.length;

      // 2. Xóa tất cả các lịch học của lớp này
      const deleteSchedulePromises = schedulesSnapshot.docs.map((doc) =>
        deleteDoc(doc.ref)
      );

      // Batch delete schedules
      if (deleteSchedulePromises.length > 0) {
        await Promise.all(deleteSchedulePromises);
      }

      // 3. Xóa lớp học
      await deleteDoc(doc(db, "classes", classId!));

      // Đóng loading message
      message.destroy();

      // Hiển thị success message với thông tin chi tiết
      const successMessage = scheduleCount > 0 
        ? `Đã xóa lớp học và ${scheduleCount} lịch học liên quan thành công!`
        : "Đã xóa lớp học thành công!";
      
      toast.success(successMessage);
      navigate("/classes");
    } catch (error: any) {
      // Đóng loading message nếu có lỗi
      message.destroy();
      console.error("Error deleting class and schedules:", error);
      toast.error(`Lỗi khi xóa lớp học: ${error.message}`);
    }
  };

  // Invite multiple students at once
  const handleInviteStudents = async () => {
    if (selectedStudents.length === 0) {
      message.warning("Vui lòng chọn ít nhất một học sinh để mời");
      return;
    }

    try {
      const addPromises = selectedStudents.map(studentId => 
        updateDoc(doc(db, "classes", classId!), {
          studentIds: arrayUnion(studentId),
        })
      );
      
      await Promise.all(addPromises);

      // Update local state
      const newStudents = allStudents.filter(s => selectedStudents.includes(s.id));
      setStudents([...students, ...newStudents]);
      setClassData({
        ...classData,
        studentIds: [...(classData.studentIds || []), ...selectedStudents],
      });

      setSelectedStudents([]);
      setStudentSearchQuery("");
      toast.success(`Đã mời ${selectedStudents.length} học sinh vào lớp!`);
    } catch (error: any) {
      toast.error(`Lỗi khi mời học sinh: ${error.message}`);
    }
  };

  const handleAddStudent = async (studentId: string) => {
    try {
      await updateDoc(doc(db, "classes", classId!), {
        studentIds: arrayUnion(studentId),
        joinRequests: arrayRemove(
          classData.joinRequests.find((req: any) => req.studentId === studentId)
        ),
      });
      const student = allStudents.find((s) => s.id === studentId);
      if (student) {
        setStudents([...students, student]);
        setClassData({
          ...classData,
          studentIds: [...(classData.studentIds || []), studentId],
          joinRequests: classData.joinRequests.filter((req: any) => req.studentId !== studentId),
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
      setStudents(students.filter((s) => s.id !== studentId));
      setClassData({
        ...classData,
        studentIds: classData.studentIds.filter((id: string) => id !== studentId),
      });
      toast.success("Đã xóa học sinh khỏi lớp!");
    } catch (error: any) {
      toast.error(`Lỗi khi xóa học sinh: ${error.message}`);
    }
  };

  const handleAcceptJoinRequest = async (studentId: string) => {
    try {
      await handleAddStudent(studentId);
    } catch (error: any) {
      toast.error(`Lỗi khi chấp nhận yêu cầu: ${error.message}`);
    }
  };

  const handleRejectJoinRequest = async (studentId: string) => {
    try {
      await updateDoc(doc(db, "classes", classId!), {
        joinRequests: arrayRemove(
          classData.joinRequests.find((req: any) => req.studentId === studentId)
        ),
      });
      setClassData({
        ...classData,
        joinRequests: classData.joinRequests.filter((req: any) => req.studentId !== studentId),
      });
      toast.success("Đã từ chối yêu cầu tham gia!");
    } catch (error: any) {
      toast.error(`Lỗi khi từ chối yêu cầu: ${error.message}`);
    }
  };

  const handleOpenScheduleModal = () => {
    setSelectedSchedule(null); // reset về create mode
    setShowScheduleModal(true);
  };

  const handleCloseScheduleModal = () => {
    setShowScheduleModal(false);
    setSelectedSchedule(null);
  };

  const handleRefreshSchedules = async () => {
    await fetchClassSchedules(classId!);
  };

  const handleEditSchedule = (schedule: ScheduleEvent) => {
    setSelectedSchedule(schedule);
    setShowScheduleModal(true);
  };

  const handleDeleteSchedule = async (schedule: ScheduleEvent) => {
    try {
      // Xóa bản ghi gốc
      await deleteDoc(doc(db, "schedules", schedule.id));
      // Xóa các bản ghi con
      const recurringQuery = query(
        collection(db, "schedules"),
        where("parentId", "==", schedule.id)
      );
      const recurringSnapshot = await getDocs(recurringQuery);
      const deletePromises = recurringSnapshot.docs.map((doc) => deleteDoc(doc.ref));
      if (deletePromises.length > 0) await Promise.all(deletePromises);

      toast.success("Đã xóa lịch học và các buổi lặp lại!");
      await handleRefreshSchedules();
    } catch (error: any) {
      toast.error("Lỗi khi xóa lịch học: " + error.message);
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
        {userRole === "teacher" && classData.teacherId === userId && (
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
                    <li>• Tất cả {classSchedules.length} lịch học của lớp</li>
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
        )}
      </div>

      {/* Main Content */}
      <Card className="mb-6">
        <Tabs
          defaultActiveKey="info"
          onChange={(key) => setCurrentTab(key)}
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
            <Descriptions bordered column={1} className="mt-4">
              <Descriptions.Item label="Tên lớp học">{classData.name}</Descriptions.Item>
              <Descriptions.Item label="Mô tả">{classData.description || "Không có mô tả"}</Descriptions.Item>
              <Descriptions.Item label="Ngày tạo">
                {classData.createdAt
                  ? new Date(classData.createdAt.seconds * 1000).toLocaleDateString()
                  : "N/A"}
              </Descriptions.Item>
            </Descriptions>
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
            {userRole === "teacher" && (
              <div className="mb-6 p-4 bg-gray-50 rounded-lg">
                <h3 className="mb-4 font-medium text-lg">Mời học sinh vào lớp</h3>
                <Select
                  mode="multiple"
                  placeholder="Tìm và chọn học sinh để mời"
                  value={selectedStudents}
                  onChange={setSelectedStudents}
                  showSearch
                  filterOption={false}
                  onSearch={setStudentSearchQuery}
                  style={{ width: "100%" }}
                  size="large"
                >
                  {filteredStudents.map((student) => (
                    <Option key={student.id} value={student.id}>
                      <div className="flex items-center">
                        <UserOutlined className="mr-2" />
                        <span className="font-medium">{student.name || student.email}</span>
                        <span className="ml-2 text-gray-400 text-xs">({student.email})</span>
                      </div>
                    </Option>
                  ))}
                </Select>
                {selectedStudents.length > 0 && (
                  <div className="flex justify-between items-center mt-3">
                    <span className="text-sm text-gray-600">
                      Đã chọn {selectedStudents.length} học sinh
                    </span>
                    <Space>
                      <Button onClick={() => setSelectedStudents([])}>
                        Hủy chọn
                      </Button>
                      <Button 
                        type="primary" 
                        icon={<PlusOutlined />}
                        onClick={handleInviteStudents}
                      >
                        Mời {selectedStudents.length} học sinh
                      </Button>
                    </Space>
                  </div>
                )}
                {allStudents.length === 0 && (
                  <p className="text-gray-500 mt-2">Không tìm thấy học sinh nào để thêm</p>
                )}
              </div>
            )}

            {/* Students list - card style */}
            {students.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {students.map((student) => (
                  <Card
                    key={student.id}
                    className="relative flex items-center px-4 py-3 rounded-lg shadow-sm border"
                    bodyStyle={{ padding: 0 }}
                  >
                    {/* Avatar + Tên */}
                    <div className="flex items-center py-4 pl-2">
                      <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center mr-3">
                        <UserOutlined className="text-xl text-blue-700" />
                      </div>
                      <div>
                        <div className="font-semibold text-base">{student.name || "Chưa cập nhật"}</div>
                      </div>
                    </div>
                    {/* Nút xóa ở góc trên bên phải */}
                    {userRole === "teacher" && (
                      <Popconfirm
                        title="Xóa học sinh khỏi lớp?"
                        description="Bạn có chắc chắn muốn xóa học sinh này khỏi lớp?"
                        onConfirm={() => handleRemoveStudent(student.id)}
                        okText="Có"
                        cancelText="Không"
                      >
                        <Button
                          type="text"
                          icon={<DeleteOutlined />}
                          size="small"
                          className="absolute top-2 right-2"
                          style={{ color: "#d32f2f" }}
                        />
                      </Popconfirm>
                    )}
                  </Card>
                ))}
              </div>
            ) : (
              <div className="text-center py-8">
                <UserOutlined className="text-4xl text-gray-300 mb-4" />
                <p className="text-gray-500 mb-4">Chưa có học sinh nào trong lớp này</p>
                {userRole === "teacher" && (
                  <p className="text-sm text-gray-400">
                    Sử dụng form phía trên để mời học sinh vào lớp
                  </p>
                )}
              </div>
            )}
          </TabPane>

          {/* Tab lịch học */}
          <TabPane
            tab={
              <span>
                <ScheduleOutlined />
                Lịch học ({parentSchedules.length})
              </span>
            }
            key="schedule"
          >
            <div className="mb-4 flex justify-between items-center">
              <h3 className="text-lg font-medium">Schedule for {classData.name}</h3>
              {userRole === "teacher" && classData.teacherId === userId && (
                <Button
                  type="primary"
                  icon={<CalendarOutlined />}
                  onClick={handleOpenScheduleModal}
                  className="font-semibold"
                >
                  Add Schedule
                </Button>
              )}
            </div>

            {parentSchedules.length > 0 ? (
              <div className="space-y-4">
                {parentSchedules.map((schedule) => (
                  <div
                    key={schedule.id}
                    className="flex items-center justify-between bg-white border rounded-lg px-6 py-4 shadow-sm group"
                  >
                    <div className="flex items-center">
                      <div className="w-1 h-12 bg-blue-900 rounded mr-4" />
                      <div>
                        <div className="font-semibold text-lg text-left">{schedule.title}</div>
                        <div className="text-gray-500 text-sm mb-1 text-left">{classData.name}</div>
                        <div className="flex items-center space-x-3 mb-1">
                          <span className="flex items-center text-gray-700">
                            <CalendarOutlined className="mr-1" />
                            {moment(schedule.start).format("MMM D, YYYY")}
                          </span>
                          <span className="flex items-center text-gray-700">
                            <ScheduleOutlined className="mr-1" />
                            {moment(schedule.start).format("h:mm A")} - {moment(schedule.end).format("h:mm A")}
                          </span>
                          <span>
                            <span className="bg-gray-100 px-2 py-1 rounded text-xs font-medium text-gray-700">
                              {formatRecurrenceInfo(schedule, recurringCounts[schedule.id] || 1)}
                            </span>
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center space-x-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                      <Button
                        icon={<CalendarOutlined />}
                        size="small"
                        onClick={() => handleEditSchedule(schedule)}
                        title="Edit schedule"
                      />
                      <Button
                        icon={<EditOutlined />}
                        size="small"
                        onClick={() => handleEditSchedule(schedule)}
                        title="Edit schedule"
                      />
                      <Popconfirm
                        title="Xóa lịch học này và tất cả buổi lặp lại?"
                        description="Hành động này sẽ xóa cả các buổi lặp lại liên quan. Bạn có chắc chắn?"
                        onConfirm={() => handleDeleteSchedule(schedule)}
                        okText="Xóa"
                        cancelText="Hủy"
                        okType="danger"
                      >
                        <Button
                          icon={<DeleteOutlined />}
                          danger
                          size="small"
                          title="Delete schedule"
                        />
                      </Popconfirm>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8">
                <CalendarOutlined className="text-4xl text-gray-300 mb-4" />
                <p className="text-gray-500 mb-4">Chưa có lịch học nào</p>
                {userRole === "teacher" && (
                  <Button type="primary" icon={<PlusOutlined />} onClick={handleOpenScheduleModal}>
                    Thêm lịch học đầu tiên
                  </Button>
                )}
              </div>
            )}
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
              {classData.joinRequests && classData.joinRequests.length > 0 ? (
                <List
                  dataSource={classData.joinRequests}
                  renderItem={(request: any) => (
                    <List.Item
                      actions={[
                        <Button
                          type="primary"
                          size="small"
                          onClick={() => handleAcceptJoinRequest(request.studentId)}
                        >
                          Chấp nhận
                        </Button>,
                        <Button
                          danger
                          size="small"
                          onClick={() => handleRejectJoinRequest(request.studentId)}
                        >
                          Từ chối
                        </Button>,
                      ]}
                    >
                      <List.Item.Meta
                        avatar={<UserOutlined />}
                        title={request.studentName || "Không có tên"}
                        description={`Gửi vào: ${new Date(request.requestedAt.seconds * 1000).toLocaleDateString()}`}
                      />
                    </List.Item>
                  )}
                />
              ) : (
                <div className="text-center py-8">
                  <UserOutlined className="text-4xl text-gray-300 mb-4" />
                  <p className="text-gray-500 mb-4">Chưa có yêu cầu tham gia nào</p>
                </div>
              )}
            </TabPane>
          )}
        </Tabs>
      </Card>

      {/* Modals */}
      <ClassFormModal
        visible={showEditModal}
        onClose={() => setShowEditModal(false)}
        onSave={handleUpdateClass}
        initialValues={{ name: classData.name, description: classData.description || "" }}
        title="Chỉnh sửa lớp học"
      />

      {/* Schedule Modal */}
      {showScheduleModal && (
        <ScheduleEventModal
          open={showScheduleModal}
          onClose={handleCloseScheduleModal}
          mode={selectedSchedule ? "edit" : "create"}
          userRole={userRole}
          userClasses={[classData]}
          selectedEvent={selectedSchedule}
          onRefreshEvents={handleRefreshSchedules}
        />
      )}
    </div>
  );
}

export default ClassDetailPage;