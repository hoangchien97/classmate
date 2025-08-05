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
        {/* Add button */}
        <div className="mb-4 flex justify-end">
          {userRole === "teacher" && (
            <Button type="primary" onClick={() => handleOpenModal()}>
              Thêm lịch mới
            </Button>
          )}
        </div>

        <Calendar
          localizer={localizer}
          events={events}
          startAccessor="start"
          endAccessor="end"
          style={{ height: 600 }}
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
              `${moment(start).format(FORMAT_TIME_12H)} - ${moment(end).format(
                FORMAT_TIME_12H
              )}`,
            dayFormat: (date: Date) => moment(date).format("DD/MM"),
            weekdayFormat: (date: Date) => moment(date).format("dddd"),
            monthHeaderFormat: (date: Date) => moment(date).format("MMMM YYYY"),
            dayHeaderFormat: (date: Date) => moment(date).format(FORMAT_DATE),
            dayRangeHeaderFormat: ({ start, end }) =>
              `${moment(start).format("DD/MM")} - ${moment(end).format(
                FORMAT_DATE
              )}`,
            agendaDateFormat: (date: Date) => moment(date).format(FORMAT_DATE),
            agendaTimeFormat: (date: Date) =>
              moment(date).format(FORMAT_TIME_12H),
            agendaTimeRangeFormat: ({ start, end }) =>
              `${moment(start).format(FORMAT_TIME_12H)} - ${moment(end).format(
                FORMAT_TIME_12H
              )}`,
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
                <div className="rbc-event-content">
                  <div className="flex items-center">
                    {(event.eventType === "today" ||
                      event.eventType === "coming") && (
                      <div className="w-2 h-2 rounded-full bg-white mr-1 animate-pulse"></div>
                    )}
                    <strong className="text-xs">
                      {moment(event.start).format(FORMAT_TIME_12H)}
                    </strong>
                  </div>
                  <div className="text-xs mt-1 line-clamp-2">{event.title}</div>
                  {event.eventType === "coming" && (
                    <div className="text-xs mt-1 opacity-90">📅 Sắp tới</div>
                  )}
                </div>
              ),
            },
            week: {
              event: ({ event }) => (
                <div className="rbc-event-content p-1">
                  <div className="flex items-center">
                    {(event.eventType === "today" ||
                      event.eventType === "coming") && (
                      <div className="w-2 h-2 rounded-full bg-white mr-1 animate-pulse"></div>
                    )}
                    <span className="text-xs font-medium">{event.title}</span>
                    {event.eventType === "coming" && (
                      <span className="ml-1 text-xs">📅</span>
                    )}
                  </div>
                </div>
              ),
            },
            day: {
              event: ({ event }) => (
                <div className="rbc-event-content p-2">
                  <div className="flex items-center mb-1">
                    {(event.eventType === "today" ||
                      event.eventType === "coming") && (
                      <div className="w-2 h-2 rounded-full bg-white mr-2 animate-pulse"></div>
                    )}
                    <span className="font-medium">{event.title}</span>
                    {event.eventType === "coming" && (
                      <span className="ml-2 text-sm">📅 Sắp tới</span>
                    )}
                  </div>
                  {event.description && (
                    <div className="text-xs opacity-90 mt-1">
                      {event.description}
                    </div>
                  )}
                </div>
              ),
            },
          }}
        />

        {/* Status-based colors */}
        <div className="space-y-2 mt-4 flex items-center justify-center">
          <div className="flex gap-6">
            <div className="flex items-center">
              <div className="w-4 h-4 rounded bg-green-500 mr-2 shadow-lg"></div>
              <span className="text-sm text-gray-600 font-medium">Hôm nay</span>
            </div>
            <div className="flex items-center">
              <div className="w-4 h-4 rounded bg-orange-400 mr-2 shadow-lg"></div>
              <span className="text-sm text-gray-600 font-medium">
                Lịch gần nhất
              </span>
            </div>
            <div className="flex items-center">
              <div className="w-4 h-4 rounded bg-blue-500 mr-2"></div>
              <span className="text-sm text-gray-600">Tương lai</span>
            </div>
            <div className="flex items-center">
              <div className="w-4 h-4 rounded bg-gray-400 mr-2"></div>
              <span className="text-sm text-gray-600">Đã qua</span>
            </div>
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
  );
}

export default SchedulePage;
