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
import { FORMAT_DATE, FORMAT_TIME_12H } from "@/constants";
import "../styles/calendar.css";

const localizer = momentLocalizer(moment);

// Hàm tùy chỉnh để định dạng ngày trong tuần thành tiếng Việt
const vietnameseWeekdayFormat = (date: Date) => {
  const days = [
    "Chủ Nhật",
    "Thứ 2",
    "Thứ 3",
    "Thứ 4",
    "Thứ 5",
    "Thứ 6",
    "Thứ 7",
  ];
  return days[date.getDay()];
};

function SchedulePage() {
  const [userRole, setUserRole] = useState("");
  const [userId, setUserId] = useState("");
  const [events, setEvents] = useState<any[]>([]);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [currentView, setCurrentView] = useState<View>("month");
  const [error, setError] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [modalMode, setModalMode] = useState<"create" | "edit">("create");
  const [selectedEvent, setSelectedEvent] = useState<any>(null);
  const [userClasses, setUserClasses] = useState<any[]>([]);
  const navigate = useNavigate();

  // Function để xác định loại event dựa trên thời gian
  const getEventType = (eventStart: Date, eventEnd: Date, allEvents: any[]) => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const eventDate = new Date(
      eventStart.getFullYear(),
      eventStart.getMonth(),
      eventStart.getDate()
    );

    // 1. Kiểm tra nếu event là hôm nay
    if (eventDate.getTime() === today.getTime()) {
      return "today";
    }

    // 2. Kiểm tra nếu event đã qua
    if (eventEnd < now) {
      return "past";
    }

    // 3. Kiểm tra nếu event trong tương lai
    if (eventStart > now) {
      // Tìm event gần nhất trong tương lai
      const futureEvents = allEvents
        .filter((e) => new Date(e.start) > now)
        .sort(
          (a, b) => new Date(a.start).getTime() - new Date(b.start).getTime()
        );

      // Nếu đây là event gần nhất (hoặc trong top 3 events gần nhất trong ngày)
      if (futureEvents.length > 0) {
        const nearestEvent = futureEvents[0];
        const nearestEventDate = new Date(
          nearestEvent.start.getFullYear(),
          nearestEvent.start.getMonth(),
          nearestEvent.start.getDate()
        );

        // Nếu event này cùng ngày với event gần nhất hoặc là event gần nhất
        if (
          eventDate.getTime() === nearestEventDate.getTime() ||
          nearestEvent.id === eventStart.getTime() + eventEnd.getTime()
        ) {
          return "coming";
        }
      }

      return "future";
    }

    // Default case
    return "future";
  };

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

        // First pass: create basic event data
        const basicEvents = querySnapshot.docs.map((doc) => {
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
          };
        });

        // Second pass: determine event types and add styling
        const schedulesData = basicEvents.map((event) => {
          const eventType = getEventType(event.start, event.end, basicEvents);
          let className = userRole === "teacher" ? "teacher" : "student";
          className += ` event-${eventType}`;

          return {
            ...event,
            className: className,
            eventType: eventType,
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
      // Clicked on an existing event - edit mode
      setSelectedEvent(event);
      setModalMode("edit");
    } else {
      // Clicked on empty slot or button - create mode
      setSelectedEvent(null);
      setModalMode("create");
    }
    setShowModal(true);
  };

  const handleCloseModal = () => {
    setShowModal(false);
    setSelectedEvent(null);
    setModalMode("create");
  };

  const handleRefreshEvents = async () => {
    await fetchUserSchedules(userId, userRole);
  };

  // Custom event prop getter để set màu sắc
  const eventStyleGetter = (event: any) => {
    let backgroundColor = "";
    let borderColor = "";
    let textColor = "white";

    switch (event.eventType) {
      case "today":
        backgroundColor = "#52c41a"; // Xanh lá đậm - hôm nay
        borderColor = "#389e0d";
        break;
      case "coming":
        backgroundColor = "#faad14"; // Vàng cam - lịch gần nhất
        borderColor = "#d48806";
        break;
      case "past":
        backgroundColor = "#bfbfbf"; // Xám - đã qua
        borderColor = "#8c8c8c";
        break;
      case "future":
        backgroundColor = "#1890ff"; // Xanh dương - tương lai
        borderColor = "#096dd9";
        break;
      default:
        backgroundColor = userRole === "teacher" ? "#722ed1" : "#13c2c2";
        borderColor = userRole === "teacher" ? "#531dab" : "#08979c";
    }

    return {
      style: {
        backgroundColor,
        borderColor,
        color: textColor,
        border: `2px solid ${borderColor}`,
        borderRadius: "4px",
        fontSize: "12px",
        fontWeight: "500",
        boxShadow:
          event.eventType === "today" || event.eventType === "coming"
            ? `0 0 10px ${backgroundColor}40`
            : "none",
      },
    };
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-blue-100 dark:from-slate-900 dark:to-slate-800 py-4 px-2 sm:px-4 md:px-8 lg:px-16 xl:px-32">
      <div className="max-w-[1600px] mx-auto">
        <h2 className="text-3xl md:text-4xl font-extrabold text-center text-blue-600 dark:text-blue-300 mb-4 tracking-tight drop-shadow-lg">
          Lịch học
        </h2>
        {error && (
          <Alert
            type="error"
            message={error}
            showIcon
            style={{ marginBottom: 16 }}
          />
        )}

        <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl p-2 sm:p-4 md:p-6 lg:p-8 transition-all duration-300">
          {/* Add button */}
          <div className="mb-4 flex flex-col sm:flex-row gap-2 sm:gap-0 justify-between items-center">
            <div className="flex-1"></div>
            {userRole === "teacher" && (
              <Button
                type="primary"
                onClick={() => handleOpenModal()}
                className="!bg-gradient-to-r !from-blue-500 !to-cyan-400 !border-none !shadow-lg !rounded-full !px-6 !py-2 !text-base !font-semibold hover:!from-blue-600 hover:!to-cyan-500 transition-all duration-200"
                size="large"
              >
                <span className="inline-flex items-center gap-2">
                  <svg width="20" height="20" fill="none" viewBox="0 0 24 24"><path stroke="#fff" strokeWidth="2" d="M12 5v14m7-7H5" strokeLinecap="round"/></svg>
                  Thêm lịch mới
                </span>
              </Button>
            )}
          </div>

          <div className="calendar-wrapper rounded-xl overflow-hidden border border-blue-100 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-md transition-all duration-300">
            <Calendar
              localizer={localizer}
              events={events}
              startAccessor="start"
              endAccessor="end"
              style={{ minHeight: 800, height: 640, width: '100%' }}
              views={[Views.MONTH, Views.WEEK, Views.DAY, Views.AGENDA]}
              view={currentView}
              date={currentDate}
              onView={(view) => setCurrentView(view)}
              onNavigate={(date) => setCurrentDate(date)}
              selectable={userRole === "teacher"}
              onSelectSlot={handleOpenModal}
              onSelectEvent={handleOpenModal}
              eventPropGetter={eventStyleGetter}
              formats={{
                timeGutterFormat: "HH:mm",
                eventTimeRangeFormat: ({ start, end }) =>
                  `${moment(start).format(FORMAT_TIME_12H)} - ${moment(end).format(FORMAT_TIME_12H)}`,
                dayFormat: (date: Date) => moment(date).format("DD/MM"),
                weekdayFormat: vietnameseWeekdayFormat,
                monthHeaderFormat: (date: Date) => moment(date).format("MMMM YYYY"),
                dayHeaderFormat: (date: Date) => moment(date).format(FORMAT_DATE),
                dayRangeHeaderFormat: ({ start, end }) =>
                  `${moment(start).format("DD/MM")} - ${moment(end).format(FORMAT_DATE)}`,
                agendaDateFormat: (date: Date) => moment(date).format(FORMAT_DATE),
                agendaTimeFormat: (date: Date) => moment(date).format(FORMAT_TIME_12H),
                agendaTimeRangeFormat: ({ start, end }) =>
                  `${moment(start).format(FORMAT_TIME_12H)} - ${moment(end).format(FORMAT_TIME_12H)}`,
              }}
              messages={{
                next: "Tiếp theo",
                previous: "Trước đó",
                today: "Hôm nay",
                month: "Tháng",
                week: "Tuần",
                day: "Ngày",
                agenda: "Chương trình",
                date: "Ngày",
                time: "Thời gian",
                event: "Sự kiện",
                noEventsInRange: "Không có sự kiện nào trong khoảng thời gian này.",
                showMore: (total: number) => `+ Xem thêm ${total} sự kiện`,
              }}
              popup={true}
              step={30}
              timeslots={2}
              min={new Date(2025, 0, 1, 6, 0, 0)}
              max={new Date(2025, 0, 1, 22, 0, 0)}
              components={{
                month: {
                  event: ({ event }) => (
                    <div className="rbc-event-content flex flex-col gap-1">
                      <div className="flex items-center gap-1">
                        {(event.eventType === "today" || event.eventType === "coming") && (
                          <div className="w-2 h-2 rounded-full bg-white mr-1 animate-pulse"></div>
                        )}
                        <strong className="text-xs text-blue-700 dark:text-blue-200">
                          {moment(event.start).format(FORMAT_TIME_12H)}
                        </strong>
                      </div>
                      <div className="text-xs mt-0.5 line-clamp-2 font-semibold text-gray-700 dark:text-gray-200">{event.title}</div>
                      {event.eventType === "coming" && (
                        <div className="text-xs mt-0.5 opacity-90 text-orange-500">📅 Sắp tới</div>
                      )}
                    </div>
                  ),
                },
                week: {
                  event: ({ event }) => (
                    <div className="rbc-event-content p-1 flex flex-col gap-0.5">
                      <div className="flex items-center gap-1">
                        {(event.eventType === "today" || event.eventType === "coming") && (
                          <div className="w-2 h-2 rounded-full bg-white mr-1 animate-pulse"></div>
                        )}
                        <span className="text-xs font-semibold text-blue-700 dark:text-blue-200">{event.title}</span>
                        {event.eventType === "coming" && (
                          <span className="ml-1 text-xs text-orange-500">📅</span>
                        )}
                      </div>
                    </div>
                  ),
                },
                day: {
                  event: ({ event }) => (
                    <div className="rbc-event-content p-2 flex flex-col gap-1">
                      <div className="flex items-center mb-1 gap-2">
                        {(event.eventType === "today" || event.eventType === "coming") && (
                          <div className="w-2 h-2 rounded-full bg-white mr-2 animate-pulse"></div>
                        )}
                        <span className="font-semibold text-blue-700 dark:text-blue-200">{event.title}</span>
                        {event.eventType === "coming" && (
                          <span className="ml-2 text-sm text-orange-500">📅 Sắp tới</span>
                        )}
                      </div>
                      {event.description && (
                        <div className="text-xs opacity-90 mt-1 text-gray-600 dark:text-gray-300">
                          {event.description}
                        </div>
                      )}
                    </div>
                  ),
                },
              }}
            />
          </div>

          {/* Status-based colors */}
          <div className="space-y-2 mt-4 flex flex-wrap items-center justify-center gap-4 md:gap-8">
            <div className="flex items-center">
              <div className="w-4 h-4 rounded bg-green-500 mr-2 shadow-lg border border-green-700"></div>
              <span className="text-sm text-gray-700 dark:text-gray-200 font-medium">Hôm nay</span>
            </div>
            <div className="flex items-center">
              <div className="w-4 h-4 rounded bg-orange-400 mr-2 shadow-lg border border-orange-600"></div>
              <span className="text-sm text-gray-700 dark:text-gray-200 font-medium">Lịch gần nhất</span>
            </div>
            <div className="flex items-center">
              <div className="w-4 h-4 rounded bg-blue-500 mr-2 border border-blue-700"></div>
              <span className="text-sm text-gray-700 dark:text-gray-200">Tương lai</span>
            </div>
            <div className="flex items-center">
              <div className="w-4 h-4 rounded bg-gray-400 mr-2 border border-gray-600"></div>
              <span className="text-sm text-gray-700 dark:text-gray-200">Đã qua</span>
            </div>
          </div>
        </div>

        <ScheduleEventModal
          open={showModal}
          onClose={handleCloseModal}
          mode={modalMode}
          userRole={userRole}
          userClasses={userClasses}
          selectedEvent={selectedEvent}
          onRefreshEvents={handleRefreshEvents}
        />
      </div>
    </div>
  );
}

export default SchedulePage;
