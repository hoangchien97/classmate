import {
  Input,
  Select,
  Alert,
  Checkbox,
  Button,
  Modal,
  Form,
  DatePicker,
  TimePicker,
} from "antd";
import moment from "moment";
import { useState, useMemo } from "react";
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
import { auth, db } from "@/firebase/firebase";
import { FORMAT_DATE, FORMAT_TIME } from "@/constants";
import { DayOfWeek, RecurrenceType } from "@/assets/enums";

const { Option } = Select;

export interface ScheduleEventModalProps {
  showModal: boolean;
  setShowModal: (show: boolean) => void;
  newEvent: any;
  setNewEvent: (event: any) => void;
  userRole: string;
  userClasses: any[];
  setUserClasses: (classes: any[]) => void;
  selectedEvent: any;
  onRefreshEvents: () => void;
}

const ScheduleEventModal = ({
  showModal,
  setShowModal,
  newEvent,
  setNewEvent,
  userRole,
  userClasses,
  selectedEvent,
  onRefreshEvents,
}: ScheduleEventModalProps) => {
  const [error, setError] = useState("");
  const [form] = Form.useForm();

  // Memoize isTeacher để tránh re-calculate không cần thiết
  const isTeacher = useMemo(() => userRole === "teacher", [userRole]);

  const dayOfWeekOptions = [
    { label: "Thứ 2", value: DayOfWeek.MONDAY },
    { label: "Thứ 3", value: DayOfWeek.TUESDAY },
    { label: "Thứ 4", value: DayOfWeek.WEDNESDAY },
    { label: "Thứ 5", value: DayOfWeek.THURSDAY },
    { label: "Thứ 6", value: DayOfWeek.FRIDAY },
    { label: "Thứ 7", value: DayOfWeek.SATURDAY },
    { label: "Chủ nhật", value: DayOfWeek.SUNDAY },
  ];

  // Recurrence options
  const recurrenceOptions = [
    { label: "Không lặp lại", value: RecurrenceType.NONE },
    { label: "Hàng tuần", value: RecurrenceType.WEEKLY },
    { label: "Hàng tháng", value: RecurrenceType.MONTHLY },
  ];

  // Monthly day options (1-31)
  const monthlyDayOptions = Array.from({ length: 31 }, (_, i) => ({
    label: `Ngày ${i + 1}`,
    value: i + 1,
  }));

  // Helper functions to convert between formats
  const getDateValue = (dateStr: string) => {
    return dateStr ? moment(dateStr, "YYYY-MM-DD") : null;
  };

  const getTimeValue = (timeStr: string) => {
    return timeStr ? moment(timeStr, FORMAT_TIME) : null;
  };

  const formatDateForStorage = (momentObj: moment.Moment | null) => {
    return momentObj ? momentObj.format("YYYY-MM-DD") : "";
  };

  const formatTimeForStorage = (momentObj: moment.Moment | null) => {
    return momentObj ? momentObj.format(FORMAT_TIME) : "";
  };

  const handleSaveEvent = async () => {
    try {
      // Validate form
      const values = await form.validateFields();

      if (
        !newEvent.title ||
        !newEvent.date ||
        !newEvent.startTime ||
        !newEvent.endTime
      ) {
        setError(
          "Vui lòng nhập đầy đủ tên lịch*, ngày*, giờ bắt đầu* và giờ kết thúc*."
        );
        return;
      }

      // Validate class selection for teacher
      if (isTeacher && !newEvent.classId) {
        setError("Vui lòng chọn lớp học.");
        return;
      }

      const startDate = moment(
        `${newEvent.date} ${newEvent.startTime}`,
        "YYYY-MM-DD HH:mm"
      ).toDate();
      const endDate = moment(
        `${newEvent.date} ${newEvent.endTime}`,
        "YYYY-MM-DD HH:mm"
      ).toDate();

      if (endDate <= startDate) {
        setError("Thời gian kết thúc phải sau thời gian bắt đầu.");
        return;
      }

      if (newEvent.recurrence !== "none" && !newEvent.recurrenceEnd) {
        setError("Vui lòng chọn ngày kết thúc lặp lại.");
        return;
      }

      const weeklyDays = Array.isArray(newEvent.weeklyDays)
        ? newEvent.weeklyDays
        : [];
      const monthlyDay = newEvent.monthlyDay || 1;

      const parentId = newEvent.isEditing
        ? selectedEvent?.parentId || selectedEvent?.id
        : `schedule_${Date.now()}`;

      if (newEvent.isEditing && selectedEvent) {
        // Update existing event logic...
        await updateDoc(doc(db, "schedules", selectedEvent.id), {
          title: newEvent.title,
          start: startDate,
          end: endDate,
          description: newEvent.description || "",
          classId: newEvent.classId,
          recurrence: newEvent.recurrence,
          recurrenceEnd: newEvent.recurrenceEnd
            ? moment(newEvent.recurrenceEnd).toDate()
            : null,
          weeklyDays: weeklyDays,
          monthlyDay: monthlyDay,
          updatedAt: new Date(),
        });
      } else {
        // Create new event
        const scheduleId = `schedule_${Date.now()}`;
        await setDoc(doc(db, "schedules", scheduleId), {
          classId: newEvent.classId,
          teacherId: auth.currentUser?.uid,
          title: newEvent.title,
          start: startDate,
          end: endDate,
          description: newEvent.description || "",
          recurrence: newEvent.recurrence,
          recurrenceEnd: newEvent.recurrenceEnd
            ? moment(newEvent.recurrenceEnd).toDate()
            : null,
          parentId: parentId,
          weeklyDays: weeklyDays,
          monthlyDay: monthlyDay,
          createdAt: new Date(),
        });
      }

      // Reset form and close modal
      setNewEvent({
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
        weeklyDays: [],
        monthlyDay: 1,
      });
      form.resetFields();
      setShowModal(false);
      setError("");
      onRefreshEvents();
    } catch (err: any) {
      if (err.errorFields) {
        return;
      }
      console.error("Error saving schedule:", err);
      setError("Lỗi khi lưu lịch học: " + err.message);
    }
  };

  const handleDeleteEvent = async (eventId: string) => {
    try {
      const eventDoc = await getDoc(doc(db, "schedules", eventId));
      if (eventDoc.exists()) {
        const eventData = eventDoc.data();
        const parentId = eventData.parentId || eventId;

        const recurringQuery = query(
          collection(db, "schedules"),
          where("parentId", "==", parentId)
        );
        const recurringSnapshot = await getDocs(recurringQuery);
        const deletePromises = recurringSnapshot.docs.map((doc) =>
          deleteDoc(doc.ref)
        );
        await Promise.all(deletePromises);

        setShowModal(false);
        setError("");
        onRefreshEvents();
      }
    } catch (err: any) {
      console.error("Error deleting schedule:", err);
      setError("Lỗi xóa lịch: " + err.message);
    }
  };

  return (
    <Modal
      title={newEvent.isEditing ? "Chỉnh sửa lịch học" : "Thêm lịch học mới"}
      open={showModal}
      onCancel={() => setShowModal(false)}
      centered
      footer={null}
      width={700}
    >
      <Form form={form} layout="vertical" size="large">
        {/* Tên lịch và Lớp học cùng 1 hàng */}
        <div className="grid grid-cols-2 gap-4">
          <Form.Item
            label="Tên lịch"
            name="title"
            rules={[{ required: true, message: "Vui lòng nhập tên lịch!" }]}
          >
            <Input
              value={newEvent.title}
              onChange={(e) =>
                setNewEvent({ ...newEvent, title: e.target.value })
              }
              placeholder="Nhập tên lịch học"
            />
          </Form.Item>

          {isTeacher && (
            <Form.Item
              label="Lớp học"
              name="classId"
              rules={[{ required: true, message: "Vui lòng chọn lớp học!" }]}
            >
              <Select
                value={newEvent.classId}
                onChange={(value) =>
                  setNewEvent({ ...newEvent, classId: value })
                }
                placeholder="Chọn lớp học"
              >
                {userClasses.map((cls) => (
                  <Option key={cls.id} value={cls.id}>
                    {cls.name}
                  </Option>
                ))}
              </Select>
            </Form.Item>
          )}
        </div>

        {/* Ngày */}
        <Form.Item
          label="Ngày"
          name="date"
          rules={[{ required: true, message: "Vui lòng chọn ngày!" }]}
        >
          <DatePicker
            value={getDateValue(newEvent.date)}
            onChange={(date) =>
              setNewEvent({ ...newEvent, date: formatDateForStorage(date) })
            }
            format={FORMAT_DATE}
            placeholder="Chọn ngày"
            style={{ width: "100%" }}
          />
        </Form.Item>

        {/* Giờ bắt đầu và Giờ kết thúc */}
        <div className="grid grid-cols-2 gap-4">
          <Form.Item
            label="Giờ bắt đầu"
            name="startTime"
            rules={[{ required: true, message: "Vui lòng chọn giờ bắt đầu!" }]}
          >
            <TimePicker
              value={getTimeValue(newEvent.startTime)}
              onChange={(time) =>
                setNewEvent({
                  ...newEvent,
                  startTime: formatTimeForStorage(time),
                })
              }
              format={FORMAT_TIME}
              placeholder="Chọn giờ bắt đầu"
              style={{ width: "100%" }}
            />
          </Form.Item>

          <Form.Item
            label="Giờ kết thúc"
            name="endTime"
            rules={[{ required: true, message: "Vui lòng chọn giờ kết thúc!" }]}
          >
            <TimePicker
              value={getTimeValue(newEvent.endTime)}
              onChange={(time) =>
                setNewEvent({
                  ...newEvent,
                  endTime: formatTimeForStorage(time),
                })
              }
              format={FORMAT_TIME}
              placeholder="Chọn giờ kết thúc"
              style={{ width: "100%" }}
            />
          </Form.Item>
        </div>

        {/* Mô tả */}
        <Form.Item label="Mô tả">
          <Input.TextArea
            value={newEvent.description}
            onChange={(e) =>
              setNewEvent({ ...newEvent, description: e.target.value })
            }
            rows={3}
            placeholder="Nhập mô tả chi tiết"
          />
        </Form.Item>

        {/* Lặp lại - chỉ hiển thị cho teacher */}
        {isTeacher && (
          <Form.Item label="Lặp lại">
            <Select
              value={newEvent.recurrence}
              onChange={(value) =>
                setNewEvent({
                  ...newEvent,
                  recurrence: value,
                  weeklyDays: [],
                  monthlyDay: 1,
                })
              }
              options={recurrenceOptions}
            ></Select>
          </Form.Item>
        )}

        {/* Chọn ngày trong tuần - cho lặp lại hàng tuần */}
        {isTeacher && newEvent.recurrence === "weekly" && (
          <Form.Item label="Chọn ngày trong tuần">
            <Checkbox.Group
              value={
                Array.isArray(newEvent.weeklyDays) ? newEvent.weeklyDays : []
              }
              onChange={(checkedValues) =>
                setNewEvent({
                  ...newEvent,
                  weeklyDays: checkedValues as number[],
                })
              }
            >
              <div className="flex gap-3">
                {dayOfWeekOptions.map((option) => (
                  <Checkbox key={option.value} value={option.value}>
                    {option.label}
                  </Checkbox>
                ))}
              </div>
            </Checkbox.Group>
          </Form.Item>
        )}

        {/* Ngày cố định trong tháng - cho lặp lại hàng tháng */}
        {isTeacher && newEvent.recurrence === "monthly" && (
          <Form.Item label="Ngày cố định trong tháng">
            <Select
              value={newEvent.monthlyDay || 1}
              onChange={(value) =>
                setNewEvent({ ...newEvent, monthlyDay: value })
              }
              options={monthlyDayOptions}
            />
          </Form.Item>
        )}

        {/* Kết thúc lặp lại */}
        {isTeacher && newEvent.recurrence !== "none" && (
          <Form.Item
            label={
              <span>
                Kết thúc lặp lại
                <span className="text-red-500 ml-1">*</span>
              </span>
            }
          >
            <DatePicker
              value={getDateValue(newEvent.recurrenceEnd)}
              onChange={(date) =>
                setNewEvent({
                  ...newEvent,
                  recurrenceEnd: formatDateForStorage(date),
                })
              }
              format={FORMAT_DATE}
              placeholder="Chọn ngày kết thúc"
            />
          </Form.Item>
        )}

        {/* Error Alert */}
        {error && (
          <Alert type="error" message={error} showIcon className="mb-4" />
        )}

        {/* Footer buttons */}
        <div className="flex justify-end gap-3 pt-6 border-t border-gray-200">
          {newEvent.isEditing && isTeacher && (
            <Button
              danger
              onClick={() => handleDeleteEvent(selectedEvent.id)}
              size="large"
            >
              Xóa lịch
            </Button>
          )}
          <Button onClick={() => setShowModal(false)} size="large">
            Hủy
          </Button>
          {isTeacher && (
            <Button type="primary" onClick={handleSaveEvent} size="large">
              {newEvent.isEditing ? "Cập nhật" : "Thêm lịch"}
            </Button>
          )}
        </div>
      </Form>
    </Modal>
  );
};

export default ScheduleEventModal;
