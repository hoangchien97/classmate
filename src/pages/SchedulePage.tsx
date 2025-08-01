/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { onAuthStateChanged } from "firebase/auth";
import {
  doc,
  getDoc,
  collection,
  getDocs,
  deleteDoc,
  setDoc,
  query,
  where,
  updateDoc,
} from "firebase/firestore";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import interactionPlugin from "@fullcalendar/interaction";
import { auth, db } from "@/firebase/firebase";

function SchedulePage() {
  const [userRole, setUserRole] = useState("");
  const [userId, setUserId] = useState("");
  const [events, setEvents] = useState<any[]>([]);
  const [newEvent, setNewEvent] = useState({
    title: "",
    start: "",
    end: "",
    location: "",
    description: "",
    classId: "",
    isEditing: false,
    recurrence: "none",
  });
  const [error, setError] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<any>(null);
  const [userClasses, setUserClasses] = useState<any[]>([]);
  const calendarRef = useRef<any>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        setUserId(user.uid);
        // Lấy vai trò người dùng
        const userDoc = await getDoc(doc(db, "users", user.uid));
        const role = userDoc.exists() ? userDoc.data().role : "student";
        setUserRole(role);

        // Lấy các lớp học và lịch học
        await fetchUserClasses(user.uid, role);
        await fetchUserSchedules(user.uid, role);
      } else {
        navigate("/login");
      }
    });
    return () => unsubscribe();
  }, [navigate]);

  // Lấy các lớp học liên quan đến người dùng
  const fetchUserClasses = async (uid: string, role: string) => {
    try {
      const classesRef = collection(db, "classes");
      let classesQuery;

      if (role === "teacher") {
        classesQuery = query(classesRef, where("teacherId", "==", uid));
      } else {
        classesQuery = query(
          classesRef,
          where("studentIds", "array-contains", uid)
        );
      }

      const querySnapshot = await getDocs(classesQuery);
      const classesData = querySnapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));

      setUserClasses(classesData);
    } catch (err: any) {
      setError("Lỗi khi tải thông tin lớp học: " + err.message);
    }
  };

  // Lấy lịch học của người dùng
  const fetchUserSchedules = async (uid: string, role: string) => {
    try {
      const schedulesRef = collection(db, "schedules");
      let schedulesQuery;

      if (role === "teacher") {
        schedulesQuery = query(schedulesRef, where("teacherId", "==", uid));
      } else {
        // Đối với học sinh, chúng ta cần lấy lịch của các lớp mà học sinh đã tham gia
        const classesQuery = query(
          collection(db, "classes"),
          where("studentIds", "array-contains", uid)
        );
        const classesSnapshot = await getDocs(classesQuery);
        const classIds = classesSnapshot.docs.map((doc) => doc.id);

        if (classIds.length === 0) {
          setEvents([]);
          return;
        }

        schedulesQuery = query(schedulesRef, where("classId", "in", classIds));
      }

      const querySnapshot = await getDocs(schedulesQuery);
      const schedulesData = querySnapshot.docs.map((doc) => {
        const data = doc.data();
        return {
          id: doc.id,
          title: data.title,
          start: data.start.toDate(), // Chuyển đổi Firestore timestamp thành Date
          end: data.end.toDate(),
          location: data.location || "",
          description: data.description || "",
          classId: data.classId,
          teacherId: data.teacherId,
          backgroundColor: role === "teacher" ? "#4F46E5" : "#10B981", // Màu khác nhau cho giáo viên và học sinh
          borderColor: role === "teacher" ? "#4338CA" : "#059669",
        };
      });

      setEvents(schedulesData);
    } catch (err: any) {
      setError("Lỗi khi tải lịch học: " + err.message);
    }
  };

  // Xử lý khi người dùng mở modal để thêm/chỉnh sửa sự kiện
  // Sửa lại hàm handleOpenModal để luôn có trường recurrence
  const handleOpenModal = (date?: Date | null, event?: any) => {
    if (event) {
      setSelectedEvent(event);
      setNewEvent({
        title: event.title,
        start: formatDateForInput(new Date(event.start)),
        end: formatDateForInput(new Date(event.end)),
        location: event.location || "",
        description: event.description || "",
        classId: event.classId || "",
        isEditing: true,
        recurrence: event.recurrence || "none",
      });
    } else if (date) {
      const startDate = new Date(date);
      const endDate = new Date(date);
      endDate.setHours(endDate.getHours() + 1);
      setNewEvent({
        title: "",
        start: formatDateForInput(startDate),
        end: formatDateForInput(endDate),
        location: "",
        description: "",
        classId: "",
        isEditing: false,
        recurrence: "none",
      });
      setSelectedEvent(null);
    } else {
      const now = new Date();
      const endTime = new Date();
      endTime.setHours(endTime.getHours() + 1);
      setNewEvent({
        title: "",
        start: formatDateForInput(now),
        end: formatDateForInput(endTime),
        location: "",
        description: "",
        classId: "",
        isEditing: false,
        recurrence: "none",
      });
      setSelectedEvent(null);
    }
    setShowModal(true);
  };

  // Định dạng ngày tháng cho input datetime-local
  const formatDateForInput = (date: Date) => {
    return date.toISOString().slice(0, 16);
  };

  // Xử lý khi thêm hoặc cập nhật sự kiện
  const handleSaveEvent = async () => {
    if (!newEvent.title || !newEvent.start || !newEvent.end) {
      setError("Vui lòng nhập đầy đủ thông tin lịch học.");
      return;
    }

    try {
      if (newEvent.isEditing && selectedEvent) {
        // Cập nhật sự kiện đã tồn tại
        await updateDoc(doc(db, "schedules", selectedEvent.id), {
          title: newEvent.title,
          start: new Date(newEvent.start),
          end: new Date(newEvent.end),
          location: newEvent.location,
          description: newEvent.description,
          recurrence: newEvent.recurrence || "none",
          updatedAt: new Date(),
        });

        // Cập nhật UI
        setEvents(
          events.map((event) =>
            event.id === selectedEvent.id
              ? {
                  ...event,
                  title: newEvent.title,
                  start: new Date(newEvent.start),
                  end: new Date(newEvent.end),
                  location: newEvent.location,
                  description: newEvent.description,
                  recurrence: newEvent.recurrence || "none",
                }
              : event
          )
        );
      } else {
        // Tạo sự kiện mới
        let classId = newEvent.classId;

        if (!classId) {
          // Tạo lớp học mới nếu cần
          classId = `class_${Date.now()}`;
          await setDoc(doc(db, "classes", classId), {
            name: newEvent.title,
            teacherId: auth.currentUser?.uid,
            studentIds: [],
            joinRequests: [],
            createdAt: new Date(),
            location: newEvent.location || "",
            description: newEvent.description || "",
          });
        }

        // Tạo lịch học liên kết với lớp học
        const scheduleId = `schedule_${Date.now()}`;
        await setDoc(doc(db, "schedules", scheduleId), {
          classId: classId,
          teacherId: auth.currentUser?.uid,
          title: newEvent.title,
          start: new Date(newEvent.start),
          end: new Date(newEvent.end),
          location: newEvent.location || "",
          description: newEvent.description,
          recurrence: newEvent.recurrence || "none",
          createdAt: new Date(),
        });

        setEvents([
          ...events,
          {
            id: scheduleId,
            classId: classId,
            teacherId: auth.currentUser?.uid,
            title: newEvent.title,
            start: new Date(newEvent.start),
            end: new Date(newEvent.end),
            location: newEvent.location,
            description: newEvent.description,
            backgroundColor: "#4F46E5",
            borderColor: "#4338CA",
            recurrence: newEvent.recurrence || "none",
          },
        ]);
      }

      // Reset form và đóng modal
      setNewEvent({
        title: "",
        start: "",
        end: "",
        location: "",
        description: "",
        classId: "",
        isEditing: false,
        recurrence: "none",
      });
      setSelectedEvent(null);
      setShowModal(false);
      setError("");
    } catch (err: any) {
      setError("Lỗi khi lưu lịch học: " + err.message);
    }
  };

  const handleDeleteEvent = async (eventId: string) => {
    try {
      await deleteDoc(doc(db, "schedules", eventId));
      setEvents(events.filter((event) => event.id !== eventId));
      setSelectedEvent(null);
      setShowModal(false);
      setError("");
    } catch (err: any) {
      setError("Lỗi xóa lịch: " + err.message);
    }
  };

  return (
    <div className="space-y-6 p-4">
      <h2 className="text-2xl font-bold text-center text-blue-500">Lịch học</h2>
      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 mb-4 rounded">
          {error}
        </div>
      )}

      <div className="bg-white rounded-lg shadow p-4">
        <div className="mb-4 flex justify-between items-center">
          <div className="flex items-center space-x-4">
            <div className="flex items-center">
              <div className="w-3 h-3 rounded-full bg-indigo-600 mr-2"></div>
              <span className="text-sm text-gray-600">Lịch giảng dạy</span>
            </div>
            <div className="flex items-center">
              <div className="w-3 h-3 rounded-full bg-emerald-500 mr-2"></div>
              <span className="text-sm text-gray-600">Lớp học tham gia</span>
            </div>
          </div>

          {userRole === "teacher" && (
            <button
              onClick={() => handleOpenModal()}
              className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 transition"
            >
              Thêm lịch mới
            </button>
          )}
        </div>

        <FullCalendar
          ref={calendarRef}
          plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
          initialView="dayGridMonth"
          events={events}
          headerToolbar={{
            left: "prev,next today",
            center: "title",
            right: "dayGridMonth,timeGridWeek,timeGridDay",
          }}
          editable={userRole === "teacher"}
          selectable={userRole === "teacher"}
          selectMirror={true}
          dayMaxEvents={true}
          weekends={true}
          nowIndicator={true}
          eventClick={(info) => {
            const eventData = {
              id: info.event.id,
              title: info.event.title,
              start: info.event.start,
              end: info.event.end,
              location: info.event.extendedProps.location || "",
              description: info.event.extendedProps.description || "",
              classId: info.event.extendedProps.classId || "",
            };
            handleOpenModal(null, eventData);
          }}
          select={(info) => {
            if (userRole === "teacher") {
              handleOpenModal(info.start);
            }
          }}
          eventTimeFormat={{
            hour: "2-digit",
            minute: "2-digit",
            hour12: false,
          }}
          eventContent={(eventInfo) => {
            return (
              <div className="p-1">
                <div className="font-bold">{eventInfo.event.title}</div>
                {eventInfo.event.extendedProps.location && (
                  <div className="text-xs mt-1">
                    Địa điểm: {eventInfo.event.extendedProps.location}
                  </div>
                )}
                <div className="text-xs">{eventInfo.timeText}</div>
              </div>
            );
          }}
        />
      </div>

      {/* Modal để thêm/chỉnh sửa sự kiện */}
      {showModal && (
        <div className="fixed inset-0 z-50 overflow-auto bg-black bg-opacity-50 flex items-center justify-center">
          <div className="bg-white rounded-lg shadow-lg w-full max-w-md mx-4 md:mx-auto">
            <div className="px-6 py-4 border-b">
              <div className="flex justify-between items-center">
                <h3 className="text-xl font-semibold text-gray-900">
                  {newEvent.isEditing
                    ? "Chỉnh sửa lịch học"
                    : "Thêm lịch học mới"}
                </h3>
                <button
                  onClick={() => setShowModal(false)}
                  className="text-gray-400 hover:text-gray-500"
                >
                  <span className="text-2xl">&times;</span>
                </button>
              </div>
            </div>

            <div className="px-6 py-4 space-y-4">
              <div>
                <label
                  htmlFor="title"
                  className="block text-sm font-medium text-gray-700 mb-1"
                >
                  Tiêu đề
                </label>
                <input
                  id="title"
                  type="text"
                  value={newEvent.title}
                  onChange={(e) =>
                    setNewEvent({ ...newEvent, title: e.target.value })
                  }
                  className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Nhập tiêu đề lịch học"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label
                    htmlFor="start"
                    className="block text-sm font-medium text-gray-700 mb-1"
                  >
                    Bắt đầu
                  </label>
                  <input
                    id="start"
                    type="datetime-local"
                    value={newEvent.start}
                    onChange={(e) =>
                      setNewEvent({ ...newEvent, start: e.target.value })
                    }
                    className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label
                    htmlFor="end"
                    className="block text-sm font-medium text-gray-700 mb-1"
                  >
                    Kết thúc
                  </label>
                  <input
                    id="end"
                    type="datetime-local"
                    value={newEvent.end}
                    onChange={(e) =>
                      setNewEvent({ ...newEvent, end: e.target.value })
                    }
                    className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div>
                <label
                  htmlFor="location"
                  className="block text-sm font-medium text-gray-700 mb-1"
                >
                  Địa điểm
                </label>
                <input
                  id="location"
                  type="text"
                  value={newEvent.location}
                  onChange={(e) =>
                    setNewEvent({ ...newEvent, location: e.target.value })
                  }
                  className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="VD: Phòng 101"
                />
              </div>

              <div>
                <label
                  htmlFor="description"
                  className="block text-sm font-medium text-gray-700 mb-1"
                >
                  Mô tả
                </label>
                <textarea
                  id="description"
                  value={newEvent.description}
                  onChange={(e) =>
                    setNewEvent({ ...newEvent, description: e.target.value })
                  }
                  className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  rows={3}
                  placeholder="Nhập mô tả chi tiết"
                ></textarea>
              </div>

              {userRole === "teacher" && userClasses.length > 0 && (
                <div>
                  <label
                    htmlFor="classId"
                    className="block text-sm font-medium text-gray-700 mb-1"
                  >
                    Liên kết với lớp học
                  </label>
                  <select
                    id="classId"
                    value={newEvent.classId}
                    onChange={(e) =>
                      setNewEvent({ ...newEvent, classId: e.target.value })
                    }
                    className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">-- Tạo lớp học mới --</option>
                    {userClasses.map((cls) => (
                      <option key={cls.id} value={cls.id}>
                        {cls.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            <div className="px-6 py-4 border-t flex justify-end space-x-4">
              {newEvent.isEditing && userRole === "teacher" && (
                <button
                  onClick={() => handleDeleteEvent(selectedEvent.id)}
                  className="px-4 py-2 bg-red-500 text-white rounded-md hover:bg-red-600 transition"
                >
                  Xóa lịch
                </button>
              )}
              <button
                onClick={() => setShowModal(false)}
                className="px-4 py-2 bg-gray-300 text-gray-700 rounded-md hover:bg-gray-400 transition"
              >
                Hủy
              </button>
              {userRole === "teacher" && (
                <button
                  onClick={handleSaveEvent}
                  className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 transition"
                >
                  {newEvent.isEditing ? "Cập nhật" : "Thêm lịch"}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default SchedulePage;
