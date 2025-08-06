import { useState, useEffect } from "react";
import {
  doc,
  getDoc,
  updateDoc,
  arrayUnion,
  arrayRemove,
  collection,
  query,
  where,
  getDocs,
} from "firebase/firestore";
import { db } from "@/firebase/firebase";
import { Button, Select, Popconfirm, message, Tooltip } from "antd";
import {
  UserOutlined,
  PlusOutlined,
  ClearOutlined,
  CloseCircleOutlined,
} from "@ant-design/icons";

const { Option } = Select;

interface Student {
  id: string;
  name?: string;
  email: string;
  role: string;
  avatar?: string;
}

interface StudentsTabProps {
  classId: string;
  userRole: string;
  initialStudents?: Student[];
  classData?: {
    studentIds?: string[];
  };
  onStudentsChange?: (students: Student[]) => void;
  onShowMessage?: (type: "success" | "error", message: string) => void;
}

function StudentsTab({
  classId,
  userRole,
  initialStudents = [],
  classData,
  onStudentsChange,
  onShowMessage,
}: StudentsTabProps) {
  const [students, setStudents] = useState<Student[]>(initialStudents);
  const [allStudents, setAllStudents] = useState<Student[]>([]);
  const [selectedStudents, setSelectedStudents] = useState<string[]>([]);
  const [studentSearchQuery, setStudentSearchQuery] = useState("");
  const [filteredStudents, setFilteredStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (userRole === "teacher") {
      fetchAllStudents();
    }
  }, [userRole]);

  useEffect(() => {
    if (!initialStudents.length && classData?.studentIds?.length) {
      fetchStudentDetails(classData.studentIds);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classData?.studentIds, initialStudents.length]);

  // Filter students based on search query
  useEffect(() => {
    if (!studentSearchQuery) {
      setFilteredStudents(
        allStudents.filter((s) => !classData?.studentIds?.includes(s.id))
      );
    } else {
      const filtered = allStudents.filter(
        (student) =>
          !classData?.studentIds?.includes(student.id) &&
          (student.name
            ?.toLowerCase()
            .includes(studentSearchQuery.toLowerCase()) ||
            student.email
              .toLowerCase()
              .includes(studentSearchQuery.toLowerCase()))
      );
      setFilteredStudents(filtered);
    }
  }, [studentSearchQuery, allStudents, classData]);

  const fetchAllStudents = async () => {
    try {
      setLoading(true);
      const q = query(collection(db, "users"), where("role", "==", "student"));
      const querySnapshot = await getDocs(q);
      const studentsData = querySnapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as Student[];
      setAllStudents(studentsData);
      setFilteredStudents(studentsData);
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : "Lỗi không xác định";
      message.error(`Lỗi khi tải danh sách học sinh: ${errorMessage}`);
    } finally {
      setLoading(false);
    }
  };

  const fetchStudentDetails = async (studentIds: string[]) => {
    try {
      setLoading(true);
      const studentsData = await Promise.all(
        studentIds.map(async (id) => {
          const studentDoc = await getDoc(doc(db, "users", id));
          if (studentDoc.exists()) {
            return { id, ...studentDoc.data() } as Student;
          }
          return null;
        })
      );
      const validStudents = studentsData.filter(
        (student): student is Student => student !== null
      );
      setStudents(validStudents);
      onStudentsChange?.(validStudents);
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : "Lỗi không xác định";
      message.error(`Lỗi khi tải thông tin học sinh: ${errorMessage}`);
      setStudents([]);
    } finally {
      setLoading(false);
    }
  };

  // Invite multiple students at once
  const handleInviteStudents = async () => {
    if (selectedStudents.length === 0) {
      message.warning("Vui lòng chọn ít nhất một học sinh để mời");
      return;
    }

    try {
      const addPromises = selectedStudents.map((studentId) =>
        updateDoc(doc(db, "classes", classId), {
          studentIds: arrayUnion(studentId),
        })
      );

      await Promise.all(addPromises);

      // Update local state
      const newStudents = allStudents.filter((s) =>
        selectedStudents.includes(s.id)
      );
      const updatedStudents = [...students, ...newStudents];
      setStudents(updatedStudents);
      onStudentsChange?.(updatedStudents);

      setSelectedStudents([]);
      setStudentSearchQuery("");
      onShowMessage?.(
        "success",
        `Đã mời ${selectedStudents.length} học sinh vào lớp!`
      );
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : "Lỗi không xác định";
      onShowMessage?.("error", `Lỗi khi mời học sinh: ${errorMessage}`);
    }
  };

  const handleRemoveStudent = async (studentId: string) => {
    try {
      await updateDoc(doc(db, "classes", classId), {
        studentIds: arrayRemove(studentId),
      });
      const updatedStudents = students.filter((s) => s.id !== studentId);
      setStudents(updatedStudents);
      onStudentsChange?.(updatedStudents);
      onShowMessage?.("success", "Đã xóa học sinh khỏi lớp!");
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : "Lỗi không xác định";
      onShowMessage?.("error", `Lỗi khi xóa học sinh: ${errorMessage}`);
    }
  };

  return (
    <div>
      {/* Student Invitation Section - Only for teachers */}
      {userRole === "teacher" && (
        <div className="mb-6 p-6 bg-white rounded-lg shadow-sm border">
          <h3 className="mb-4 font-semibold text-lg text-gray-800">
            Mời học sinh vào lớp
          </h3>
          <div className="flex items-center gap-4">
            <Select
              mode="multiple"
              placeholder="Tìm kiếm học sinh bằng tên hoặc email"
              value={selectedStudents}
              onChange={setSelectedStudents}
              showSearch
              filterOption={false}
              onSearch={setStudentSearchQuery}
              style={{ flex: 1 }}
              size="large"
              loading={loading}
              className="rounded-md"
            >
              {filteredStudents.map((student) => (
                <Option key={student.id} value={student.id}>
                  <div className="flex items-center">
                    <UserOutlined className="mr-2 text-blue-500" />
                    <span className="font-medium">
                      {student.name || student.email}
                    </span>
                    <span className="ml-2 text-gray-400 text-xs">
                      ({student.email})
                    </span>
                  </div>
                </Option>
              ))}
            </Select>
            {selectedStudents.length > 0 && (
              <Button
                icon={<ClearOutlined />}
                onClick={() => {
                  setSelectedStudents([]);
                  setStudentSearchQuery("");
                }}
                className="text-gray-600 hover:text-gray-800"
              >
                Xóa bộ lọc
              </Button>
            )}
          </div>
          {selectedStudents.length > 0 && (
            <div className="flex justify-between items-center mt-4">
              <span className="text-sm text-gray-600">
                Đã chọn {selectedStudents.length} học sinh
              </span>
              <Button
                type="primary"
                icon={<PlusOutlined />}
                onClick={handleInviteStudents}
                className="bg-blue-500 hover:bg-blue-600"
              >
                Mời {selectedStudents.length} học sinh
              </Button>
            </div>
          )}
          {allStudents.length === 0 && (
            <p className="text-gray-500 mt-4">
              Không tìm thấy học sinh nào để thêm
            </p>
          )}
        </div>
      )}

      {/* Students List */}
      {students.length > 0 ? (
        <div
          className="grid gap-4 animate-fade-in"
          style={{
            gridTemplateColumns: "repeat(auto-fit, minmax(auto, 120px))",
          }}
        >
          {students.map((student) => (
            <div
              key={student.id}
              className="relative flex flex-col items-center p-4 rounded-lg shadow-sm hover:shadow-md transition-shadow duration-200 bg-white"
            >
              {/* Avatar */}
              <div className="relative">
                {student.avatar ? (
                  <img
                    src={student.avatar}
                    alt={student.name || student.email}
                    className="w-12 h-12 rounded-full object-cover border border-blue-200"
                  />
                ) : (
                  <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 text-xl font-medium border border-blue-200">
                    {student.name
                      ? student.name[0].toUpperCase()
                      : student.email[0].toUpperCase()}
                  </div>
                )}
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
                      icon={<CloseCircleOutlined />}
                      size="small"
                      className="absolute -top-2 -right-2 rounded-full w-6 h-6 flex items-center justify-center transition-transform duration-200 hover:scale-110"
                    />
                  </Popconfirm>
                )}
              </div>
              {/* Name */}
              <Tooltip title={student.name || student.email} placement="top">
                <div className="mt-2 text-center text-sm font-medium text-gray-800 truncate max-w-[120px]">
                  {student.name || student.email}
                </div>
              </Tooltip>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-8">
          <UserOutlined className="text-4xl text-gray-300 mb-4" />
          <p className="text-gray-500 mb-4">
            Chưa có học sinh nào trong lớp này
          </p>
          {userRole === "teacher" && (
            <p className="text-sm text-gray-400">
              Sử dụng form phía trên để mời học sinh vào lớp
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export default StudentsTab;
