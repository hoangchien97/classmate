import { useState, useEffect } from "react";
import { doc, deleteDoc, collection, query, where, getDocs } from "firebase/firestore";
import { db } from "@/firebase/firebase";
import { Button, Popconfirm, message } from "antd";
import { CalendarOutlined, EditOutlined, DeleteOutlined, PlusOutlined, ScheduleOutlined } from "@ant-design/icons";
import ScheduleEventModal from "@/components/ScheduleEventModal";
import moment from "moment";
import { FORMAT_DATE } from "@/constants";

interface ScheduleEvent {
  weeklyDays: number[];
  monthlyDay: number;
  id: string;
  title: string;
  start: Date;
  end: Date;
  description?: string;
  classId: string;
  teacherId: string;
  recurrence?: string;
  recurrenceEnd?: Date;
  parentId?: string;
}

interface ScheduleTabProps {
  classId: string;
  userRole: string;
  userId: string;
  classData: {
    name: string;
    teacherId: string;
  };
  onShowMessage?: (type: 'success' | 'error', message: string) => void;
}

// Helper để format recurrence info
const formatRecurrenceInfo = (schedule: ScheduleEvent, recurringCount: number) => {
  if (schedule.recurrence === "weekly") {
    const daysMap = ["Chủ nhật", "Thứ 2", "Thứ 3", "Thứ 4", "Thứ 5", "Thứ 6", "Thứ 7"];
    const days = (schedule.weeklyDays || []).map((d: number) => daysMap[d]).join(", ");
    return `Hàng tuần (${days}) đến hết ${moment(schedule.recurrenceEnd).format(FORMAT_DATE)} (${recurringCount} buổi)`;
  }
  if (schedule.recurrence === "monthly") {
    return `Hàng tháng (Ngày ${schedule.monthlyDay}) đến hết ${moment(schedule.recurrenceEnd).format(FORMAT_DATE)} (${recurringCount} buổi)`;
  }
  return "Một lần";
};

// Lấy số lượng bản ghi con (sessions) cho mỗi lịch gốc
const getRecurringCount = async (parentId: string) => {
  const recurringQuery = query(
    collection(db, "schedules"),
    where("parentId", "==", parentId)
  );
  const recurringSnapshot = await getDocs(recurringQuery);
  return recurringSnapshot.docs.length + 1; // +1 cho bản ghi gốc
};

