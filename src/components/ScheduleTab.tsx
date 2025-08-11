
import { useState, useEffect } from "react";
import { doc, deleteDoc, collection, query, where, getDocs } from "firebase/firestore";
import { db } from "@/firebase/firebase";
import { Button, Popconfirm, message, Tooltip } from "antd";
import { CalendarOutlined, EditOutlined, DeleteOutlined, PlusOutlined, ScheduleOutlined, ClockCircleOutlined } from "@ant-design/icons";
import ScheduleEventModal from "@/components/ScheduleEventModal";
import CheckinModal from "@/components/CheckinModal";
import { getSessionDates } from "@/components/CheckinModal";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import isBetween from "dayjs/plugin/isBetween";
import "dayjs/locale/vi";

import { FORMAT_DATE } from "@/constants";
import { RecurrenceType } from "@/assets/enums";
import { ScheduleStatus } from "@/assets/enums/schedule";
import type { StatusConfig } from "@/assets/enums/schedule";

dayjs.extend(relativeTime);
dayjs.extend(isBetween);
dayjs.locale("vi");

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
    id: string;
    name: string;
    teacherId: string;
    studentIds?: string[];
    // [key: string]: any; // Removed for type safety
  };
  onShowMessage?: (type: 'success' | 'error', message: string) => void;
}

// Helper để format recurrence info
const formatRecurrenceInfo = (schedule: ScheduleEvent, recurringCount: number) => {
  if (schedule.recurrence === RecurrenceType.WEEKLY) {
    const daysMap = ["Chủ nhật", "Thứ 2", "Thứ 3", "Thứ 4", "Thứ 5", "Thứ 6", "Thứ 7"];
    const days = (schedule.weeklyDays || []).map((d: number) => daysMap[d]).join(", ");
    return `Hàng tuần (${days}) đến hết ${dayjs(schedule.recurrenceEnd).format(FORMAT_DATE)} (${recurringCount} buổi)`;
  }
  if (schedule.recurrence === RecurrenceType.MONTHLY) {
    return `Hàng tháng (Ngày ${schedule.monthlyDay}) đến hết ${dayjs(schedule.recurrenceEnd).format(FORMAT_DATE)} (${recurringCount} buổi)`;
  }
  // Nếu không lặp thì không trả về tag gì cả
  return "";
};


// Helper để kiểm tra status của schedule, thêm trạng thái 'today' nếu có session hôm nay
const getScheduleStatus = (schedule: ScheduleEvent): ScheduleStatus => {
  const now = dayjs();
  const startTime = dayjs(schedule.start);
  const endTime = schedule.recurrenceEnd ? dayjs(schedule.recurrenceEnd) : dayjs(schedule.end);

  // Lấy tất cả các ngày diễn ra session
  const sessionDates = (typeof schedule.start === 'object' && schedule.recurrence)
    ? getSessionDates(schedule)
    : [schedule.start];

  // Nếu có session diễn ra hôm nay
  if (sessionDates.some(date => dayjs(date).isSame(now, 'day'))) {
    return ScheduleStatus.TODAY;
  }

  // Kiểm tra nếu đang trong thời gian diễn ra
  if (now.isBetween(startTime, endTime, null, '[]')) {
    return ScheduleStatus.ONGOING;
  }

  // Kiểm tra nếu sắp diễn ra (trong vòng 24 giờ tới)
  if (startTime.isAfter(now) && startTime.diff(now, 'hours') <= 24) {
    return ScheduleStatus.UPCOMING;
  }

  // Kiểm tra nếu đã kết thúc
  if (endTime.isBefore(now)) {
    return ScheduleStatus.COMPLETED;
  }

  // Còn lại là scheduled (đã lên lịch nhưng chưa tới)
  return ScheduleStatus.SCHEDULED;
};

