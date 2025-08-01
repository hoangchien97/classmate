/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { onAuthStateChanged } from "firebase/auth";
import {
  doc,
  getDoc,
  collection,
  getDocs,
  query,
  where,
  addDoc,
  updateDoc,
  Timestamp,
  arrayUnion,
} from "firebase/firestore";
import { auth, db } from "@/firebase/firebase";

function CheckinPage() {
  const { classId } = useParams();
  const [userRole, setUserRole] = useState("");
  const [userId, setUserId] = useState("");
  const [classData, setClassData] = useState<any>(null);
  const [students, setStudents] = useState<any[]>([]);
  const [sessions, setSessions] = useState<any[]>([]);
  const [currentSession, setCurrentSession] = useState<any>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

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
            await fetchSessions(classId);
          }
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
  }, [navigate, classId]);

  const fetchClassData = async (id: string) => {
    try {
      const classDoc = await getDoc(doc(db, "classes", id));
      if (classDoc.exists()) {
        const data = { id: classDoc.id, ...classDoc.data() };
        setClassData(data);
        
        // Fetch students data if teacher
        if (userRole === "teacher" && data.studentIds?.length > 0) {
          await fetchStudentsData(data.studentIds);
        }
      } else {
        setError("Không tìm thấy thông tin lớp học.");
        navigate("/classes");
      }
    } catch (err: any) {
      setError("Lỗi khi tải thông tin lớp học: " + err.message);
    }
  };

  // Hàm để lấy danh sách học sinh từ danh sách ID
  const fetchStudents = async (studentIds: string[]) => {
    try {
      if (!studentIds.length) return [];
      
      // Lấy thông tin của từng học sinh dựa vào ID
      const studentsData = await Promise.all(
        studentIds.map(async (studentId) => {
          const studentDoc = await getDoc(doc(db, "users", studentId));
          if (studentDoc.exists()) {
            return { id: studentId, ...studentDoc.data() };
          }
          return null;
        })
      );
      
      return studentsData.filter(Boolean);
    } catch (error: any) {
      console.error("Chi tiết lỗi:", error);
      setError(`Lỗi: ${error.message}. Code: ${error.code}`);
      return [];
    }
  };

  // Sử dụng hàm này khi cần lấy danh sách học sinh của một lớp
  useEffect(() => {
    const loadClassStudents = async () => {
      if (classData && classData.studentIds) {
        const studentsData = await fetchStudents(classData.studentIds);
        setStudents(studentsData);
      }
    };
    
    loadClassStudents();
  }, [classData]);

  const fetchSessions = async (id: string) => {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      // Sử dụng truy vấn đơn giản thay vì truy vấn kết hợp để tránh yêu cầu index
      const sessionsQuery = query(
        collection(db, "sessions"),
        where("classId", "==", id)
      );
      
      const querySnapshot = await getDocs(sessionsQuery);
      // Lọc dữ liệu sau khi truy vấn để tránh yêu cầu index
      const sessionsData = querySnapshot.docs
        .map(doc => ({
          id: doc.id,
          ...doc.data()
        }))
        .filter(session => session.date.seconds >= today.getTime() / 1000);
      
      // Sort sessions by date
      sessionsData.sort((a, b) => {
        return a.date.seconds - b.date.seconds;
      });
      
      setSessions(sessionsData);
      
      // Check if there's a session for today
      const todaySession = sessionsData.find(session => {
        const sessionDate = new Date(session.date.seconds * 1000);
        return sessionDate.setHours(0, 0, 0, 0) === today.getTime();
      });
      
      if (todaySession) {
        setCurrentSession(todaySession);
      }
    } catch (err: any) {
      setError("Lỗi khi tải thông tin điểm danh: " + err.message);
    }
  };
  const handleCreateSession = async () => {
    if (!classId) return;
    
    try {
      const now = new Date();
      
      const sessionData = {
        classId,
        date: Timestamp.fromDate(now),
        attendees: [],
        createdAt: Timestamp.fromDate(now),
        createdBy: userId
      };
      
      const docRef = await addDoc(collection(db, "sessions"), sessionData);
      const newSession = { id: docRef.id, ...sessionData };
      
      setSessions([newSession, ...sessions]);
      setCurrentSession(newSession);
    } catch (err: any) {
      setError("Lỗi khi tạo buổi điểm danh: " + err.message);
    }
  };

  const handleStudentCheckin = async (sessionId: string) => {
    if (!userId || !sessionId) return;
    
    try {
      const sessionRef = doc(db, "sessions", sessionId);
      await updateDoc(sessionRef, {
        attendees: arrayUnion({
          studentId: userId,
          status: "present",
          time: Timestamp.now()
        })
      });
      
      // Update local state
      const updatedSessions = sessions.map(session => {
        if (session.id === sessionId) {
          const attendees = [...(session.attendees || [])];
          attendees.push({
            studentId: userId,
            status: "present",
            time: Timestamp.now()
          });
          return { ...session, attendees };
        }
        return session;
      });
      
      setSessions(updatedSessions);
      
      if (currentSession?.id === sessionId) {
        setCurrentSession({
          ...currentSession,
          attendees: [
            ...(currentSession.attendees || []),
            {
              studentId: userId,
              status: "present",
              time: Timestamp.now()
            }
          ]
        });
      }
      
      setError("");
    } catch (err: any) {
      setError("Lỗi khi điểm danh: " + err.message);
    }
  };

  const handleTeacherCheckin = async (sessionId: string, studentId: string) => {
    if (!sessionId || !studentId) return;
    
    try {
      const sessionRef = doc(db, "sessions", sessionId);
      await updateDoc(sessionRef, {
        attendees: arrayUnion({
          studentId,
          status: "present",
          time: Timestamp.now(),
          checkedBy: userId
        })
      });
      
      // Update local state
      const updatedSessions = sessions.map(session => {
        if (session.id === sessionId) {
          const attendees = [...(session.attendees || [])];
          attendees.push({
            studentId,
            status: "present",
            time: Timestamp.now(),
            checkedBy: userId
          });
          return { ...session, attendees };
        }
        return session;
      });
      
      setSessions(updatedSessions);
      
      if (currentSession?.id === sessionId) {
        setCurrentSession({
          ...currentSession,
          attendees: [
            ...(currentSession.attendees || []),
            {
              studentId,
              status: "present",
              time: Timestamp.now(),
              checkedBy: userId
            }
          ]
        });
      }
      
      setError("");
    } catch (err: any) {
      setError("Lỗi khi điểm danh: " + err.message);
    }
  };

  const isStudentCheckedIn = (session: any, studentId: string) => {
    if (!session || !session.attendees) return false;
    return session.attendees.some((a: any) => a.studentId === studentId);
  };

  if (loading) {
    return <div className="flex justify-center items-center h-screen">Đang tải...</div>;
  }

  return (
    <div className="container mx-auto p-4">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Điểm danh lớp: {classData?.name}</h1>
        <button
          onClick={() => navigate("/classes")}
          className="px-4 py-2 bg-gray-200 rounded hover:bg-gray-300"
        >
          Quay lại danh sách lớp
        </button>
      </div>
      
      {error && <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 mb-4 rounded">{error}</div>}
      
      {userRole === "teacher" && (
        <div className="bg-white p-4 rounded-lg shadow mb-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-semibold">Buổi học hôm nay</h2>
            
            {!currentSession && (
              <button
                onClick={handleCreateSession}
                className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
              >
                Tạo buổi học mới
              </button>
            )}
          </div>
          
          {currentSession ? (
            <div>
              <p className="mb-4">
                Ngày: {new Date(currentSession.date.seconds * 1000).toLocaleDateString()}
              </p>
              
              <div>
                <h3 className="font-medium mb-2">Danh sách học sinh:</h3>
                
                {students.length > 0 ? (
                  <div className="space-y-2">
                    {students.map(student => (
                      <div
                        key={student.id}
                        className="flex justify-between items-center p-3 border rounded"
                      >
                        <div>
                          <p className="font-medium">{student.name || "Học sinh"}</p>
                          <p className="text-sm text-gray-500">{student.email}</p>
                        </div>
                        
                        {isStudentCheckedIn(currentSession, student.id) ? (
                          <span className="px-3 py-1 bg-green-100 text-green-800 rounded-full text-sm">
                            Đã điểm danh
                          </span>
                        ) : (
                          <button
                            onClick={() => handleTeacherCheckin(currentSession.id, student.id)}
                            className="px-3 py-1 bg-blue-500 text-white rounded hover:bg-blue-600"
                          >
                            Điểm danh
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-gray-500">Chưa có học sinh trong lớp</p>
                )}
              </div>
            </div>
          ) : (
            <p className="text-gray-500">Chưa có buổi học nào hôm nay</p>
          )}
        </div>
      )}
      
      {userRole === "student" && (
        <div className="bg-white p-4 rounded-lg shadow mb-6">
          <h2 className="text-xl font-semibold mb-4">Điểm danh</h2>
          
          {currentSession ? (
            <div>
              <p className="mb-4">
                Buổi học ngày: {new Date(currentSession.date.seconds * 1000).toLocaleDateString()}
              </p>
              
              {isStudentCheckedIn(currentSession, userId) ? (
                <div className="p-4 bg-green-100 text-green-800 rounded">
                  Bạn đã điểm danh thành công!
                </div>
              ) : (
                <button
                  onClick={() => handleStudentCheckin(currentSession.id)}
                  className="w-full py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
                >
                  Điểm danh ngay
                </button>
              )}
            </div>
          ) : (
            <p className="text-gray-500">Chưa có buổi học nào hôm nay</p>
          )}
        </div>
      )}
      
      <div className="bg-white p-4 rounded-lg shadow">
        <h2 className="text-xl font-semibold mb-4">Lịch sử điểm danh</h2>
        
        {sessions.length > 0 ? (
          <div className="space-y-4">
            {sessions.map(session => (
              <div key={session.id} className="p-3 border rounded">
                <p className="font-medium">
                  Ngày: {new Date(session.date.seconds * 1000).toLocaleDateString()}
                </p>
                <p className="text-sm text-gray-600">
                  Số học sinh điểm danh: {session.attendees?.length || 0}/{classData?.studentIds?.length || 0}
                </p>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-gray-500">Chưa có dữ liệu điểm danh</p>
        )}
      </div>
    </div>
  );
}

export default CheckinPage;
