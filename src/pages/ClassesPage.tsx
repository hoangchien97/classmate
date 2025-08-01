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
  updateDoc,
  deleteDoc,
  arrayUnion,
  arrayRemove,
} from "firebase/firestore";
import { auth, db } from "@/firebase/firebase";

function ClassesPage() {
  const [userRole, setUserRole] = useState("");
  const [userId, setUserId] = useState("");
  const [classes, setClasses] = useState<any[]>([]);
  const [students, setStudents] = useState<any[]>([]);
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [showSearchModal, setShowSearchModal] = useState(false);
  const [newClass, setNewClass] = useState({
    name: "",
    dayOfWeek: 1,
    startTime: "08:00",
    endTime: "09:30",
    recurrence: "weekly",
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [selectedClass, setSelectedClass] = useState<any>(null);
  const navigate = useNavigate();
  
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
          navigate("/login");
        }
      } else {
        setError("Vui lòng đăng nhập để sử dụng tính năng này.");
        navigate("/login");
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, [navigate]);

  const fetchClassesForUser = async (uid: string, role: string) => {
    try {
      let classQuery;
      if (role === "teacher") {
        classQuery = query(collection(db, "classes"), where("teacherId", "==", uid));
      } else {
        classQuery = query(
          collection(db, "classes"),
          where("studentIds", "array-contains", uid)
        );
      }
      
      const querySnapshot = await getDocs(classQuery);
      const classesData = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        joinRequests: doc.data().joinRequests || [] // Đảm bảo mảng joinRequests luôn tồn tại
      }));
      
      // Sort classes by upcoming schedule
      classesData.sort((a, b) => {
        const aNextClass = getNextClassTime(a.schedule || []);
        const bNextClass = getNextClassTime(b.schedule || []);
        return aNextClass.getTime() - bNextClass.getTime();
      });
      
      setClasses(classesData);
    } catch (err: any) {
      setError("Lỗi khi tải danh sách lớp học: " + err.message);
    }
  };

  const getNextClassTime = (schedule: any[]): Date => {
    if (!schedule || schedule.length === 0) return new Date(9999, 0, 1);
    
    const now = new Date();
    const today = now.getDay(); // 0 = Sunday, 1 = Monday, ...
    
    let closestDate = new Date(9999, 0, 1);
    
    for (const slot of schedule) {
      const dayDiff = (slot.dayOfWeek - today + 7) % 7;
      const nextDate = new Date();
      nextDate.setDate(now.getDate() + dayDiff);
      
      // Set time
      const [hours, minutes] = slot.startTime.split(':').map(Number);
      nextDate.setHours(hours, minutes, 0, 0);
      
      if (dayDiff === 0 && nextDate < now) {
        // If it's today but the time has passed, move to next week
        nextDate.setDate(nextDate.getDate() + 7);
      }
      
      if (nextDate < closestDate) {
        closestDate = nextDate;
      }
    }
    
    return closestDate;
  };

  const fetchAllStudents = async () => {
    try {
      const studentsQuery = query(collection(db, "users"), where("role", "==", "student"));
      const querySnapshot = await getDocs(studentsQuery);
      const studentsData = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setStudents(studentsData);
    } catch (err: any) {
      setError("Lỗi khi tải danh sách học sinh: " + err.message);
    }
  };

  const handleCreateClass = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newClass.name) {
      setError("Vui lòng nhập tên lớp học");
      return;
    }

    try {
      const classData = {
        name: newClass.name,
        teacherId: userId,
        studentIds: [],
        joinRequests: [], // Thêm mảng để lưu các yêu cầu tham gia
        schedule: [
          {
            dayOfWeek: parseInt(newClass.dayOfWeek.toString()),
            startTime: newClass.startTime,
            endTime: newClass.endTime,
            recurrence: newClass.recurrence,
          }
        ],
        createdAt: new Date()
      };

      const docRef = await addDoc(collection(db, "classes"), classData);
      setClasses([...classes, { id: docRef.id, ...classData }]);
      setNewClass({
        name: "",
        dayOfWeek: 1,
        startTime: "08:00",
        endTime: "09:30",
        recurrence: "weekly",
      });
      setError("");
    } catch (err: any) {
      setError("Lỗi khi tạo lớp học: " + err.message);
    }
  };

  const handleSelectClass = async (classItem: any) => {
    setSelectedClass(classItem);
    if (userRole === "teacher") {
      await fetchAllStudents();
    }
  };

  const handleAddStudent = async (studentId: string) => {
    if (!selectedClass) return;
    
    try {
      await updateDoc(doc(db, "classes", selectedClass.id), {
        studentIds: arrayUnion(studentId)
      });
      setSelectedClass({
        ...selectedClass,
        studentIds: [...(selectedClass.studentIds || []), studentId]
      });
      
      setError("");
    } catch (err: any) {
      setError("Lỗi khi thêm học sinh: " + err.message);
    }
  };

  const handleRemoveStudent = async (studentId: string) => {
    if (!selectedClass) return;
    
    try {
      await updateDoc(doc(db, "classes", selectedClass.id), {
        studentIds: arrayRemove(studentId)
      });
      
      setSelectedClass({
        ...selectedClass,
        studentIds: selectedClass.studentIds.filter((id: string) => id !== studentId)
      });
      
      setError("");
    } catch (err: any) {
      setError("Lỗi khi xóa học sinh: " + err.message);
    }
  };

  const handleDeleteClass = async () => {
    if (!selectedClass) return;
    
    if (window.confirm(`Bạn có chắc muốn xóa lớp "${selectedClass.name}"?`)) {
      try {
        await deleteDoc(doc(db, "classes", selectedClass.id));
        setClasses(classes.filter(c => c.id !== selectedClass.id));
        setSelectedClass(null);
        setError("");
      } catch (err: any) {
        setError("Lỗi khi xóa lớp học: " + err.message);
      }
    }
  };

  const handleNavigateToCheckin = (classId: string) => {
    navigate(`/checkin/${classId}`);
  };

  // Hàm tìm kiếm lớp học
  const searchClasses = async () => {
    if (!searchQuery.trim()) {
      setError("Vui lòng nhập từ khóa tìm kiếm");
      return;
    }

    try {
      const classesQuery = query(collection(db, "classes"));
      const querySnapshot = await getDocs(classesQuery);
      
      // Lọc các lớp học chứa từ khóa trong tên
      const results = querySnapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() }))
        .filter((classItem: any) => {
          // Kiểm tra xem người dùng đã tham gia hoặc đã gửi yêu cầu chưa
          const alreadyJoined = classItem.studentIds?.includes(userId);
          const alreadyRequested = classItem.joinRequests?.some((req: any) => req.studentId === userId);
          
          // Lọc theo tên và loại trừ các lớp đã tham gia hoặc đã yêu cầu
          return classItem.name.toLowerCase().includes(searchQuery.toLowerCase()) && 
                 !alreadyJoined && 
                 !alreadyRequested && 
                 classItem.teacherId !== userId;
        });
      
      setSearchResults(results);
      setError("");
    } catch (err: any) {
      setError("Lỗi khi tìm kiếm lớp học: " + err.message);
    }
  };

  // Hàm xin tham gia lớp học
  const handleJoinRequest = async (classId: string) => {
    try {
      const classRef = doc(db, "classes", classId);
      const userDoc = await getDoc(doc(db, "users", userId));
      
      if (!userDoc.exists()) {
        setError("Không tìm thấy thông tin người dùng");
        return;
      }
      
      const userData = userDoc.data();
      
      await updateDoc(classRef, {
        joinRequests: arrayUnion({
          studentId: userId,
          studentName: userData.displayName || userData.email,
          requestedAt: new Date()
        })
      });
      
      // Cập nhật UI: xóa khỏi kết quả tìm kiếm
      setSearchResults(searchResults.filter((c: any) => c.id !== classId));
      setError("");
      alert("Đã gửi yêu cầu tham gia lớp học thành công!");
    } catch (err: any) {
      setError("Lỗi khi gửi yêu cầu tham gia: " + err.message);
    }
  };

  // Hàm phê duyệt yêu cầu tham gia
  const handleApproveRequest = async (classId: string, studentId: string) => {
    if (!selectedClass) return;
    
    try {
      const classRef = doc(db, "classes", classId);
      const classDoc = await getDoc(classRef);
      
      if (!classDoc.exists()) {
        setError("Không tìm thấy thông tin lớp học");
        return;
      }
      
      const classData = classDoc.data();
      const request = classData.joinRequests.find((req: any) => req.studentId === studentId);
      
      if (!request) {
        setError("Không tìm thấy yêu cầu tham gia");
        return;
      }
      
      // Thêm học sinh vào lớp
      await updateDoc(classRef, {
        studentIds: arrayUnion(studentId),
        joinRequests: classData.joinRequests.filter((req: any) => req.studentId !== studentId)
      });
      
      // Cập nhật state
      setSelectedClass({
        ...selectedClass,
        studentIds: [...(selectedClass.studentIds || []), studentId],
        joinRequests: (selectedClass.joinRequests || []).filter((req: any) => req.studentId !== studentId)
      });
      
      setError("");
    } catch (err: any) {
      setError("Lỗi khi phê duyệt yêu cầu: " + err.message);
    }
  };

  // Hàm từ chối yêu cầu tham gia
  const handleRejectRequest = async (classId: string, studentId: string) => {
    if (!selectedClass) return;
    
    try {
      const classRef = doc(db, "classes", classId);
      const classDoc = await getDoc(classRef);
      
      if (!classDoc.exists()) {
        setError("Không tìm thấy thông tin lớp học");
        return;
      }
      
      const classData = classDoc.data();
      const request = classData.joinRequests.find((req: any) => req.studentId === studentId);
      
      if (!request) {
        setError("Không tìm thấy yêu cầu tham gia");
        return;
      }
      
      // Xóa yêu cầu
      await updateDoc(classRef, {
        joinRequests: classData.joinRequests.filter((req: any) => req.studentId !== studentId)
      });
      
      // Cập nhật state
      setSelectedClass({
        ...selectedClass,
        joinRequests: (selectedClass.joinRequests || []).filter((req: any) => req.studentId !== studentId)
      });
      
      setError("");
    } catch (err: any) {
      setError("Lỗi khi từ chối yêu cầu: " + err.message);
    }
  };

  if (loading) {
    return <div className="flex justify-center items-center h-screen">Đang tải...</div>;
  }

  return (
    <div className="container mx-auto p-4">
      <h1 className="text-2xl font-bold mb-6">Quản lý lớp học</h1>
      
      {error && <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 mb-4 rounded">{error}</div>}
      
      {/* Nút tìm kiếm lớp học cho học sinh */}
      {userRole === "student" && (
        <div className="mb-4">
          <button
            onClick={() => setShowSearchModal(true)}
            className="bg-green-500 text-white px-4 py-2 rounded hover:bg-green-600"
          >
            Tìm kiếm lớp học mới
          </button>
        </div>
      )}
      
      {/* Modal tìm kiếm lớp học */}
      {showSearchModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-lg shadow-lg w-full max-w-md">
            <h3 className="text-xl font-semibold mb-4">Tìm kiếm lớp học</h3>
            
            <div className="mb-4">
              <div className="flex space-x-2">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="flex-1 px-3 py-2 border rounded"
                  placeholder="Nhập tên lớp học"
                />
                <button
                  onClick={searchClasses}
                  className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600"
                >
                  Tìm
                </button>
              </div>
            </div>
            
            {searchResults.length > 0 ? (
              <div className="max-h-80 overflow-y-auto">
                <h4 className="font-medium mb-2">Kết quả tìm kiếm</h4>
                <ul className="space-y-2">
                  {searchResults.map((classItem: any) => (
                    <li key={classItem.id} className="p-3 border rounded">
                      <div className="flex justify-between items-center">
                        <div>
                          <h5 className="font-medium">{classItem.name}</h5>
                          {classItem.schedule && classItem.schedule.length > 0 && (
                            <p className="text-sm text-gray-600">
                              {classItem.schedule[0].dayOfWeek === 0 ? "CN" : `Thứ ${classItem.schedule[0].dayOfWeek + 1}`}:
                              {" "}
                              {classItem.schedule[0].startTime} - {classItem.schedule[0].endTime}
                            </p>
                          )}
                        </div>
                        <button
                          onClick={() => handleJoinRequest(classItem.id)}
                          className="bg-green-500 text-white px-3 py-1 rounded hover:bg-green-600"
                        >
                          Xin tham gia
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="text-gray-500">Không có kết quả tìm kiếm</p>
            )}
            
            <div className="mt-4 flex justify-end">
              <button
                onClick={() => setShowSearchModal(false)}
                className="bg-gray-300 text-gray-700 px-4 py-2 rounded hover:bg-gray-400"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="col-span-1">
          <div className="bg-white p-4 rounded-lg shadow">
            <h2 className="text-xl font-semibold mb-4">Danh sách lớp học</h2>
            
            {userRole === "teacher" && (
              <form onSubmit={handleCreateClass} className="mb-6">
                <div className="mb-3">
                  <label className="block text-sm font-medium mb-1">Tên lớp học</label>
                  <input
                    type="text"
                    value={newClass.name}
                    onChange={(e) => setNewClass({...newClass, name: e.target.value})}
                    className="w-full px-3 py-2 border rounded"
                    placeholder="Nhập tên lớp học"
                  />
                </div>
                
                <div className="mb-3">
                  <label className="block text-sm font-medium mb-1">Ngày học</label>
                  <select
                    value={newClass.dayOfWeek}
                    onChange={(e) => setNewClass({...newClass, dayOfWeek: parseInt(e.target.value)})}
                    className="w-full px-3 py-2 border rounded"
                  >
                    <option value={1}>Thứ Hai</option>
                    <option value={2}>Thứ Ba</option>
                    <option value={3}>Thứ Tư</option>
                    <option value={4}>Thứ Năm</option>
                    <option value={5}>Thứ Sáu</option>
                    <option value={6}>Thứ Bảy</option>
                    <option value={0}>Chủ Nhật</option>
                  </select>
                </div>
                
                <div className="grid grid-cols-2 gap-3 mb-3">
                  <div>
                    <label className="block text-sm font-medium mb-1">Giờ bắt đầu</label>
                    <input
                      type="time"
                      value={newClass.startTime}
                      onChange={(e) => setNewClass({...newClass, startTime: e.target.value})}
                      className="w-full px-3 py-2 border rounded"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Giờ kết thúc</label>
                    <input
                      type="time"
                      value={newClass.endTime}
                      onChange={(e) => setNewClass({...newClass, endTime: e.target.value})}
                      className="w-full px-3 py-2 border rounded"
                    />
                  </div>
                </div>
                
                <button
                  type="submit"
                  className="w-full bg-blue-500 text-white py-2 rounded hover:bg-blue-600"
                >
                  Tạo lớp học
                </button>
              </form>
            )}
            
            <div className="space-y-2">
              {classes.length === 0 ? (
                <p className="text-gray-500">Chưa có lớp học nào</p>
              ) : (
                classes.map((classItem) => (
                  <div
                    key={classItem.id}
                    className={`p-3 border rounded cursor-pointer ${
                      selectedClass?.id === classItem.id ? "bg-blue-100 border-blue-400" : "hover:bg-gray-100"
                    }`}
                    onClick={() => handleSelectClass(classItem)}
                  >
                    <h3 className="font-medium">{classItem.name}</h3>
                    <p className="text-sm text-gray-600">
                      {classItem.schedule?.[0]?.dayOfWeek === 0 ? "CN" : `Thứ ${classItem.schedule?.[0]?.dayOfWeek + 1}`}:
                      {" "}
                      {classItem.schedule?.[0]?.startTime} - {classItem.schedule?.[0]?.endTime}
                    </p>
                    <p className="text-sm text-gray-600">
                      {classItem.studentIds?.length || 0} học sinh
                    </p>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
        
        <div className="col-span-1 md:col-span-2">
          {selectedClass ? (
            <div className="bg-white p-4 rounded-lg shadow">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-semibold">{selectedClass.name}</h2>
                <div className="flex space-x-2">
                  <button
                    onClick={() => handleNavigateToCheckin(selectedClass.id)}
                    className="px-3 py-1 bg-green-500 text-white rounded hover:bg-green-600"
                  >
                    Điểm danh
                  </button>
                  
                  {userRole === "teacher" && (
                    <button
                      onClick={handleDeleteClass}
                      className="px-3 py-1 bg-red-500 text-white rounded hover:bg-red-600"
                    >
                      Xóa lớp
                    </button>
                  )}
                </div>
              </div>
              
              <div className="mb-4">
                <h3 className="font-medium mb-2">Lịch học</h3>
                {selectedClass.schedule && selectedClass.schedule.length > 0 ? (
                  <ul className="space-y-2">
                    {selectedClass.schedule.map((scheduleItem: any, index: number) => (
                      <li key={index} className="p-2 bg-gray-100 rounded">
                        {scheduleItem.dayOfWeek === 0 ? "Chủ Nhật" : `Thứ ${scheduleItem.dayOfWeek + 1}`}:
                        {" "}
                        {scheduleItem.startTime} - {scheduleItem.endTime}
                        {" "}
                        ({scheduleItem.recurrence === "weekly" ? "Hàng tuần" : scheduleItem.recurrence})
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-gray-500">Chưa có lịch học</p>
                )}
              </div>
              
              {/* Hiển thị yêu cầu tham gia cho giáo viên */}
              {userRole === "teacher" && selectedClass.joinRequests && selectedClass.joinRequests.length > 0 && (
                <div className="mb-4">
                  <h3 className="font-medium mb-2">Yêu cầu tham gia lớp học ({selectedClass.joinRequests.length})</h3>
                  <ul className="space-y-2">
                    {selectedClass.joinRequests.map((request: any) => (
                      <li key={request.studentId} className="flex justify-between items-center p-3 bg-yellow-50 border border-yellow-200 rounded">
                        <span className="font-medium">{request.studentName}</span>
                        <div className="flex space-x-2">
                          <button
                            onClick={() => handleApproveRequest(selectedClass.id, request.studentId)}
                            className="bg-green-500 text-white px-2 py-1 rounded hover:bg-green-600 text-sm"
                          >
                            Phê duyệt
                          </button>
                          <button
                            onClick={() => handleRejectRequest(selectedClass.id, request.studentId)}
                            className="bg-red-500 text-white px-2 py-1 rounded hover:bg-red-600 text-sm"
                          >
                            Từ chối
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              
              <div>
                <h3 className="font-medium mb-2">Danh sách học sinh</h3>
                
                {userRole === "teacher" && students.length > 0 && (
                  <div className="mb-4">
                    <label className="block text-sm font-medium mb-1">Thêm học sinh</label>
                    <div className="flex space-x-2">
                      <select
                        className="flex-1 px-3 py-2 border rounded"
                        onChange={(e) => {
                          if (e.target.value) handleAddStudent(e.target.value);
                          e.target.value = "";
                        }}
                        value=""
                      >
                        <option value="">Chọn học sinh</option>
                        {students
                          .filter((student) => !selectedClass.studentIds?.includes(student.id))
                          .map((student) => (
                            <option key={student.id} value={student.id}>
                              {student.name || student.email}
                            </option>
                          ))}
                      </select>
                    </div>
                  </div>
                )}
                
                {selectedClass.studentIds && selectedClass.studentIds.length > 0 ? (
                  <ul className="space-y-2">
                    {selectedClass.studentIds.map((studentId: string) => {
                      const student = students.find(s => s.id === studentId);
                      return (
                        <li key={studentId} className="flex justify-between items-center p-2 bg-gray-100 rounded">
                          <span>{student ? (student.name || student.email) : studentId}</span>
                          
                          {userRole === "teacher" && (
                            <button
                              onClick={() => handleRemoveStudent(studentId)}
                              className="text-red-500 hover:text-red-700"
                            >
                              Xóa
                            </button>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <p className="text-gray-500">Chưa có học sinh nào trong lớp</p>
                )}
              </div>
            </div>
          ) : (
            <div className="bg-white p-4 rounded-lg shadow flex items-center justify-center h-full">
              <p className="text-gray-500">Chọn một lớp học để xem chi tiết</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default ClassesPage;
