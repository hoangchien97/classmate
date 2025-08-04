/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { onAuthStateChanged } from "firebase/auth";
import {
  doc,
  getDoc,
  collection,
  getDocs,
  query,
  where,
} from "firebase/firestore";
import { Calendar, momentLocalizer, Views } from "react-big-calendar";
import type { View } from "react-big-calendar";
import moment from "moment";
import "react-big-calendar/lib/css/react-big-calendar.css";
import { auth, db } from "@/firebase/firebase";
import { Button, Alert } from "antd";
import ScheduleEventModal from "@/components/ScheduleEventModal";
import "../styles/calendar.css";

const localizer = momentLocalizer(moment);

function SchedulePage() {
  const [userRole, setUserRole] = useState("");
  const [userId, setUserId] = useState("");
  const [events, setEvents] = useState<any[]>([]);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [currentView, setCurrentView] = useState<View>("month");
  const [newEvent, setNewEvent] = useState({
    date: "",
    startTime: "",
    endTime: "",
    title: "",
    description: "",
    classId: "",
    isEditing: false,
    recurrence: "none",
    recurrenceEnd: "",
    parentId: "",
    weeklyDays: [] as number[],
    monthlyDay: 1,
  });
  const [error, setError] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<any>(null);
  const [userClasses, setUserClasses] = useState<any[]>([]);
  const navigate = useNavigate();

  const fetchUserSchedules = useCallback(
    async (uid: string, role: string) => {
      try {
        const schedulesRef = collection(db, "schedules");
        let schedulesQuery;

        if (role === "teacher") {
          schedulesQuery = query(schedulesRef, where("teacherId", "==", uid));
        } else {
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
          schedulesQuery = query(
            schedulesRef,
            where("classId", "in", classIds)
          );
        }

        const querySnapshot = await getDocs(schedulesQuery);
        const schedulesData = querySnapshot.docs.map((doc) => {
          const data = doc.data();
          const start = data.start.toDate();
          const end = data.end.toDate();
          const recurrenceEnd = data?.recurrenceEnd
            ? data?.recurrenceEnd?.toDate()
            : null;
          return {
            id: doc.id,
            title: data.title,
            start,
            end,
            description: data.description || "",
            classId: data.classId || "",
            teacherId: data.teacherId,
            recurrence: data.recurrence || "none",
            recurrenceEnd,
            parentId: data.parentId || doc.id,
            weeklyDays: data.weeklyDays || [],
            monthlyDay: data.monthlyDay || 1,
            className: userRole === "teacher" ? "teacher" : "student",
          };
        });
        setEvents(schedulesData);
      } catch (err: any) {
        setError("Lỗi khi tải lịch học: " + err.message);
      }
    },
    [userRole]
  );

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        setUserId(user.uid);
        const userDoc = await getDoc(doc(db, "users", user.uid));
        const role = userDoc.exists() ? userDoc.data().role : "student";
        setUserRole(role);
        await fetchUserClasses(user.uid, role);
        await fetchUserSchedules(user.uid, role);
      } else {
        navigate("/login");
      }
    });
    return () => unsubscribe();
  }, [navigate, fetchUserSchedules]);

  const fetchUserClasses = async (uid: string, role: string) => {
    try {
      const classesRef = collection(db, "classes");
      const classesQuery =
        role === "teacher"
          ? query(classesRef, where("teacherId", "==", uid))
          : query(classesRef, where("studentIds", "array-contains", uid));

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

  const handleOpenModal = (event?: any) => {
    if (event && event.start) {
      // Clicked on an existing event
      setSelectedEvent(event);
      setNewEvent({
        date: moment(event.start).format("YYYY-MM-DD"),
        startTime: moment(event.start).format("HH:mm"),
        endTime: moment(event.end).format("HH:mm"),
        title: event.title || "",
        description: event.description || "",
        classId: event.classId || "",
        isEditing: true,
        recurrence: event.recurrence || "none",
        recurrenceEnd: event.recurrenceEnd
          ? moment(event.recurrenceEnd).format("YYYY-MM-DD")
          : "",
        parentId: event.parentId || "",
        weeklyDays: event.weeklyDays || [],
        monthlyDay: event.monthlyDay || 1,
      });
    } else if (event && event.slots) {
      // Clicked on an empty slot
      const startDate = event.start || new Date();
      setNewEvent({
        date: moment(startDate).format("YYYY-MM-DD"),
        startTime: moment(startDate).format("HH:mm"),
        endTime: moment(startDate).add(1, "hour").format("HH:mm"),
        title: "",
        description: "",
        classId: "",
        isEditing: false,
        recurrence: "none",
        recurrenceEnd: "",
        parentId: "",
        weeklyDays: [],
        monthlyDay: 1,
      });
      setSelectedEvent(null);
    } else {
      // Manual trigger (button click)
      const startDate = new Date();
      setNewEvent({
        date: moment(startDate).format("YYYY-MM-DD"),
        startTime: moment(startDate).format("HH:mm"),
        endTime: moment(startDate).add(1, "hour").format("HH:mm"),
        title: "",
        description: "",
        classId: "",
        isEditing: false,
        recurrence: "none",
        recurrenceEnd: "",
        parentId: "",
        weeklyDays: [],
        monthlyDay: 1,
      });
      setSelectedEvent(null);
    }
    setShowModal(true);
  };

  const handleRefreshEvents = async () => {
    await fetchUserSchedules(userId, userRole);
  };

  return (
    <div className="space-y-6 p-4">
      <h2 className="text-2xl font-bold text-center text-blue-500">Lịch học</h2>
      {error && (
        <Alert
          type="error"
          message={error}
          showIcon
          style={{ marginBottom: 16 }}
        />
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
            <Button type="primary" onClick={() => handleOpenModal()}>
              Thêm lịch mới
            </Button>
          )}
        </div>

        <Calendar
          // Cấu hình localizer để format ngày tháng theo locale
          localizer={localizer}
          // Dữ liệu events để hiển thị trên calendar
          events={events}
          // Thuộc tính trong event object để lấy thời gian bắt đầu
          startAccessor="start"
          // Thuộc tính trong event object để lấy thời gian kết thúc
          endAccessor="end"
          // Style CSS cho calendar container
          style={{ height: 600 }}
          // Các view có thể chuyển đổi (Tháng, Tuần, Ngày, Chương trình)
          views={[Views.MONTH, Views.WEEK, Views.DAY, Views.AGENDA]}
          // View hiện tại đang hiển thị
          view={currentView}
          // Ngày hiện tại đang focus
          date={currentDate}
          // Callback khi user chuyển đổi view (month/week/day/agenda)
          onView={(view) => setCurrentView(view)}
          // Callback khi user navigate (next/previous/today buttons)
          onNavigate={(date) => setCurrentDate(date)}
          // Cho phép select time slots (chỉ teacher mới được phép)
          selectable={userRole === "teacher"}
          // Callback khi click vào slot trống để tạo event mới
          onSelectSlot={handleOpenModal}
          // Callback khi click vào event có sẵn để edit
          onSelectEvent={handleOpenModal}
          // Hàm để custom style cho từng event
          eventPropGetter={(event: any) => ({
            className: event.className,
          })}
          // Cấu hình format hiển thị ngày tháng và thời gian
          formats={{
            // Format cho time gutter bên trái (trong week/day view)
            timeGutterFormat: "HH:mm",

            // Format cho range thời gian của event
            eventTimeRangeFormat: ({ start, end }) =>
              `${moment(start).format("HH:mm")} - ${moment(end).format(
                "HH:mm"
              )}`,

            // Format cho ngày trong month view
            dayFormat: (date: Date) => moment(date).format("DD/MM"),

            // Format cho tên thứ trong week view
            weekdayFormat: (date: Date) => moment(date).format("dddd"),

            // Format cho header tháng năm
            monthHeaderFormat: (date: Date) => moment(date).format("MMMM YYYY"),

            // Format cho header ngày
            dayHeaderFormat: (date: Date) =>
              moment(date).format("dddd DD/MM/YYYY"),

            // Format cho range header trong week view
            dayRangeHeaderFormat: ({ start, end }) =>
              `${moment(start).format("DD/MM")} - ${moment(end).format(
                "DD/MM/YYYY"
              )}`,

            // Format cho ngày trong agenda view
            agendaDateFormat: (date: Date) => moment(date).format("DD/MM/YYYY"),

            // Format cho thời gian trong agenda view
            agendaTimeFormat: (date: Date) => moment(date).format("HH:mm"),

            // Format cho range thời gian trong agenda view
            agendaTimeRangeFormat: ({ start, end }) =>
              `${moment(start).format("HH:mm")} - ${moment(end).format(
                "HH:mm"
              )}`,
          }}
          // Custom text hiển thị trên các nút và label
          messages={{
            next: "Tiếp theo", // Nút next
            previous: "Trước đó", // Nút previous
            today: "Hôm nay", // Nút today
            month: "Tháng", // Tab month view
            week: "Tuần", // Tab week view
            day: "Ngày", // Tab day view
            agenda: "Chương trình", // Tab agenda view
            date: "Ngày", // Column header trong agenda
            time: "Thời gian", // Column header trong agenda
            event: "Sự kiện", // Column header trong agenda
            noEventsInRange: "Không có sự kiện nào trong khoảng thời gian này.",
            showMore: (total: number) => `+ Xem thêm ${total} sự kiện`,
          }}
          // Hiển thị popup khi có nhiều events trong 1 ngày
          popup={true}
          // Khoảng cách thời gian mỗi step (30 phút)
          step={30}
          // Số timeslots trong 1 giờ (2 = mỗi 30 phút 1 slot)
          timeslots={2}
          // Thời gian sớm nhất hiển thị (6:00 AM)
          min={new Date(2025, 0, 1, 6, 0, 0)}
          // Thời gian muộn nhất hiển thị (10:00 PM)
          max={new Date(2025, 0, 1, 22, 0, 0)}
          // Component custom để hiển thị event trong month view với giờ AM/PM
          components={{
            month: {
              event: ({ event }) => (
                <div className="rbc-event-content">
                  <strong>{moment(event.start).format("h:mm A")}</strong>
                  <br />
                  {event.title}
                </div>
              ),
            },
          }}
        />
      </div>

      <ScheduleEventModal
        showModal={showModal}
        setShowModal={setShowModal}
        newEvent={newEvent}
        setNewEvent={setNewEvent}
        userRole={userRole}
        userClasses={userClasses}
        setUserClasses={setUserClasses}
        selectedEvent={selectedEvent}
        onRefreshEvents={handleRefreshEvents}
      />
    </div>
  );
}

export default SchedulePage;
