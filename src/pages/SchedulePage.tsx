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
import { Calendar, momentLocalizer } from "react-big-calendar";
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
          const recurrenceEnd = data?.recurrenceEnd ? data?.recurrenceEnd?.toDate() : null;
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
    if (event) {
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
    } else {
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
          localizer={localizer}
          events={events}
          startAccessor="start"
          endAccessor="end"
          style={{ height: 600 }}
          views={["month", "week", "day"]}
          defaultView="month"
          selectable={userRole === "teacher"}
          onSelectSlot={handleOpenModal}
          onSelectEvent={handleOpenModal}
          eventPropGetter={(event: any) => ({
            className: event.className,
          })}
          formats={{
            timeGutterFormat: "HH:mm",
            eventTimeRangeFormat: ({ start, end }) =>
              `${moment(start).format("HH:mm")} - ${moment(end).format(
                "HH:mm"
              )}`,
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
