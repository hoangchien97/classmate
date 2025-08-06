import { useState, useEffect } from "react";
import { doc, getDoc, updateDoc, arrayUnion, arrayRemove, collection, query, where, getDocs } from "firebase/firestore";
import { db } from "@/firebase/firebase";
import { Button, Card, Select, Space, Popconfirm, message } from "antd";
import { UserOutlined, PlusOutlined, DeleteOutlined } from "@ant-design/icons";

const { Option } = Select;

interface Student {
  id: string;
  name?: string;
  email: string;
  role: string;
}

interface StudentsTabProps {
  classId: string;
  userRole: string;
  initialStudents?: Student[];
  classData?: {
    studentIds?: string[];
  };
  onStudentsChange?: (students: Student[]) => void;
  onShowMessage?: (type: 'success' | 'error', message: string) => void;
}

function StudentsTab({ classId, userRole, initialStudents = [], classData, onStudentsChange, onShowMessage }: StudentsTabProps) {
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
      const errorMessage = error instanceof Error ? error.message : "Lỗi không xác định";
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
      const validStudents = studentsData.filter((student): student is Student => student !== null);
      setStudents(validStudents);
      onStudentsChange?.(validStudents);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : "Lỗi không xác định";
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
      const addPromises = selectedStudents.map(studentId => 
        updateDoc(doc(db, "classes", classId), {
          studentIds: arrayUnion(studentId),
        })
      );
      
      await Promise.all(addPromises);

      // Update local state
      const newStudents = allStudents.filter(s => selectedStudents.includes(s.id));
      const updatedStudents = [...students, ...newStudents];
      setStudents(updatedStudents);
      onStudentsChange?.(updatedStudents);

      setSelectedStudents([]);
      setStudentSearchQuery("");
      onShowMessage?.('success', `Đã mời ${selectedStudents.length} học sinh vào lớp!`);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : "Lỗi không xác định";
      onShowMessage?.('error', `Lỗi khi mời học sinh: ${errorMessage}`);
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
      onShowMessage?.('success', "Đã xóa học sinh khỏi lớp!");
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : "Lỗi không xác định";
      onShowMessage?.('error', `Lỗi khi xóa học sinh: ${errorMessage}`);
    }
  };

  return (
    <div>
      
      {/* Student Invitation Section - Only for teachers */}
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
            loading={loading}
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

      {/* Students List */}
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
                  <div className="text-gray-500 text-sm">{student.email}</div>
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
    </div>
  );
}

export default StudentsTab;
