import React, { useEffect, useState } from "react";
import {
  Modal,
  Table,
  Checkbox,
  Button,
  message,
  Input,
  DatePicker,
  Space,
} from "antd";
import {
  collection,
  getDocs,
  setDoc,
  doc,
  query,
  where,
  getDoc,
} from "firebase/firestore";
import { db } from "@/firebase/firebase";
import dayjs from "dayjs";

interface Student {
  id: string;
  name?: string;
  email?: string;
}

interface CheckinModalProps {
  open: boolean;
  onClose: () => void;
  schedule: any;
  classId: string;
  classData?: { studentIds?: string[] };
}

// Lấy danh sách các session (ngày) của lịch học
const getSessionDates = (schedule: any) => {
  const dates: Date[] = [];
  if (schedule.recurrence === "weekly") {
    let current = dayjs(schedule.start);
    const end = dayjs(schedule.recurrenceEnd);
    while (current.isBefore(end) || current.isSame(end, "day")) {
      if (schedule.weeklyDays.includes(current.day())) {
        dates.push(current.toDate());
      }
      current = current.add(1, "day");
    }
  } else if (schedule.recurrence === "monthly") {
    let current = dayjs(schedule.start);
    const end = dayjs(schedule.recurrenceEnd);
    while (current.isBefore(end) || current.isSame(end, "day")) {
      if (current.date() === schedule.monthlyDay) {
        dates.push(current.toDate());
      }
      current = current.add(1, "day");
    }
  } else {
    dates.push(schedule.start);
  }
  return dates;
};