const getStatusConfig = (status: ScheduleStatus): StatusConfig => {
  switch (status) {
    case ScheduleStatus.TODAY:
      return {
        text: 'Diễn ra ngày hôm nay',
        className: 'bg-lime-100 text-lime-800 border-lime-200',
        iconColor: 'text-lime-600',
        cardBorder: 'border-lime-200',
        leftBorder: 'bg-lime-500'
      };
    case ScheduleStatus.ONGOING:
      return {
        text: 'Đang diễn ra',
        className: 'bg-green-100 text-green-800 border-green-200',
        iconColor: 'text-green-600',
        cardBorder: 'border-green-200',
        leftBorder: 'bg-green-500'
      };
    case ScheduleStatus.UPCOMING:
      return {
        text: 'Sắp diễn ra',
        className: 'bg-orange-100 text-orange-800 border-orange-200',
        iconColor: 'text-orange-600',
        cardBorder: 'border-orange-200',
        leftBorder: 'bg-orange-500'
      };
    case ScheduleStatus.COMPLETED:
      return {
        text: 'Đã kết thúc',
        className: 'bg-gray-100 text-gray-600 border-gray-200',
        iconColor: 'text-gray-500',
        cardBorder: 'border-gray-200',
        leftBorder: 'bg-gray-400'
      };
    default:
      return {
        text: 'Đã lên lịch',
        className: 'bg-blue-100 text-blue-800 border-blue-200',
        iconColor: 'text-blue-600',
        cardBorder: 'border-blue-200',
        leftBorder: 'bg-blue-500'
      };
  }
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
  const [showCheckinModal, setShowCheckinModal] = useState(false);
  const [checkinSchedule, setCheckinSchedule] = useState<ScheduleEvent | null>(null);
  const handleOpenCheckinModal = (schedule: ScheduleEvent) => {
    setCheckinSchedule(schedule);
    setShowCheckinModal(true);
  };

  const handleCloseCheckinModal = () => {
    setShowCheckinModal(false);
    setCheckinSchedule(null);
  };

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
            recurrence: data.recurrence || RecurrenceType.NONE,
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
          {parentSchedules.map((schedule) => {
            const status = getScheduleStatus(schedule);
            const statusConfig = getStatusConfig(status);
            return (
              <div
                key={schedule.id}
                className={`bg-white border rounded-lg px-6 py-4 shadow-sm group hover:shadow-md transition-shadow duration-200 ${statusConfig.cardBorder}`}
              >
                <div className="flex flex-row items-center w-full">
                  {/* Left border for both rows */}
                  <div className={`w-1 h-12 rounded ${statusConfig.leftBorder} mr-4`} />
                  <div className="flex flex-col flex-1 min-w-0">
                    {/* Row 1: Title + status + actions */}
                    <div className="flex items-center justify-between w-full">
                      <div className="flex items-center min-w-0">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="font-semibold text-lg text-left truncate max-w-xs">{schedule.title}</div>
                          <Tooltip
                            title={
                              status === ScheduleStatus.UPCOMING
                                ? `Bắt đầu sau ${dayjs(schedule.start).fromNow()}`
                                : status === ScheduleStatus.ONGOING
                                ? `Kết thúc ${dayjs(schedule.recurrenceEnd || schedule.end).fromNow()}`
                                : undefined
                            }
                            placement="top"
                          >
                            <span className={`px-2 py-1 rounded-full text-xs font-medium border ${statusConfig.className}`}>
                              {statusConfig.text}
                            </span>
                          </Tooltip>
                        </div>
                      </div>
                      {/* Action buttons - only show on hover */}
                      <div className="flex items-center space-x-2 ml-4 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                        {userRole === "teacher" && classData.teacherId === userId && (
                          <>
                            <Button
                              icon={<EditOutlined />}
                              size="small"
                              onClick={() => handleEditSchedule(schedule)}
                              title="Chỉnh sửa lịch học"
                            />
                            <Button
                              icon={<ScheduleOutlined className="text-lime-600" />}
                              size="small"
                              onClick={() => handleOpenCheckinModal(schedule)}
                              title="Điểm danh"
                              style={{ color: '#65a30d' }}
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
                          </>
                        )}
                        {userRole !== "teacher" && (
                          <Button
                            icon={<ScheduleOutlined className="text-lime-600" />}
                            size="small"
                            onClick={() => handleOpenCheckinModal(schedule)}
                            title="Xem điểm danh"
                            style={{ color: '#65a30d' }}
                          />
                        )}
                      </div>
                    </div>
                    {/* Row 2: Class name and time info (full width) */}
                    <div className="mt-2 flex flex-wrap items-center gap-4 w-full">
                      <div className="text-gray-500 text-sm text-left min-w-0 truncate">{classData.name}</div>
                      <div className="flex items-center space-x-3 flex-wrap">
                        <span className={`flex items-center ${statusConfig.iconColor}`}>
                          <CalendarOutlined className="mr-1" />
                          {dayjs(schedule.start).format(FORMAT_DATE)}
                        </span>
                        <span className={`flex items-center ${statusConfig.iconColor}`}>
                          <ClockCircleOutlined className="mr-1" />
                          {dayjs(schedule.start).format("HH:mm")} - {dayjs(schedule.end).format("HH:mm")}
                        </span>
                        {formatRecurrenceInfo(schedule, recurringCounts[schedule.id] || 1) && (
                          <span>
                            <span className="bg-gray-100 px-2 py-1 rounded text-xs font-medium text-gray-700">
                              {formatRecurrenceInfo(schedule, recurringCounts[schedule.id] || 1)}
                            </span>
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
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

      {/* Checkin Modal */}
      {showCheckinModal && checkinSchedule && (
        <CheckinModal
          open={showCheckinModal}
          onClose={handleCloseCheckinModal}
          schedule={checkinSchedule}
          classId={classId}
          classData={classData}
          userRole={userRole}
        />
      )}
    </div>
  );
}

export default ScheduleTab;
