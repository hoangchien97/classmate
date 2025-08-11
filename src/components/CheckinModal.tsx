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
import { toast } from "react-toastify";
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
  userRole?: string;
  // userId?: string; // Removed unused prop
}

// Lấy danh sách các session (ngày) của lịch học
// Helper: lấy danh sách các session (ngày) của lịch học
export const getSessionDates = (schedule: any) => {
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
  userRole,
}) => {
  const [students, setStudents] = useState<Student[]>([]);
  const [checkins, setCheckins] = useState<{
    [studentId: string]: { [date: string]: boolean };
  }>({});
  const [loading, setLoading] = useState(false);
  const [searchText, setSearchText] = useState("");
  // Ngày điểm danh đang chọn (mặc định hôm nay, phải thuộc sessionDates)
  const allSessionDates = getSessionDates(schedule);
  const today = dayjs();
  // Tìm ngày session gần nhất với hôm nay (nếu hôm nay không thuộc sessionDates)
  const defaultDate = allSessionDates.find(d => dayjs(d).isSame(today, 'day')) || allSessionDates.find(d => dayjs(d).isAfter(today, 'day')) || allSessionDates[0];
  const [selectedDate, setSelectedDate] = useState<dayjs.Dayjs | null>(defaultDate ? dayjs(defaultDate) : null);

  // Filter sessionDates từ đầu đến ngày đã chọn (bao gồm ngày chọn)
  const sessionDates = selectedDate
    ? allSessionDates.filter(d => dayjs(d).isSame(selectedDate, 'day') || dayjs(d).isBefore(selectedDate, 'day'))
    : allSessionDates;

  // Fetch students và checkin của ngày đã chọn
  useEffect(() => {
    // Khi clear date (selectedDate=null), vẫn call fetch để hiển thị lại data cho toàn bộ sessionDates
    if (open) fetchStudentsAndCheckins();
    // eslint-disable-next-line
  }, [open, classData?.studentIds, selectedDate]);

  const fetchStudentsAndCheckins = async () => {
    if (!classData?.studentIds || classData.studentIds.length === 0) {
      setStudents([]);
      setCheckins({});
      return;
    }
    const studentsData = await Promise.all(
      classData.studentIds.map(async (id) => {
        const studentDoc = await getDoc(doc(db, "users", id));
        if (studentDoc.exists()) {
          const data = studentDoc.data();
          // Đảm bảo đúng kiểu Student
          return {
            id: id as string,
            name: typeof data.name === 'string' ? data.name : undefined,
            email: typeof data.email === 'string' ? data.email : undefined,
          } as Student;
        }
        return undefined;
      })
    );
    const validStudents: Student[] = studentsData.filter((s): s is Student => !!s);
    setStudents(validStudents);
    // Load checkin cho tất cả sessionDates đang hiển thị
    let sessionDatesToFetch: string[] = [];
    if (selectedDate) {
      // Lấy các ngày từ đầu đến ngày đã chọn
      sessionDatesToFetch = allSessionDates
        .filter(d => dayjs(d).isSame(selectedDate, 'day') || dayjs(d).isBefore(selectedDate, 'day'))
        .map(d => dayjs(d).toISOString());
    } else {
      // Lấy tất cả các ngày
      sessionDatesToFetch = allSessionDates.map(d => dayjs(d).toISOString());
    }
    if (sessionDatesToFetch.length === 0) {
      setCheckins({});
      return;
    }
    // Lấy tất cả checkin của schedule này, lọc theo sessionDatesToFetch
    const checkinQ = query(
      collection(db, "checkins"),
      where("scheduleId", "==", schedule.id)
    );
    const checkinSnap = await getDocs(checkinQ);
    const checkinData: Record<string, { [date: string]: boolean }> = {};
    checkinSnap.forEach((doc) => {
      const d = doc.data();
      if (sessionDatesToFetch.includes(d.sessionDate)) {
        if (!checkinData[d.studentId]) checkinData[d.studentId] = {};
        checkinData[d.studentId][d.sessionDate] = d.checked;
      }
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

  // Lưu checkin cho ngày đã chọn
  const handleSave = async () => {
    setLoading(true);
    try {
      const todaySessions = sessionDates.filter(date => dayjs(date).isSame(today, 'day'));
      if (todaySessions.length === 0) {
        message.warning("Hôm nay không có ca/lịch học để điểm danh!");
        setLoading(false);
        return;
      }
      const promises = students.map((student) => {
        // Chỉ lưu checkin cho ca hôm nay
        return todaySessions.map((date) => {
          const checked = checkins[student.id]?.[dayjs(date).toISOString()] || false;
          return setDoc(
            doc(
              db,
              "checkins",
              `${schedule.id}_${student.id}_${dayjs(date).toISOString()}`
            ),
            {
              classId,
              scheduleId: schedule.id,
              studentId: student.id,
              sessionDate: dayjs(date).toISOString(),
              checked,
              createdAt: new Date().toISOString(),
            },
            { merge: true }
          );
        });
      }).flat();
      await Promise.all(promises);
      toast.success("Checkin thành công!");
      onClose();
    } catch {
      message.error("Lỗi khi lưu điểm danh!");
    } finally {
      setLoading(false);
    }
  };

  // Hiển thị tất cả các ca/lịch học (sessionDates), chỉ enable checkbox cho ngày hôm nay
  const columns = [
    {
      title: "STT",
      dataIndex: "stt",
      align: "center" as const,
      render: (_: unknown, __: unknown, idx: number) => <div style={{ textAlign: 'center' }}>{idx + 1}</div>,
    },
    {
      title: "Tên học sinh",
      dataIndex: "name",
      align: "center" as const,
      render: (_: unknown, record: Student) => <div style={{ textAlign: 'center' }}>{record.name ?? ""}</div>,
    },
    {
      title: "Email",
      dataIndex: "email",
      align: "center" as const,
      render: (_: unknown, record: Student) => <div style={{ textAlign: 'center' }}>{record.email ?? ""}</div>,
    },
    ...sessionDates.map((date) => {
      const isToday = dayjs(date).isSame(today, 'day');
      const highlightColor = '#d1fae5';
      const shouldHighlight = userRole === 'teacher' && isToday;
      return {
        title: (
          <div style={{ textAlign: 'center' }}>
            {dayjs(date).format("DD/MM/YYYY")}
          </div>
        ),
        dataIndex: dayjs(date).format("YYYY-MM-DD"),
        align: "center" as const,
        className: undefined,
        onCell: shouldHighlight
          ? () => ({ style: { background: highlightColor } })
          : undefined,
        onHeaderCell: shouldHighlight
          ? () => ({ style: { background: highlightColor } })
          : undefined,
        render: (_: unknown, record: Student) => (
          <Checkbox
            checked={checkins[record.id]?.[dayjs(date).toISOString()] || false}
            onChange={(e) =>
              handleCheck(record.id, dayjs(date).toISOString(), e.target.checked)
            }
            disabled={userRole !== 'teacher' || !isToday}
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
        userRole === 'teacher' && (
          <Button
            key="save"
            type="primary"
            loading={loading}
            onClick={handleSave}
          >
            Lưu
          </Button>
        ),
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
        <DatePicker
          value={selectedDate}
          allowClear
          onChange={(date) => {
            if (!date) {
              setSelectedDate(null); // Hiển thị lại toàn bộ sessionDates
            } else {
              setSelectedDate(date);
            }
          }}
          format="DD/MM/YYYY"
          style={{ width: 160 }}
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