function ScheduleTab({ classId, userRole, userId, classData, onShowMessage }: ScheduleTabProps) {
  const [classSchedules, setClassSchedules] = useState<ScheduleEvent[]>([]);
  const [parentSchedules, setParentSchedules] = useState<ScheduleEvent[]>([]);
  const [recurringCounts, setRecurringCounts] = useState<{[id: string]: number}>({});
  const [selectedSchedule, setSelectedSchedule] = useState<ScheduleEvent | null>(null);
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchClassSchedules();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classId]);

  // Chỉ lấy các bản ghi gốc (parentId === id)
  useEffect(() => {
    const fetchParentSchedules = async () => {
      const parents = classSchedules.filter(s => !s.parentId || s.parentId === s.id);
      setParentSchedules(parents);

      // Lấy số lượng sessions cho từng lịch gốc
      const counts: {[id: string]: number} = {};
      for (const schedule of parents) {
        counts[schedule.id] = await getRecurringCount(schedule.id);
      }
      setRecurringCounts(counts);
    };
    fetchParentSchedules();
  }, [classSchedules]);

  const fetchClassSchedules = async () => {
    try {
      setLoading(true);
      const schedulesQuery = query(
        collection(db, "schedules"),
        where("classId", "==", classId)
      );
      const querySnapshot = await getDocs(schedulesQuery);
      // Chỉ lấy các bản ghi gốc: parentId === id
      const schedulesData = querySnapshot.docs
        .map((doc) => {
          const data = doc.data();
          return {
            id: doc.id,
            title: data.title,
            start: data.start.toDate(),
            end: data.end.toDate(),
            description: data.description || "",
            classId: data.classId,
            teacherId: data.teacherId,
            recurrence: data.recurrence || "none",
            recurrenceEnd: data.recurrenceEnd ? data.recurrenceEnd.toDate() : null,
            parentId: data.parentId || doc.id,
            weeklyDays: data.weeklyDays || [],
            monthlyDay: data.monthlyDay || 1,
          };
        })
        .filter((schedule) => schedule.parentId === schedule.id); // chỉ lấy lịch gốc

      // Sort by start date
      schedulesData.sort((a, b) => a.start.getTime() - b.start.getTime());
      setClassSchedules(schedulesData);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : "Lỗi không xác định";
      message.error(`Lỗi khi tải lịch học: ${errorMessage}`);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenScheduleModal = () => {
    setSelectedSchedule(null); // reset về create mode
    setShowScheduleModal(true);
  };

  const handleCloseScheduleModal = () => {
    setShowScheduleModal(false);
    setSelectedSchedule(null);
  };

  const handleRefreshSchedules = async () => {
    await fetchClassSchedules();
  };

  const handleEditSchedule = (schedule: ScheduleEvent) => {
    setSelectedSchedule(schedule);
    setShowScheduleModal(true);
  };

  const handleDeleteSchedule = async (schedule: ScheduleEvent) => {
    try {
      // Xóa bản ghi gốc
      await deleteDoc(doc(db, "schedules", schedule.id));
      // Xóa các bản ghi con
      const recurringQuery = query(
        collection(db, "schedules"),
        where("parentId", "==", schedule.id)
      );
      const recurringSnapshot = await getDocs(recurringQuery);
      const deletePromises = recurringSnapshot.docs.map((doc) => deleteDoc(doc.ref));
      if (deletePromises.length > 0) await Promise.all(deletePromises);

      onShowMessage?.('success', "Đã xóa lịch học và các buổi lặp lại!");
      await handleRefreshSchedules();
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : "Lỗi không xác định";
      onShowMessage?.('error', "Lỗi khi xóa lịch học: " + errorMessage);
    }
  };

  if (loading) {
    return <div>Đang tải lịch học...</div>;
  }

  return (
    <div>
      
      {/* Header */}
      <div className="mb-4 flex justify-between items-center">
        <h3 className="text-lg font-medium">Lịch học cho {classData.name}</h3>
        {userRole === "teacher" && classData.teacherId === userId && (
          <Button
            type="primary"
            icon={<CalendarOutlined />}
            onClick={handleOpenScheduleModal}
            className="font-semibold"
          >
            Thêm lịch học
          </Button>
        )}
      </div>

      {/* Schedules List */}
      {parentSchedules.length > 0 ? (
        <div className="space-y-4">
          {parentSchedules.map((schedule) => (
            <div
              key={schedule.id}
              className="flex items-center justify-between bg-white border rounded-lg px-6 py-4 shadow-sm group"
            >
              <div className="flex items-center">
                <div className="w-1 h-12 bg-blue-900 rounded mr-4" />
                <div>
                  <div className="font-semibold text-lg text-left">{schedule.title}</div>
                  <div className="text-gray-500 text-sm mb-1 text-left">{classData.name}</div>
                  <div className="flex items-center space-x-3 mb-1">
                    <span className="flex items-center text-gray-700">
                      <CalendarOutlined className="mr-1" />
                      {moment(schedule.start).format(FORMAT_DATE)}
                    </span>
                    <span className="flex items-center text-gray-700">
                      <ScheduleOutlined className="mr-1" />
                      {moment(schedule.start).format("h:mm A")} - {moment(schedule.end).format("h:mm A")}
                    </span>
                    <span>
                      <span className="bg-gray-100 px-2 py-1 rounded text-xs font-medium text-gray-700">
                        {formatRecurrenceInfo(schedule, recurringCounts[schedule.id] || 1)}
                      </span>
                    </span>
                  </div>
                </div>
              </div>
              
              {/* Action buttons - Only for teachers */}
              {userRole === "teacher" && classData.teacherId === userId && (
                <div className="flex items-center space-x-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                  <Button
                    icon={<EditOutlined />}
                    size="small"
                    onClick={() => handleEditSchedule(schedule)}
                    title="Chỉnh sửa lịch học"
                  />
                  <Popconfirm
                    title="Xóa lịch học này và tất cả buổi lặp lại?"
                    description="Hành động này sẽ xóa cả các buổi lặp lại liên quan. Bạn có chắc chắn?"
                    onConfirm={() => handleDeleteSchedule(schedule)}
                    okText="Xóa"
                    cancelText="Hủy"
                    okType="danger"
                  >
                    <Button
                      icon={<DeleteOutlined />}
                      danger
                      size="small"
                      title="Xóa lịch học"
                    />
                  </Popconfirm>
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-8">
          <CalendarOutlined className="text-4xl text-gray-300 mb-4" />
          <p className="text-gray-500 mb-4">Chưa có lịch học nào</p>
          {userRole === "teacher" && classData.teacherId === userId && (
            <Button type="primary" icon={<PlusOutlined />} onClick={handleOpenScheduleModal}>
              Thêm lịch học đầu tiên
            </Button>
          )}
        </div>
      )}

      {/* Schedule Modal */}
      {showScheduleModal && (
        <ScheduleEventModal
          open={showScheduleModal}
          onClose={handleCloseScheduleModal}
          mode={selectedSchedule ? "edit" : "create"}
          userRole={userRole}
          userClasses={[classData]}
          selectedEvent={selectedSchedule}
          onRefreshEvents={handleRefreshSchedules}
        />
      )}
    </div>
  );
}

export default ScheduleTab;