const CheckinModal: React.FC<CheckinModalProps> = ({
  open,
  onClose,
  schedule,
  classId,
  classData,
}) => {
  const [students, setStudents] = useState<Student[]>([]);
  const [checkins, setCheckins] = useState<{
    [studentId: string]: { [date: string]: boolean };
  }>({});
  const [loading, setLoading] = useState(false);
  const [searchText, setSearchText] = useState("");
  const [dateRange, setDateRange] = useState<
    [dayjs.Dayjs | null, dayjs.Dayjs | null]
  >([null, null]);
  const sessionDates = getSessionDates(schedule);

  useEffect(() => {
    if (open) fetchStudentsByIds();
    // eslint-disable-next-line
  }, [open, classData?.studentIds]);

  // Fetch students theo studentIds của classData
  const fetchStudentsByIds = async () => {
    if (!classData?.studentIds || classData.studentIds.length === 0) {
      setStudents([]);
      return;
    }
    const studentsData = await Promise.all(
      classData.studentIds.map(async (id) => {
        const studentDoc = await getDoc(doc(db, "users", id));
        if (studentDoc.exists()) {
          const data = studentDoc.data();
          return {
            id,
            name: data.name || "",
            email: data.email || "",
          };
        }
        return null;
      })
    );
    const validStudents = studentsData.filter((s): s is Student => s !== null);
    setStudents(validStudents);
    // Load checkin cũ nếu có
    const checkinQ = query(
      collection(db, "checkins"),
      where("scheduleId", "==", schedule.id)
    );
    const checkinSnap = await getDocs(checkinQ);
    const checkinData: any = {};
    checkinSnap.forEach((doc) => {
      const d = doc.data();
      if (!checkinData[d.studentId]) checkinData[d.studentId] = {};
      checkinData[d.studentId][d.sessionDate] = d.checked;
    });
    setCheckins(checkinData);
  };

  const handleCheck = (studentId: string, date: string, checked: boolean) => {
    setCheckins((prev) => ({
      ...prev,
      [studentId]: {
        ...prev[studentId],
        [date]: checked,
      },
    }));
  };

  // Xác định ngày session đang active (chỉ cho phép checkin ngày này)
  const getActiveSessionDate = () => {
    const now = dayjs();
    for (const date of sessionDates) {
      const start = dayjs(date).startOf('day').add(dayjs(schedule.start).hour(), 'hour').add(dayjs(schedule.start).minute(), 'minute');
      const end = dayjs(date).startOf('day').add(dayjs(schedule.end).hour(), 'hour').add(dayjs(schedule.end).minute(), 'minute');
      if (now.isAfter(start) && now.isBefore(end) || now.isSame(start) || now.isSame(end)) {
        return date;
      }
    }
    return null;
  };

  const handleSave = async () => {
    setLoading(true);
    try {
      const activeDate = getActiveSessionDate();
      if (!activeDate) {
        message.warning("Chỉ có thể lưu điểm danh cho buổi học đang diễn ra!");
        setLoading(false);
        return;
      }
      const promises = students.map((student) => {
        const checked = checkins[student.id]?.[activeDate.toISOString()] || false;
        return setDoc(
          doc(
            db,
            "checkins",
            `${schedule.id}_${student.id}_${activeDate.toISOString()}`
          ),
          {
            scheduleId: schedule.id,
            studentId: student.id,
            sessionDate: activeDate.toISOString(),
            checked,
            createdAt: new Date().toISOString(),
          },
          { merge: true }
        );
      });
      await Promise.all(promises);
      message.success("Lưu điểm danh thành công!");
      onClose();
    } catch (e) {
      message.error("Lỗi khi lưu điểm danh!");
    } finally {
      setLoading(false);
    }
  };

  // Filter sessionDates theo dateRange
  const filteredSessionDates = sessionDates.filter((date) => {
    if (!dateRange[0] && !dateRange[1]) return true;
    const d = dayjs(date);
    if (dateRange[0] && d.isBefore(dateRange[0], "day")) return false;
    if (dateRange[1] && d.isAfter(dateRange[1], "day")) return false;
    return true;
  });

  const columns = [
    {
      title: "STT",
      dataIndex: "stt",
      render: (_: unknown, __: unknown, idx: number) => idx + 1,
    },
    {
      title: "Tên học sinh",
      dataIndex: "name",
      render: (_: any, record: Student) => <span>{record.name || ""}</span>,
    },
    {
      title: "Email",
      dataIndex: "email",
      render: (_: any, record: Student) => <span>{record.email || ""}</span>,
    },
    ...filteredSessionDates.map((date) => {
      const now = dayjs();
      const start = dayjs(date).startOf('day').add(dayjs(schedule.start).hour(), 'hour').add(dayjs(schedule.start).minute(), 'minute');
      const end = dayjs(date).startOf('day').add(dayjs(schedule.end).hour(), 'hour').add(dayjs(schedule.end).minute(), 'minute');
      // Chỉ cho phép checkin nếu now nằm trong khoảng start-end
      const isActive = now.isAfter(start) && now.isBefore(end) || now.isSame(start) || now.isSame(end);
      return {
        title: (
          <div className={isActive ? "bg-yellow-100 rounded px-1" : undefined}>
            {dayjs(date).format("DD/MM/YYYY")}
          </div>
        ),
        dataIndex: dayjs(date).format("YYYY-MM-DD"),
        render: (_: unknown, record: Student) => (
          <Checkbox
            checked={checkins[record.id]?.[date.toISOString()] || false}
            onChange={(e) =>
              handleCheck(record.id, date.toISOString(), e.target.checked)
            }
            disabled={!isActive}
          />
        ),
      };
    })
  ];

  // Filter students theo searchText
  const filteredStudents = students.filter((s) =>
    s.name?.toLowerCase().includes(searchText.toLowerCase())
  );

  // Thông tin session chung
  let sessionInfo = "";
  if (schedule.recurrence === "weekly") {
    const daysMap = ["Chủ nhật", "Thứ 2", "Thứ 3", "Thứ 4", "Thứ 5", "Thứ 6", "Thứ 7"];
    const days = (schedule.weeklyDays || []).map((d: number) => daysMap[d]).join(", ");
    sessionInfo = `Hàng tuần (${days})`;
  } else if (schedule.recurrence === "monthly") {
    sessionInfo = `Hàng tháng (Ngày ${schedule.monthlyDay})`;
  } else {
    sessionInfo = "Một lần";
  }
  const timeInfo = `${dayjs(schedule.start).format("HH:mm")} - ${dayjs(schedule.end).format("HH:mm")}`;

  return (
    <Modal
      open={open}
      onCancel={onClose}
      centered
      title={`Điểm danh: ${schedule.title}`}
      width={1200}
      footer={[
        <Button key="cancel" onClick={onClose}>
          Hủy
        </Button>,
        <Button
          key="save"
          type="primary"
          loading={loading}
          onClick={handleSave}
        >
          Lưu
        </Button>,
      ]}
    >
      <div className="mb-2 text-sm text-gray-600">
        <span className="font-medium">Thời gian:</span> {timeInfo} &nbsp;|&nbsp; <span className="font-medium">Lặp lại:</span> {sessionInfo}
      </div>
      <Space style={{ marginBottom: 16 }} direction="horizontal" wrap>
        <Input.Search
          placeholder="Tìm tên học sinh"
          allowClear
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          style={{ width: 220 }}
        />
        <DatePicker.RangePicker
          value={dateRange}
          onChange={(v) => {
            if (!v) {
              setDateRange([null, null]);
            } else {
              setDateRange(v as [dayjs.Dayjs | null, dayjs.Dayjs | null]);
            }
          }}
          format="DD/MM/YYYY"
          style={{ width: 260 }}
        />
      </Space>
      <div style={{ overflowX: 'auto' }}>
        <Table
          dataSource={filteredStudents}
          columns={columns}
          rowKey="id"
          pagination={false}
          bordered
          size="small"
          locale={{ emptyText: "Không có học sinh" }}
        />
      </div>
    </Modal>
  );
};

export default CheckinModal;
