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
import dayjs from "dayjs";
import { useState, useEffect, useMemo, useCallback } from "react";
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
import {
  FORMAT_DATE,
  FORMAT_DATE_INPUT,
  FORMAT_TIME,
  FORMAT_TIME_12H,
} from "@/constants";
import { DayOfWeek, RecurrenceType } from "@/assets/enums";

const { Option } = Select;

// Define types for better type safety
export interface ScheduleFormData {
  title: string;
  date: string;
  startTime: string;
  endTime: string;
  description?: string;
  classId: string;
  recurrence: RecurrenceType;
  recurrenceEnd?: string;
  weeklyDays: number[];
  monthlyDay: number;
}

export interface ScheduleEventModalProps {
  open: boolean;
  onClose: () => void;
  mode: "create" | "edit";
  userRole: string;
  userClasses: any[];
  selectedEvent?: any;
  onRefreshEvents: () => void;
}

const ScheduleEventModal = ({
  open,
  onClose,
  mode = "create",
  userRole,
  userClasses,
  selectedEvent,
  onRefreshEvents,
}: ScheduleEventModalProps) => {
  const [form] = Form.useForm();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // Memoize isTeacher để tránh re-calculate không cần thiết
  const isTeacher = useMemo(() => userRole === "teacher", [userRole]);
  const isStudent = useMemo(() => userRole === "student", [userRole]);

  // Watch form fields for conditional rendering
  const recurrence = Form.useWatch("recurrence", form);
  const selectedDate = Form.useWatch("date", form);

  // Default form data
  const getDefaultFormData = (): ScheduleFormData => ({
    title: "",
    date: dayjs().format(FORMAT_DATE_INPUT),
    startTime: dayjs().format(FORMAT_TIME),
    endTime: dayjs().add(1, "hour").format(FORMAT_TIME),
    description: "",
    classId: "",
    recurrence: RecurrenceType.NONE,
    recurrenceEnd: "",
    weeklyDays: [],
    monthlyDay: 1,
  });

  // Initialize form data based on mode and selectedEvent
  const initializeFormData = useCallback((): ScheduleFormData => {
    if (mode === "edit" && selectedEvent) {
      return {
        title: selectedEvent.title || "",
        date: dayjs(selectedEvent.start).format(FORMAT_DATE_INPUT),
        startTime: dayjs(selectedEvent.start).format(FORMAT_TIME),
        endTime: dayjs(selectedEvent.end).format(FORMAT_TIME),
        description: selectedEvent.description || "",
        classId: selectedEvent.classId || "",
        recurrence: selectedEvent.recurrence || RecurrenceType.NONE,
        recurrenceEnd: selectedEvent.recurrenceEnd
          ? dayjs(selectedEvent.recurrenceEnd).format(FORMAT_DATE_INPUT)
          : "",
        weeklyDays: selectedEvent.weeklyDays || [],
        monthlyDay: selectedEvent.monthlyDay || 1,
      };
    }
    return getDefaultFormData();
  }, [mode, selectedEvent]);

  // Reset form when modal opens/closes or mode changes
  useEffect(() => {
    if (open) {
      const formData = initializeFormData();
      form.setFieldsValue({
        title: formData.title,
        classId: formData.classId,
        date: dayjs(formData.date, FORMAT_DATE_INPUT),
        startTime: dayjs(formData.startTime, FORMAT_TIME),
        endTime: dayjs(formData.endTime, FORMAT_TIME),
        description: formData.description,
        recurrence: formData.recurrence,
        recurrenceEnd: formData.recurrenceEnd
          ? dayjs(formData.recurrenceEnd, FORMAT_DATE_INPUT)
          : null,
        weeklyDays: formData.weeklyDays,
        monthlyDay: formData.monthlyDay,
      });
      setError("");
    } else {
      form.resetFields();
      setError("");
    }
  }, [open, mode, selectedEvent, form, initializeFormData]);

  const dayOfWeekOptions = [
    { label: "Thứ 2", value: DayOfWeek.MONDAY },
    { label: "Thứ 3", value: DayOfWeek.TUESDAY },
    { label: "Thứ 4", value: DayOfWeek.WEDNESDAY },
    { label: "Thứ 5", value: DayOfWeek.THURSDAY },
    { label: "Thứ 6", value: DayOfWeek.FRIDAY },
    { label: "Thứ 7", value: DayOfWeek.SATURDAY },
    { label: "Chủ nhật", value: DayOfWeek.SUNDAY },
  ];

  const recurrenceOptions = [
    { label: "Không lặp lại", value: RecurrenceType.NONE },
    { label: "Hàng tuần", value: RecurrenceType.WEEKLY },
    { label: "Hàng tháng", value: RecurrenceType.MONTHLY },
  ];

  const monthlyDayOptions = Array.from({ length: 31 }, (_, i) => ({
    label: `Ngày ${i + 1}`,
    value: i + 1,
  }));

  const handleSaveEvent = async () => {
    try {
      setLoading(true);

      // Validate form
      const values = await form.validateFields();

      // Create datetime strings using dayjs
      const startDateTime = `${values.date.format(
        FORMAT_DATE_INPUT
      )} ${values.startTime.format(FORMAT_TIME)}`;
      const endDateTime = `${values.date.format(
        FORMAT_DATE_INPUT
      )} ${values.endTime.format(FORMAT_TIME)}`;

      const startDate = dayjs(
        startDateTime,
        `${FORMAT_DATE_INPUT} ${FORMAT_TIME}`
      ).toDate();
      const endDate = dayjs(
        endDateTime,
        `${FORMAT_DATE_INPUT} ${FORMAT_TIME}`
      ).toDate();

      if (endDate <= startDate) {
        setError("Thời gian kết thúc phải sau thời gian bắt đầu.");
        return;
      }

      if (values.recurrence !== RecurrenceType.NONE && !values.recurrenceEnd) {
        setError("Vui lòng chọn ngày kết thúc lặp lại.");
        return;
      }

      // Validate weekly days for weekly recurrence
      if (
        values.recurrence === RecurrenceType.WEEKLY &&
        (!values.weeklyDays || values.weeklyDays.length === 0)
      ) {
        setError("Vui lòng chọn ít nhất một ngày trong tuần.");
        return;
      }

      // Validate monthly day for monthly recurrence
      if (values.recurrence === RecurrenceType.MONTHLY && !values.monthlyDay) {
        setError("Vui lòng chọn ngày trong tháng.");
        return;
      }

      const weeklyDays = Array.isArray(values.weeklyDays)
        ? values.weeklyDays
        : [];
      const monthlyDay = values.monthlyDay || 1;

      const parentId =
        mode === "edit" && selectedEvent
          ? selectedEvent.parentId || selectedEvent.id
          : `schedule_${Date.now()}`;

      if (mode === "edit" && selectedEvent) {
        // Update existing event
        await updateDoc(doc(db, "schedules", selectedEvent.id), {
          title: values.title,
          start: startDate,
          end: endDate,
          description: values.description || "",
          classId: values.classId,
          recurrence: values.recurrence,
          recurrenceEnd: values.recurrenceEnd
            ? values.recurrenceEnd.toDate()
            : null,
          weeklyDays: weeklyDays,
          monthlyDay: monthlyDay,
          updatedAt: new Date(),
        });

        // Xử lý recurring events
        // Nếu chuyển từ không lặp sang lặp, tạo schedule con mới
        if (
          selectedEvent.recurrence === RecurrenceType.NONE &&
          values.recurrence !== RecurrenceType.NONE &&
          values.recurrenceEnd
        ) {
          let currentDate = new Date(startDate);
          const endRecurDate = values.recurrenceEnd.toDate();
          const interval = values.recurrence === RecurrenceType.WEEKLY ? 7 : 30;

          while (currentDate <= endRecurDate) {
            currentDate = new Date(currentDate);
            const nextStart = new Date(currentDate);
            const nextEnd = new Date(currentDate);
            nextEnd.setHours(endDate.getHours(), endDate.getMinutes(), 0, 0);

            if (nextStart > endRecurDate) break;

            if (
              values.recurrence === RecurrenceType.WEEKLY &&
              weeklyDays.length > 0
            ) {
              const dayOfWeek = currentDate.getDay();
              if (!weeklyDays.includes(dayOfWeek)) {
                currentDate.setDate(currentDate.getDate() + 1);
                continue;
              }
            } else if (
              values.recurrence === RecurrenceType.MONTHLY &&
              currentDate.getDate() !== monthlyDay
            ) {
              currentDate.setMonth(currentDate.getMonth() + 1);
              currentDate.setDate(monthlyDay);
              continue;
            }

            // Không tạo lại bản ghi gốc
            if (
              dayjs(nextStart).format(FORMAT_DATE_INPUT) ===
              dayjs(startDate).format(FORMAT_DATE_INPUT)
            ) {
              currentDate.setDate(
                currentDate.getDate() +
                  (values.recurrence === RecurrenceType.WEEKLY ? 1 : interval)
              );
              continue;
            }

            const recurId = `schedule_${Date.now()}_${currentDate.getTime()}`;
            await setDoc(doc(db, "schedules", recurId), {
              classId: selectedEvent.classId,
              teacherId: auth.currentUser?.uid,
              title: values.title,
              start: nextStart,
              end: nextEnd,
              description: values.description || "",
              recurrence: values.recurrence,
              recurrenceEnd: endRecurDate,
              parentId,
              weeklyDays: weeklyDays,
              monthlyDay: monthlyDay,
              createdAt: new Date(),
            });
            currentDate.setDate(
              currentDate.getDate() +
                (values.recurrence === RecurrenceType.WEEKLY ? 1 : interval)
            );
          }
        } else if (values.recurrence !== RecurrenceType.NONE) {
          // Nếu vẫn là lặp, xử lý cập nhật schedule con
          const recurringQuery = query(
            collection(db, "schedules"),
            where("parentId", "==", parentId)
          );
          const recurringSnapshot = await getDocs(recurringQuery);

          // Nếu thay đổi recurrenceEnd từ tương lai về quá khứ, xóa các events nằm ngoài phạm vi
          if (values.recurrenceEnd) {
            const newEndDate = values.recurrenceEnd.toDate();
            const eventsToDelete: string[] = [];

            recurringSnapshot.docs.forEach((doc) => {
              const eventData = doc.data();
              const eventStart = eventData.start.toDate();

              // Nếu event bắt đầu sau ngày kết thúc mới, đánh dấu để xóa
              if (eventStart > newEndDate) {
                eventsToDelete.push(doc.id);
              }
            });

            // Xóa các events nằm ngoài phạm vi
            if (eventsToDelete.length > 0) {
              const deletePromises = eventsToDelete.map((eventId) =>
                deleteDoc(doc(db, "schedules", eventId))
              );
              await Promise.all(deletePromises);
            }
          }

          // Cập nhật các events còn lại
          const remainingEvents = recurringSnapshot.docs.filter((doc) => {
            if (!values.recurrenceEnd) return true;
            const eventData = doc.data();
            const eventStart = eventData.start.toDate();
            return eventStart <= values.recurrenceEnd.toDate();
          });

          const updates = remainingEvents.map((doc) => {
            const eventData = doc.data();
            const originalStart = eventData.start.toDate();

            // Tính toán thời gian mới dựa trên thời gian gốc và thời gian mới được chọn
            const newEventStart = new Date(originalStart);
            newEventStart.setHours(
              startDate.getHours(),
              startDate.getMinutes(),
              0,
              0
            );

            const newEventEnd = new Date(originalStart);
            newEventEnd.setHours(
              endDate.getHours(),
              endDate.getMinutes(),
              0,
              0
            );

            return updateDoc(doc.ref, {
              title: values.title,
              start: newEventStart,
              end: newEventEnd,
              description: values.description || "",
              recurrence: values.recurrence,
              recurrenceEnd: values.recurrenceEnd
                ? values.recurrenceEnd.toDate()
                : null,
              weeklyDays: weeklyDays,
              monthlyDay: monthlyDay,
              updatedAt: new Date(),
            });
          });

          await Promise.all(updates);

          // Nếu mở rộng recurrenceEnd, tạo thêm events mới
          if (values.recurrenceEnd && selectedEvent.recurrenceEnd) {
            const oldEndDate =
              selectedEvent.recurrenceEnd instanceof Date
                ? selectedEvent.recurrenceEnd
                : selectedEvent.recurrenceEnd.toDate();
            const newEndDate = values.recurrenceEnd.toDate();

            if (newEndDate > oldEndDate) {
              // Tạo thêm events từ oldEndDate + 1 đến newEndDate
              let currentDate = new Date(oldEndDate);
              currentDate.setDate(currentDate.getDate() + 1); // Bắt đầu từ ngày sau oldEndDate

              while (currentDate <= newEndDate) {
                let shouldCreateEvent = false;

                if (
                  values.recurrence === RecurrenceType.WEEKLY &&
                  weeklyDays.length > 0
                ) {
                  const dayOfWeek = currentDate.getDay();
                  if (weeklyDays.includes(dayOfWeek)) {
                    shouldCreateEvent = true;
                  }
                } else if (
                  values.recurrence === RecurrenceType.MONTHLY &&
                  currentDate.getDate() === monthlyDay
                ) {
                  shouldCreateEvent = true;
                }

                if (shouldCreateEvent) {
                  const nextStart = new Date(currentDate);
                  nextStart.setHours(
                    startDate.getHours(),
                    startDate.getMinutes(),
                    0,
                    0
                  );

                  const nextEnd = new Date(currentDate);
                  nextEnd.setHours(
                    endDate.getHours(),
                    endDate.getMinutes(),
                    0,
                    0
                  );

                  const recurId = `schedule_${Date.now()}_${currentDate.getTime()}`;
                  await setDoc(doc(db, "schedules", recurId), {
                    classId: selectedEvent.classId,
                    teacherId: auth.currentUser?.uid,
                    title: values.title,
                    start: nextStart,
                    end: nextEnd,
                    description: values.description || "",
                    recurrence: values.recurrence,
                    recurrenceEnd: newEndDate,
                    parentId,
                    weeklyDays: weeklyDays,
                    monthlyDay: monthlyDay,
                    createdAt: new Date(),
                  });
                }

                currentDate.setDate(currentDate.getDate() + 1);
              }
            }
          }
        } else if (
          selectedEvent.recurrence !== RecurrenceType.NONE &&
          values.recurrence === RecurrenceType.NONE
        ) {
          // Nếu chuyển từ lặp về không lặp, xóa tất cả schedule con
          const recurringQuery = query(
            collection(db, "schedules"),
            where("parentId", "==", parentId)
          );
          const recurringSnapshot = await getDocs(recurringQuery);
          const deletePromises = recurringSnapshot.docs
            .filter((doc) => doc.id !== selectedEvent.id) // Không xóa event gốc
            .map((doc) => deleteDoc(doc.ref));

          if (deletePromises.length > 0) {
            await Promise.all(deletePromises);
          }
        }
      } else {
        // Create new event
        const scheduleId = `schedule_${Date.now()}`;
        await setDoc(doc(db, "schedules", scheduleId), {
          classId: values.classId,
          teacherId: auth.currentUser?.uid,
          title: values.title,
          start: startDate,
          end: endDate,
          description: values.description || "",
          recurrence: values.recurrence,
          recurrenceEnd: values.recurrenceEnd
            ? values.recurrenceEnd.toDate()
            : null,
          parentId: parentId,
          weeklyDays: weeklyDays,
          monthlyDay: monthlyDay,
          createdAt: new Date(),
        });

        // Tạo recurring events cho event mới
        if (values.recurrence !== RecurrenceType.NONE && values.recurrenceEnd) {
          let currentDate = new Date(startDate);
          const endRecurDate = values.recurrenceEnd.toDate();
          const interval = values.recurrence === RecurrenceType.WEEKLY ? 7 : 30;

          while (currentDate <= endRecurDate) {
            currentDate = new Date(currentDate);
            const nextStart = new Date(currentDate);
            const nextEnd = new Date(currentDate);
            nextEnd.setHours(endDate.getHours(), endDate.getMinutes(), 0, 0);

            if (nextStart > endRecurDate) break;

            if (
              values.recurrence === RecurrenceType.WEEKLY &&
              weeklyDays.length > 0
            ) {
              const dayOfWeek = currentDate.getDay();
              if (!weeklyDays.includes(dayOfWeek)) {
                currentDate.setDate(currentDate.getDate() + 1);
                continue;
              }
            } else if (
              values.recurrence === RecurrenceType.MONTHLY &&
              currentDate.getDate() !== monthlyDay
            ) {
              currentDate.setMonth(currentDate.getMonth() + 1);
              currentDate.setDate(monthlyDay);
              continue;
            }

            // Không tạo lại bản ghi gốc
            if (
              dayjs(nextStart).format(FORMAT_DATE_INPUT) ===
              dayjs(startDate).format(FORMAT_DATE_INPUT)
            ) {
              currentDate.setDate(
                currentDate.getDate() +
                  (values.recurrence === RecurrenceType.WEEKLY ? 1 : interval)
              );
              continue;
            }

            const recurId = `schedule_${Date.now()}_${currentDate.getTime()}`;
            await setDoc(doc(db, "schedules", recurId), {
              classId: values.classId,
              teacherId: auth.currentUser?.uid,
              title: values.title,
              start: nextStart,
              end: nextEnd,
              description: values.description || "",
              recurrence: values.recurrence,
              recurrenceEnd: endRecurDate,
              parentId: parentId,
              weeklyDays: weeklyDays,
              monthlyDay: monthlyDay,
              createdAt: new Date(),
            });
            currentDate.setDate(
              currentDate.getDate() +
                (values.recurrence === RecurrenceType.WEEKLY ? 1 : interval)
            );
          }
        }
      }

      // Close modal and refresh events
      onClose();
      onRefreshEvents();
      setError("");
    } catch (err) {
      if (err && typeof err === "object" && "errorFields" in err) {
        return;
      }
      console.error("Error saving schedule:", err);
      setError(
        "Lỗi khi lưu lịch học: " +
          (err instanceof Error ? err.message : "Unknown error")
      );
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteEvent = async () => {
    if (!selectedEvent) return;

    try {
      setLoading(true);
      const eventDoc = await getDoc(doc(db, "schedules", selectedEvent.id));

      if (eventDoc.exists()) {
        const eventData = eventDoc.data();
        const parentId = eventData.parentId || selectedEvent.id;

        const recurringQuery = query(
          collection(db, "schedules"),
          where("parentId", "==", parentId)
        );
        const recurringSnapshot = await getDocs(recurringQuery);
        const deletePromises = recurringSnapshot.docs.map((doc) =>
          deleteDoc(doc.ref)
        );
        await Promise.all(deletePromises);

        onClose();
        onRefreshEvents();
        setError("");
      }
    } catch (err) {
      console.error("Error deleting schedule:", err);
      setError(
        "Lỗi xóa lịch: " +
          (err instanceof Error ? err.message : "Unknown error")
      );
    } finally {
      setLoading(false);
    }
  };

  const title = useMemo(() => {
    if(isStudent) return "Chi tiết lịch học"
    return mode === "edit" ? "Chỉnh sửa lịch học" : "Thêm lịch học mới";
  }, [isStudent, mode]);

  return (
    <Modal
      title={title}
      open={open}
      onCancel={onClose}
      centered
      footer={null}
      width={700}
      destroyOnHidden
    >
      <Form form={form} layout="vertical" size="large">
        {/* Tên lịch và Lớp học cùng 1 hàng */}
        <div
          className={`grid ${isStudent ? "grid-cols-1" : "grid-cols-2"} gap-4`}
        >
          <Form.Item
            label="Tên lịch"
            name="title"
            rules={[{ required: true, message: "Vui lòng nhập tên lịch!" }]}
          >
            <Input placeholder="Nhập tên lịch học" disabled={isStudent} />
          </Form.Item>

          {isTeacher && (
            <Form.Item
              label="Lớp học"
              name="classId"
              rules={[{ required: true, message: "Vui lòng chọn lớp học!" }]}
            >
              <Select placeholder="Chọn lớp học">
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
            format={FORMAT_DATE}
            placeholder="Chọn ngày"
            style={{ width: "100%" }}
            disabled={isStudent}
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
              format={FORMAT_TIME_12H}
              minuteStep={30}
              use12Hours
              placeholder="Chọn giờ bắt đầu"
              style={{ width: "100%" }}
              disabled={isStudent}
            />
          </Form.Item>

          <Form.Item
            label="Giờ kết thúc"
            name="endTime"
            rules={[{ required: true, message: "Vui lòng chọn giờ kết thúc!" }]}
          >
            <TimePicker
              format={FORMAT_TIME_12H}
              minuteStep={30}
              use12Hours
              placeholder="Chọn giờ kết thúc"
              style={{ width: "100%" }}
              disabled={isStudent}
            />
          </Form.Item>
        </div>

        {/* Mô tả */}
        <Form.Item label="Mô tả" name="description">
          <Input.TextArea
            rows={3}
            placeholder="Nhập mô tả chi tiết"
            disabled={isStudent}
          />
        </Form.Item>

        {/* Lặp lại - chỉ hiển thị cho teacher */}
        {isTeacher && (
          <Form.Item label="Lặp lại" name="recurrence">
            <Select
              options={recurrenceOptions}
              onChange={(value) => {
                // Reset dependent fields when recurrence changes
                if (value === RecurrenceType.NONE) {
                  form.setFieldsValue({
                    recurrenceEnd: null,
                    weeklyDays: [],
                    monthlyDay: 1,
                  });
                }
              }}
            />
          </Form.Item>
        )}

        {/* Chọn ngày trong tuần - cho lặp lại hàng tuần */}
        {isTeacher && recurrence === RecurrenceType.WEEKLY && (
          <Form.Item
            label="Chọn ngày trong tuần"
            name="weeklyDays"
            rules={[
              {
                required: true,
                message: "Vui lòng chọn ít nhất một ngày trong tuần!",
                type: "array",
                min: 1,
              },
            ]}
          >
            <Checkbox.Group>
              <div className="flex gap-3 flex-wrap">
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
        {isTeacher && recurrence === RecurrenceType.MONTHLY && (
          <Form.Item
            label="Ngày cố định trong tháng"
            name="monthlyDay"
            rules={[
              {
                required: true,
                message: "Vui lòng chọn ngày trong tháng!",
              },
            ]}
          >
            <Select
              options={monthlyDayOptions}
              placeholder="Chọn ngày trong tháng"
            />
          </Form.Item>
        )}

        {/* Ngày kết thúc lặp */}
        {isTeacher && recurrence !== RecurrenceType.NONE && (
          <Form.Item
            label={
              <span>
                Ngày kết thúc lặp
                <span className="text-red-500 ml-1">*</span>
              </span>
            }
            name="recurrenceEnd"
            rules={[
              { required: true, message: "Vui lòng chọn ngày kết thúc!" },
              ({ getFieldValue }) => ({
                validator(_, value) {
                  const startDate = getFieldValue("date");
                  if (!value || !startDate) {
                    return Promise.resolve();
                  }

                  if (value.isBefore(startDate, "day")) {
                    return Promise.reject(
                      new Error("Ngày kết thúc phải sau ngày bắt đầu!")
                    );
                  }

                  return Promise.resolve();
                },
              }),
            ]}
          >
            <DatePicker
              format={FORMAT_DATE}
              placeholder="Chọn ngày kết thúc"
              style={{ width: "100%" }}
              disabledDate={(current) => {
                // Disable dates before the selected start date
                if (!selectedDate) return false;
                return current && current.isBefore(selectedDate, "day");
              }}
            />
          </Form.Item>
        )}

        {/* Error Alert */}
        {error && (
          <Alert type="error" message={error} showIcon className="mb-4" />
        )}

        {/* Footer buttons */}
        <div className="flex justify-end gap-3 pt-6 border-t border-gray-200">
          {mode === "edit" && isTeacher && (
            <Button
              danger
              onClick={handleDeleteEvent}
              loading={loading}
              size="large"
            >
              Xóa lịch
            </Button>
          )}
          <Button onClick={onClose} size="large">
            Hủy
          </Button>
          {isTeacher && (
            <Button
              type="primary"
              onClick={handleSaveEvent}
              loading={loading}
              size="large"
            >
              {mode === "edit" ? "Cập nhật" : "Thêm lịch"}
            </Button>
          )}
        </div>
      </Form>
    </Modal>
  );
};

export default ScheduleEventModal;
