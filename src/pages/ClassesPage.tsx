/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { onAuthStateChanged } from "firebase/auth";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  addDoc,
  arrayUnion,
  updateDoc,
} from "firebase/firestore";
import { auth, db } from "@/firebase/firebase";
import {
  Button,
  Alert,
  message,
  Spin,
  Card,
  List,
  Tag,
  Modal,
  Input,
} from "antd";
import {
  PlusOutlined,
  CalendarOutlined,
  TeamOutlined,
  RightOutlined,
} from "@ant-design/icons";
import ClassFormModal from "@/components/ClassFormModal";
import { ToastContainer, toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";

function ClassesPage() {
  const [userRole, setUserRole] = useState("");
  const [userId, setUserId] = useState("");
  const [classes, setClasses] = useState<any[]>([]);
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [showSearchModal, setShowSearchModal] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const [showClassModal, setShowClassModal] = useState(false);

  // Fetch classes for the user
  const fetchClassesForUser = async (uid: string, role: string) => {
    try {
      let classQuery;
      if (role === "teacher") {
        classQuery = query(
          collection(db, "classes"),
          where("teacherId", "==", uid)
        );
      } else {
        classQuery = query(
          collection(db, "classes"),
          where("studentIds", "array-contains", uid)
        );
      }

      const querySnapshot = await getDocs(classQuery);
      const classesData = querySnapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
        joinRequests: doc.data().joinRequests || [],
      }));

      // Sort classes by creation date (newest first)
      classesData.sort((a, b) => {
        return b.createdAt?.seconds - a.createdAt?.seconds;
      });

      setClasses(classesData);
    } catch (err: any) {
      setError("Lỗi khi tải danh sách lớp học: " + err.message);
      toast.error("Lỗi khi tải danh sách lớp học: " + err.message);
    }
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        setUserId(user.uid);
        const userDoc = await getDoc(doc(db, "users", user.uid));
        if (userDoc.exists()) {
          const userData = userDoc.data();
          setUserRole(userData.role);
          await fetchClassesForUser(user.uid, userData.role);
        } else {
          setError("Không tìm thấy thông tin người dùng.");
          message.error("Không tìm thấy thông tin người dùng.");
          navigate("/login");
        }
      } else {
        setError("Vui lòng đăng nhập để sử dụng tính năng này.");
        message.error("Vui lòng đăng nhập để sử dụng tính năng này.");
        navigate("/login");
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, [navigate]);

  const handleCreateClass = async (classData: {
    name: string;
    description: string;
  }) => {
    if (!classData.name) {
      setError("Vui lòng nhập tên lớp học");
      toast.error("Vui lòng nhập tên lớp học");
      return;
    }

    try {
      const newClassData = {
        name: classData.name,
        description: classData.description || "",
        teacherId: userId,
        studentIds: [],
        joinRequests: [],
        schedule: [],
        createdAt: new Date(),
      };

      const docRef = await addDoc(collection(db, "classes"), newClassData);
      setClasses([{ id: docRef.id, ...newClassData }, ...classes]);
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

  // Hàm xin tham gia lớp học
  const handleJoinRequest = async (classId: string) => {
    try {
      const classRef = doc(db, "classes", classId);
      const userDoc = await getDoc(doc(db, "users", userId));

      if (!userDoc.exists()) {
        setError("Không tìm thấy thông tin người dùng");
        toast.error("Không tìm thấy thông tin người dùng");
        return;
      }

      const userData = userDoc.data();

      await updateDoc(classRef, {
        joinRequests: arrayUnion({
          studentId: userId,
          studentName: userData.name || userData.email,
          requestedAt: new Date(),
        }),
      });

      // Cập nhật UI: xóa khỏi kết quả tìm kiếm
      setSearchResults(searchResults.filter((c: any) => c.id !== classId));
      setError("");
      toast.success("Đã gửi yêu cầu tham gia lớp học thành công!");
    } catch (err: any) {
      setError("Lỗi khi gửi yêu cầu tham gia: " + err.message);
      toast.error("Lỗi khi gửi yêu cầu tham gia: " + err.message);
    }
  };

  // Thêm hàm searchClasses vào component ClassesPage
  const searchClasses = async (query: string) => {
    if (!query.trim()) {
      setSearchResults([]);
      return;
    }

    try {
      // Tìm kiếm lớp học theo tên, chuyển đổi cả query và tên lớp về chữ thường để so sánh
      const classesRef = collection(db, "classes");
      const allClassesQuery = await getDocs(classesRef);

      const results = allClassesQuery.docs
        .map((doc) => ({ id: doc.id, ...doc.data() }))
        .filter(
          (classItem) =>
            // So sánh cả tên lớp và mô tả (nếu có)
            classItem.name.toLowerCase().includes(query.toLowerCase()) ||
            (classItem.description &&
              classItem.description.toLowerCase().includes(query.toLowerCase()))
        )
        // Lọc ra những lớp mà học sinh chưa tham gia và chưa gửi yêu cầu
        .filter(
          (classItem) =>
            !classItem.studentIds?.includes(userId) &&
            !classItem.joinRequests?.some(
              (req: any) => req.studentId === userId
            )
        );

      setSearchResults(results);
    } catch (error: any) {
      setError("Lỗi khi tìm kiếm lớp học: " + error.message);
      toast.error("Lỗi khi tìm kiếm lớp học: " + error.message);
    }
  };

  if (loading) {
    return <Spin tip="Đang tải..." style={{ width: "100%", marginTop: 100 }} />;
  }

  return (
    <div className="container mx-auto p-4">
      <ToastContainer />
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Lớp học của tôi</h1>
        {userRole === "teacher" && (
          <Button
            type="primary"
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
        />
      )}

      {userRole === "student" && (
        <div className="mb-4">
          <Button type="primary" onClick={() => setShowSearchModal(true)}>
            Tìm kiếm lớp học mới
          </Button>
        </div>
      )}

      {/* Class listing */}
      <div className="mb-8">
        {classes.length === 0 ? (
          <Card className="text-center py-8">
            <p className="text-gray-500 mb-4">Bạn chưa có lớp học nào</p>
            {userRole === "student" ? (
              <Button type="primary" onClick={() => setShowSearchModal(true)}>
                Tìm kiếm lớp học
              </Button>
            ) : (
              <Button type="primary" onClick={() => setShowClassModal(true)}>
                Tạo lớp học mới
              </Button>
            )}
          </Card>
        ) : (
          <List
            grid={{
              gutter: 16,
              xs: 1,
              sm: 1,
              md: 2,
              lg: 3,
              xl: 3,
              xxl: 4,
            }}
            dataSource={classes}
            renderItem={(classItem) => (
              <List.Item>
                <Card
                  hoverable
                  title={classItem.name}
                  extra={
                    <Tag color={userRole === "teacher" ? "blue" : "green"}>
                      {userRole === "teacher" ? "Giảng dạy" : "Đang học"}
                    </Tag>
                  }
                  onClick={() => navigateToClassDetail(classItem.id)}
                  actions={[
                    <div
                      key="students"
                      className="flex items-center justify-center"
                    >
                      <TeamOutlined />
                      <span className="ml-2">
                        {classItem.studentIds?.length || 0} học sinh
                      </span>
                    </div>,
                    <div
                      key="schedule"
                      className="flex items-center justify-center"
                    >
                      <CalendarOutlined />
                      <span className="ml-2">
                        {classItem.schedule?.length
                          ? `${classItem.schedule.length} lịch học`
                          : "Chưa có lịch"}
                      </span>
                    </div>,
                    <div
                      key="details"
                      className="flex items-center justify-center text-blue-500"
                    >
                      <span>Chi tiết</span>
                      <RightOutlined className="ml-1" />
                    </div>,
                  ]}
                >
                  <div className="h-16 overflow-hidden text-gray-500">
                    {classItem.description || "Không có mô tả"}
                  </div>
                </Card>
              </List.Item>
            )}
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

      {/* Search modal - can be moved to a separate component */}
      <Modal
        title="Tìm kiếm lớp học"
        open={showSearchModal}
        onCancel={() => setShowSearchModal(false)}
        footer={null}
      >
        <Input.Search
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          onSearch={searchClasses}
          placeholder="Nhập tên lớp học"
          enterButton="Tìm"
        />
        <div style={{ marginTop: 16 }}>
          {searchResults.length > 0 ? (
            <List
              dataSource={searchResults}
              renderItem={(classItem) => (
                <List.Item
                  actions={[
                    <Button
                      type="primary"
                      onClick={() => handleJoinRequest(classItem.id)}
                    >
                      Xin tham gia
                    </Button>,
                  ]}
                >
                  <List.Item.Meta
                    title={classItem.name}
                    description={classItem.description || "Không có mô tả"}
                  />
                </List.Item>
              )}
            />
          ) : (
            <div style={{ color: "#888" }}>Không có kết quả tìm kiếm</div>
          )}
        </div>
      </Modal>
    </div>
  );
}

export default ClassesPage;
