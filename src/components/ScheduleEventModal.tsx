import { Input, Select, Alert, Checkbox, Button, Modal } from "antd";
import moment from "moment";
import { useState } from "react";
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
  setUserClasses,
  selectedEvent,
  onRefreshEvents,
}: ScheduleEventModalProps) => {
  const [error, setError] = useState("");

  const handleSaveEvent = async () => {
    if (!newEvent.title || !newEvent.date || !newEvent.startTime || !newEvent.endTime) {
      setError("Vui lòng nhập đầy đủ tiêu đề*, ngày*, giờ bắt đầu* và giờ kết thúc*.");
      return;
    }

    try {
      const startDate = moment(`${newEvent.date} ${newEvent.startTime}`, "YYYY-MM-DD HH:mm").toDate();
      const endDate = moment(`${newEvent.date} ${newEvent.endTime}`, "YYYY-MM-DD HH:mm").toDate();
      if (endDate <= startDate) {
        setError("Thời gian kết thúc phải sau thời gian bắt đầu.");
        return;
      }

      if (newEvent.recurrence !== "none" && !newEvent.recurrenceEnd) {
        setError("Vui lòng chọn ngày kết thúc lặp lại.");
        return;
      }

      let classId = newEvent.classId;
      if (!classId && newEvent.isEditing === false) {
        classId = `class_${Date.now()}`;
        await setDoc(doc(db, "classes", classId), {
          name: newEvent.title,
          teacherId: auth.currentUser?.uid,
          studentIds: [],
          joinRequests: [],
          createdAt: new Date(),
          description: newEvent.description || "",
        });
        setUserClasses([...userClasses, { id: classId, name: newEvent.title }]);
      }

      const parentId = newEvent.isEditing ? selectedEvent.parentId : `schedule_${Date.now()}`;
      if (newEvent.isEditing && selectedEvent) {
        // Xóa tất cả schedule con nếu chuyển sang recurrence "none"
        if (newEvent.recurrence === "none" && selectedEvent.recurrence !== "none") {
          const recurringQuery = query(collection(db, "schedules"), where("parentId", "==", parentId));
          const recurringSnapshot = await getDocs(recurringQuery);
          const deletePromises = recurringSnapshot.docs
            .filter((doc) => doc.id !== selectedEvent.id)
            .map((doc) => deleteDoc(doc.ref));
          await Promise.all(deletePromises);
        }

        await updateDoc(doc(db, "schedules", selectedEvent.id), {
          title: newEvent.title,
          start: startDate,
          end: endDate,
          description: newEvent.description,
          recurrence: newEvent.recurrence,
          recurrenceEnd: newEvent.recurrenceEnd ? moment(newEvent.recurrenceEnd).toDate() : null,
          weeklyDays: newEvent.weeklyDays,
          monthlyDay: newEvent.monthlyDay,
          updatedAt: new Date(),
        });

        // Nếu chuyển từ không lặp sang lặp, tạo schedule con mới
        if (selectedEvent.recurrence === "none" && newEvent.recurrence !== "none" && newEvent.recurrenceEnd) {
          let currentDate = new Date(startDate);
          const endRecurDate = moment(newEvent.recurrenceEnd).toDate();
          const interval = newEvent.recurrence === "weekly" ? 7 : 30;

          while (currentDate <= endRecurDate) {
            currentDate = new Date(currentDate);
            const nextStart = new Date(currentDate);
            const nextEnd = new Date(currentDate);
            nextEnd.setHours(endDate.getHours(), endDate.getMinutes(), 0, 0);
            if (nextStart > endRecurDate) break;

            if (newEvent.recurrence === "weekly" && newEvent.weeklyDays.length > 0) {
              const dayOfWeek = currentDate.getDay();
              if (!newEvent.weeklyDays.includes(dayOfWeek)) {
                currentDate.setDate(currentDate.getDate() + 1);
                continue;
              }
            } else if (newEvent.recurrence === "monthly" && currentDate.getDate() !== newEvent.monthlyDay) {
              currentDate.setMonth(currentDate.getMonth() + 1);
              currentDate.setDate(newEvent.monthlyDay);
              continue;
            }

            // Không tạo lại bản ghi gốc
            if (
              moment(nextStart).format("YYYY-MM-DD") === moment(startDate).format("YYYY-MM-DD")
            ) {
              currentDate.setDate(currentDate.getDate() + (newEvent.recurrence === "weekly" ? 1 : interval));
              continue;
            }

            const recurId = `schedule_${Date.now()}_${currentDate.getTime()}`;
            await setDoc(doc(db, "schedules", recurId), {
              classId: selectedEvent.classId,
              teacherId: auth.currentUser?.uid,
              title: newEvent.title,
              start: nextStart,
              end: nextEnd,
              description: newEvent.description,
              recurrence: newEvent.recurrence,
              recurrenceEnd: endRecurDate,
              parentId,
              weeklyDays: newEvent.weeklyDays,
              monthlyDay: newEvent.monthlyDay,
              createdAt: new Date(),
            });
            currentDate.setDate(currentDate.getDate() + (newEvent.recurrence === "weekly" ? 1 : interval));
          }
        } else if (newEvent.recurrence !== "none") {
          // Nếu vẫn là lặp, cập nhật schedule con
          const recurringQuery = query(collection(db, "schedules"), where("parentId", "==", parentId));
          const recurringSnapshot = await getDocs(recurringQuery);
          const updates = recurringSnapshot.docs.map((doc) =>
            updateDoc(doc.ref, {
              title: newEvent.title,
              start: startDate,
              end: endDate,
              description: newEvent.description,
              recurrence: newEvent.recurrence,
              recurrenceEnd: newEvent.recurrenceEnd ? moment(newEvent.recurrenceEnd).toDate() : null,
              weeklyDays: newEvent.weeklyDays,
              monthlyDay: newEvent.monthlyDay,
            })
          );
          await Promise.all(updates);
        }

        // Refresh events
        onRefreshEvents();
      } else {
        const scheduleId = `schedule_${Date.now()}`;
        await setDoc(doc(db, "schedules", scheduleId), {
          classId,
          teacherId: auth.currentUser?.uid,
          title: newEvent.title,
          start: startDate,
          end: endDate,
          description: newEvent.description,
          recurrence: newEvent.recurrence,
          recurrenceEnd: newEvent.recurrenceEnd ? moment(newEvent.recurrenceEnd).toDate() : null,
          parentId,
          weeklyDays: newEvent.weeklyDays,
          monthlyDay: newEvent.monthlyDay,
          createdAt: new Date(),
        });

        if (newEvent.recurrence !== "none" && newEvent.recurrenceEnd) {
          let currentDate = new Date(startDate);
          const endRecurDate = moment(newEvent.recurrenceEnd).toDate();
          const interval = newEvent.recurrence === "weekly" ? 7 : 30;

          while (currentDate <= endRecurDate) {
            currentDate = new Date(currentDate);
            const nextStart = new Date(currentDate);
            const nextEnd = new Date(currentDate);
            nextEnd.setHours(endDate.getHours(), endDate.getMinutes(), 0, 0);
            if (nextStart > endRecurDate) break;

            if (newEvent.recurrence === "weekly" && newEvent.weeklyDays.length > 0) {
              const dayOfWeek = currentDate.getDay();
              if (!newEvent.weeklyDays.includes(dayOfWeek)) {
                currentDate.setDate(currentDate.getDate() + 1);
                continue;
              }
            } else if (newEvent.recurrence === "monthly" && currentDate.getDate() !== newEvent.monthlyDay) {
              currentDate.setMonth(currentDate.getMonth() + 1);
              currentDate.setDate(newEvent.monthlyDay);
              continue;
            }

            const recurId = `schedule_${Date.now()}_${currentDate.getTime()}`;
            await setDoc(doc(db, "schedules", recurId), {
              classId,
              teacherId: auth.currentUser?.uid,
              title: newEvent.title,
              start: nextStart,
              end: nextEnd,
              description: newEvent.description,
              recurrence: newEvent.recurrence,
              recurrenceEnd: endRecurDate,
              parentId,
              weeklyDays: newEvent.weeklyDays,
              monthlyDay: newEvent.monthlyDay,
              createdAt: new Date(),
            });
            currentDate.setDate(currentDate.getDate() + (newEvent.recurrence === "weekly" ? 1 : interval));
          }
        }

        // Refresh events
        onRefreshEvents();
      }

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
      setShowModal(false);
      setError("");
    } catch (err: any) {
      setError("Lỗi khi lưu lịch học: " + err.message);
    }
  };

  const handleDeleteEvent = async (eventId: string) => {
    try {
      const eventDoc = await getDoc(doc(db, "schedules", eventId));
      if (eventDoc.exists()) {
        const parentId = eventDoc.data().parentId || eventId;
        const recurringQuery = query(collection(db, "schedules"), where("parentId", "==", parentId));
        const recurringSnapshot = await getDocs(recurringQuery);
        const deletePromises = recurringSnapshot.docs.map((doc) => deleteDoc(doc.ref));
        await Promise.all(deletePromises);

        // Refresh events after deletion
        onRefreshEvents();
        setShowModal(false);
        setError("");
      }
    } catch (err: any) {
      setError("Lỗi xóa lịch: " + err.message);
    }
  };
  return (
    <Modal
      title={newEvent.isEditing ? "Chỉnh sửa lịch học" : "Thêm lịch học mới"}
      open={showModal}
      onCancel={() => setShowModal(false)}
      footer={null}
    >
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Tiêu đề<span className="text-red-500">*</span></label>
          <Input
            value={newEvent.title}
            onChange={(e) => setNewEvent({ ...newEvent, title: e.target.value })}
            placeholder="Nhập tiêu đề lịch học"
          />
        </div>
        <div className="grid grid-cols-1 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Ngày<span className="text-red-500">*</span></label>
            <Input
              type="date"
              value={newEvent.date}
              onChange={(e) => setNewEvent({ ...newEvent, date: e.target.value })}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Giờ bắt đầu<span className="text-red-500">*</span></label>
              <Input
                type="time"
                value={newEvent.startTime}
                onChange={(e) => setNewEvent({ ...newEvent, startTime: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Giờ kết thúc<span className="text-red-500">*</span></label>
              <Input
                type="time"
                value={newEvent.endTime}
                onChange={(e) => setNewEvent({ ...newEvent, endTime: e.target.value })}
              />
            </div>
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Mô tả</label>
          <Input.TextArea
            value={newEvent.description}
            onChange={(e) => setNewEvent({ ...newEvent, description: e.target.value })}
            rows={3}
            placeholder="Nhập mô tả chi tiết"
          />
        </div>
        {userRole === "teacher" && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Liên kết với lớp học</label>
            <Select
              value={newEvent.classId}
              onChange={(value) => setNewEvent({ ...newEvent, classId: value })}
              style={{ width: "100%" }}
            >
              <Option value="">-- Tạo lớp học mới --</Option>
              {userClasses.map((cls) => (
                <Option key={cls.id} value={cls.id}>
                  {cls.name}
                </Option>
              ))}
            </Select>
          </div>
        )}
        {userRole === "teacher" && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Lặp lại</label>
            <Select
              value={newEvent.recurrence}
              onChange={(value) => setNewEvent({ ...newEvent, recurrence: value, weeklyDays: [], monthlyDay: 1 })}
              style={{ width: "100%" }}
            >
              <Option value="none">Không lặp lại</Option>
              <Option value="weekly">Hàng tuần</Option>
              <Option value="monthly">Hàng tháng</Option>
            </Select>
          </div>
        )}
        {userRole === "teacher" && newEvent.recurrence === "weekly" && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Chọn ngày trong tuần</label>
            <Checkbox.Group
              value={newEvent.weeklyDays}
              onChange={(checkedValues) => setNewEvent({ ...newEvent, weeklyDays: checkedValues as number[] })}
              style={{ width: "100%" }}
            >
              <Checkbox value={0}>Chủ nhật</Checkbox>
              <Checkbox value={1}>Thứ 2</Checkbox>
              <Checkbox value={2}>Thứ 3</Checkbox>
              <Checkbox value={3}>Thứ 4</Checkbox>
              <Checkbox value={4}>Thứ 5</Checkbox>
              <Checkbox value={5}>Thứ 6</Checkbox>
              <Checkbox value={6}>Thứ 7</Checkbox>
            </Checkbox.Group>
          </div>
        )}
        {userRole === "teacher" && newEvent.recurrence === "monthly" && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Ngày cố định trong tháng</label>
            <Select
              value={newEvent.monthlyDay}
              onChange={(value) => setNewEvent({ ...newEvent, monthlyDay: value })}
              style={{ width: "100%" }}
            >
              {Array.from({ length: 31 }, (_, i) => i + 1).map((day) => (
                <Option key={day} value={day}>
                  {day}
                </Option>
              ))}
            </Select>
          </div>
        )}
        {userRole === "teacher" && newEvent.recurrence !== "none" && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Kết thúc lặp lại</label>
            <Input
              type="date"
              value={newEvent.recurrenceEnd}
              onChange={(e) => setNewEvent({ ...newEvent, recurrenceEnd: e.target.value })}
            />
          </div>
        )}
        {error && <Alert type="error" message={error} showIcon />}
        <div className="flex justify-end space-x-4 mt-4">
          {newEvent.isEditing && userRole === "teacher" && (
            <Button
              danger
              onClick={() => handleDeleteEvent(selectedEvent.id)}
            >
              Xóa lịch
            </Button>
          )}
          <Button onClick={() => setShowModal(false)}>Hủy</Button>
          {userRole === "teacher" && (
            <Button type="primary" onClick={handleSaveEvent}>
              {newEvent.isEditing ? "Cập nhật" : "Thêm lịch"}
            </Button>
          )}
        </div>
      </div>
    </Modal>
  );
};

export default ScheduleEventModal;
