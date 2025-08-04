/* eslint-disable @typescript-eslint/no-explicit-any */
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

  const generateRecurringEvents = async (
    startDate: Date,
    endDate: Date,
    recurrenceEnd: Date,
    recurrence: string,
    weeklyDays: number[],
    monthlyDay: number,
    eventData: any,
    parentId: string
  ) => {
    const events = [];
    let currentDate = new Date(startDate);
    
    while (currentDate <= recurrenceEnd) {
      let shouldCreateEvent = false;
      
      if (recurrence === "weekly") {
        const dayOfWeek = currentDate.getDay();
        if (Array.isArray(weeklyDays) && weeklyDays.length > 0) {
          shouldCreateEvent = weeklyDays.includes(dayOfWeek);
        } else {
          shouldCreateEvent = true; // Default weekly if no specific days
        }
      } else if (recurrence === "monthly") {
        shouldCreateEvent = currentDate.getDate() === monthlyDay;
      }

      if (shouldCreateEvent && currentDate.getTime() !== startDate.getTime()) {
        const nextStart = new Date(currentDate);
        nextStart.setHours(startDate.getHours(), startDate.getMinutes(), 0, 0);
        
        const nextEnd = new Date(currentDate);
        nextEnd.setHours(endDate.getHours(), endDate.getMinutes(), 0, 0);

        if (nextStart <= recurrenceEnd) {
          const recurId = `schedule_${Date.now()}_${Math.random()}`;
          events.push({
            id: recurId,
            ...eventData,
            start: nextStart,
            end: nextEnd,
            parentId,
            createdAt: new Date(),
          });
        }
      }

      // Move to next occurrence
      if (recurrence === "weekly") {
        currentDate.setDate(currentDate.getDate() + 1);
      } else if (recurrence === "monthly") {
        currentDate.setMonth(currentDate.getMonth() + 1);
        currentDate.setDate(monthlyDay);
      }
    }

    // Save all events to Firestore
    for (const event of events) {
      await setDoc(doc(db, "schedules", event.id), event);
    }
  };

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

      // Ensure weeklyDays is always an array
      const weeklyDays = Array.isArray(newEvent.weeklyDays) ? newEvent.weeklyDays : [];
      const monthlyDay = newEvent.monthlyDay || 1;

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

      const parentId = newEvent.isEditing ? (selectedEvent?.parentId || selectedEvent?.id) : `schedule_${Date.now()}`;

      if (newEvent.isEditing && selectedEvent) {
        // Update existing event
        await updateDoc(doc(db, "schedules", selectedEvent.id), {
          title: newEvent.title,
          start: startDate,
          end: endDate,
          description: newEvent.description || "",
          recurrence: newEvent.recurrence,
          recurrenceEnd: newEvent.recurrenceEnd ? moment(newEvent.recurrenceEnd).toDate() : null,
          weeklyDays: weeklyDays,
          monthlyDay: monthlyDay,
          updatedAt: new Date(),
        });

        // Handle recurrence changes
        if (newEvent.recurrence === "none" && selectedEvent.recurrence !== "none") {
          // Remove recurring events when changing to "none"
          const recurringQuery = query(collection(db, "schedules"), where("parentId", "==", parentId));
          const recurringSnapshot = await getDocs(recurringQuery);
          const deletePromises = recurringSnapshot.docs
            .filter((doc) => doc.id !== selectedEvent.id)
            .map((doc) => deleteDoc(doc.ref));
          await Promise.all(deletePromises);
        } else if (selectedEvent.recurrence === "none" && newEvent.recurrence !== "none" && newEvent.recurrenceEnd) {
          // Create recurring events when changing from "none" to recurring
          const eventData = {
            classId: selectedEvent.classId || classId,
            teacherId: auth.currentUser?.uid,
            title: newEvent.title,
            description: newEvent.description || "",
            recurrence: newEvent.recurrence,
            recurrenceEnd: moment(newEvent.recurrenceEnd).toDate(),
            weeklyDays: weeklyDays,
            monthlyDay: monthlyDay,
          };

          await generateRecurringEvents(
            startDate,
            endDate,
            moment(newEvent.recurrenceEnd).toDate(),
            newEvent.recurrence,
            weeklyDays,
            monthlyDay,
            eventData,
            parentId
          );
        } else if (newEvent.recurrence !== "none") {
          // Update all recurring events and handle recurrenceEnd changes
          const recurringQuery = query(collection(db, "schedules"), where("parentId", "==", parentId));
          const recurringSnapshot = await getDocs(recurringQuery);
          
          const newRecurrenceEndDate = moment(newEvent.recurrenceEnd).toDate();
          
          // Separate events into update and delete groups
          const eventsToUpdate = [];
          const eventsToDelete = [];
          
          recurringSnapshot.docs.forEach((doc) => {
            const eventData = doc.data();
            const eventStart = eventData.start.toDate();
            
            if (eventStart <= newRecurrenceEndDate) {
              // Event is within new recurrence range - update it
              eventsToUpdate.push(doc);
            } else {
              // Event is outside new recurrence range - delete it
              eventsToDelete.push(doc);
            }
          });
          
          // Delete events outside the new recurrence range
          if (eventsToDelete.length > 0) {
            const deletePromises = eventsToDelete.map((doc) => deleteDoc(doc.ref));
            await Promise.all(deletePromises);
          }
          
          // Update remaining events
          if (eventsToUpdate.length > 0) {
            const updatePromises = eventsToUpdate.map((doc) =>
              updateDoc(doc.ref, {
                title: newEvent.title,
                description: newEvent.description || "",
                recurrence: newEvent.recurrence,
                recurrenceEnd: newRecurrenceEndDate,
                weeklyDays: weeklyDays,
                monthlyDay: monthlyDay,
                updatedAt: new Date(),
              })
            );
            await Promise.all(updatePromises);
          }
          
          // Check if we need to generate additional events (if recurrence end was extended)
          const oldRecurrenceEnd = selectedEvent.recurrenceEnd ? new Date(selectedEvent.recurrenceEnd) : null;
          
          if (oldRecurrenceEnd && newRecurrenceEndDate > oldRecurrenceEnd) {
            // Generate new events for the extended period
            const eventData = {
              classId: selectedEvent.classId || classId,
              teacherId: auth.currentUser?.uid,
              title: newEvent.title,
              description: newEvent.description || "",
              recurrence: newEvent.recurrence,
              recurrenceEnd: newRecurrenceEndDate,
              weeklyDays: weeklyDays,
              monthlyDay: monthlyDay,
            };

            // Generate events from old end date to new end date
            await generateRecurringEventsInRange(
              startDate,
              endDate,
              oldRecurrenceEnd,
              newRecurrenceEndDate,
              newEvent.recurrence,
              weeklyDays,
              monthlyDay,
              eventData,
              parentId
            );
          }
        }
      } else {
        // Create new event
        const scheduleId = `schedule_${Date.now()}`;
        await setDoc(doc(db, "schedules", scheduleId), {
          classId,
          teacherId: auth.currentUser?.uid,
          title: newEvent.title,
          start: startDate,
          end: endDate,
          description: newEvent.description || "",
          recurrence: newEvent.recurrence,
          recurrenceEnd: newEvent.recurrenceEnd ? moment(newEvent.recurrenceEnd).toDate() : null,
          parentId: parentId,
          weeklyDays: weeklyDays,
          monthlyDay: monthlyDay,
          createdAt: new Date(),
        });

        // Create recurring events if needed
        if (newEvent.recurrence !== "none" && newEvent.recurrenceEnd) {
          const eventData = {
            classId,
            teacherId: auth.currentUser?.uid,
            title: newEvent.title,
            description: newEvent.description || "",
            recurrence: newEvent.recurrence,
            recurrenceEnd: moment(newEvent.recurrenceEnd).toDate(),
            weeklyDays: weeklyDays,
            monthlyDay: monthlyDay,
          };

          await generateRecurringEvents(
            startDate,
            endDate,
            moment(newEvent.recurrenceEnd).toDate(),
            newEvent.recurrence,
            weeklyDays,
            monthlyDay,
            eventData,
            parentId
          );
        }
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
      setShowModal(false);
      setError("");
      onRefreshEvents();
    } catch (err: any) {
      console.error("Error saving schedule:", err);
      setError("Lỗi khi lưu lịch học: " + err.message);
    }
  };

  // Helper function to generate events in a specific range
  const generateRecurringEventsInRange = async (
    originalStartDate: Date,
    originalEndDate: Date,
    rangeStart: Date,
    rangeEnd: Date,
    recurrence: string,
    weeklyDays: number[],
    monthlyDay: number,
    eventData: any,
    parentId: string
  ) => {
    const events = [];
    let currentDate = new Date(rangeStart);
    currentDate.setDate(currentDate.getDate() + 1); // Start from day after rangeStart
    
    while (currentDate <= rangeEnd) {
      let shouldCreateEvent = false;
      
      if (recurrence === "weekly") {
        const dayOfWeek = currentDate.getDay();
        if (Array.isArray(weeklyDays) && weeklyDays.length > 0) {
          shouldCreateEvent = weeklyDays.includes(dayOfWeek);
        } else {
          shouldCreateEvent = true;
        }
      } else if (recurrence === "monthly") {
        shouldCreateEvent = currentDate.getDate() === monthlyDay;
      }

      if (shouldCreateEvent) {
        const nextStart = new Date(currentDate);
        nextStart.setHours(originalStartDate.getHours(), originalStartDate.getMinutes(), 0, 0);
        
        const nextEnd = new Date(currentDate);
        nextEnd.setHours(originalEndDate.getHours(), originalEndDate.getMinutes(), 0, 0);

        if (nextStart <= rangeEnd) {
          const recurId = `schedule_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
          events.push({
            id: recurId,
            ...eventData,
            start: nextStart,
            end: nextEnd,
            parentId,
            createdAt: new Date(),
          });
        }
      }

      // Move to next occurrence
      if (recurrence === "weekly") {
        currentDate.setDate(currentDate.getDate() + 1);
      } else if (recurrence === "monthly") {
        currentDate.setMonth(currentDate.getMonth() + 1);
        currentDate.setDate(monthlyDay);
      }
    }

    // Save all events to Firestore
    for (const event of events) {
      await setDoc(doc(db, "schedules", event.id), event);
    }
  };

  const handleDeleteEvent = async (eventId: string) => {
    try {
      const eventDoc = await getDoc(doc(db, "schedules", eventId));
      if (eventDoc.exists()) {
        const eventData = eventDoc.data();
        const parentId = eventData.parentId || eventId;
        
        // Delete all related recurring events
        const recurringQuery = query(collection(db, "schedules"), where("parentId", "==", parentId));
        const recurringSnapshot = await getDocs(recurringQuery);
        const deletePromises = recurringSnapshot.docs.map((doc) => deleteDoc(doc.ref));
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
      footer={null}
      width={600}
    >
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Tiêu đề<span className="text-red-500">*</span>
          </label>
          <Input
            value={newEvent.title}
            onChange={(e) => setNewEvent({ ...newEvent, title: e.target.value })}
            placeholder="Nhập tiêu đề lịch học"
          />
        </div>
        
        <div className="grid grid-cols-1 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Ngày<span className="text-red-500">*</span>
            </label>
            <Input
              type="date"
              value={newEvent.date}
              onChange={(e) => setNewEvent({ ...newEvent, date: e.target.value })}
            />
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Giờ bắt đầu<span className="text-red-500">*</span>
              </label>
              <Input
                type="time"
                value={newEvent.startTime}
                onChange={(e) => setNewEvent({ ...newEvent, startTime: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Giờ kết thúc<span className="text-red-500">*</span>
              </label>
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
              placeholder="Chọn lớp học"
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
              onChange={(value) => setNewEvent({ 
                ...newEvent, 
                recurrence: value, 
                weeklyDays: [], 
                monthlyDay: 1 
              })}
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
              value={Array.isArray(newEvent.weeklyDays) ? newEvent.weeklyDays : []}
              onChange={(checkedValues) => setNewEvent({ 
                ...newEvent, 
                weeklyDays: checkedValues as number[] 
              })}
              style={{ width: "100%" }}
            >
              <div className="grid grid-cols-4 gap-2">
                <Checkbox value={0}>Chủ nhật</Checkbox>
                <Checkbox value={1}>Thứ 2</Checkbox>
                <Checkbox value={2}>Thứ 3</Checkbox>
                <Checkbox value={3}>Thứ 4</Checkbox>
                <Checkbox value={4}>Thứ 5</Checkbox>
                <Checkbox value={5}>Thứ 6</Checkbox>
                <Checkbox value={6}>Thứ 7</Checkbox>
              </div>
            </Checkbox.Group>
          </div>
        )}
        
        {userRole === "teacher" && newEvent.recurrence === "monthly" && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Ngày cố định trong tháng</label>
            <Select
              value={newEvent.monthlyDay || 1}
              onChange={(value) => setNewEvent({ ...newEvent, monthlyDay: value })}
              style={{ width: "100%" }}
            >
              {Array.from({ length: 31 }, (_, i) => i + 1).map((day) => (
                <Option key={day} value={day}>
                  Ngày {day}
                </Option>
              ))}
            </Select>
          </div>
        )}
        
        {userRole === "teacher" && newEvent.recurrence !== "none" && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Kết thúc lặp lại<span className="text-red-500">*</span>
            </label>
            <Input
              type="date"
              value={newEvent.recurrenceEnd}
              onChange={(e) => setNewEvent({ ...newEvent, recurrenceEnd: e.target.value })}
            />
          </div>
        )}
        
        {error && <Alert type="error" message={error} showIcon />}
        
        <div className="flex justify-end space-x-4 mt-6 pt-4 border-t">
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
