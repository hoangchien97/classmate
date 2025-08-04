/* eslint-disable @typescript-eslint/no-explicit-any */
import { Input, Select, Alert, Checkbox, Button, Modal, Form } from "antd";
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
  const [form] = Form.useForm();

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
          shouldCreateEvent = true;
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

      if (recurrence === "weekly") {
        currentDate.setDate(currentDate.getDate() + 1);
      } else if (recurrence === "monthly") {
        currentDate.setMonth(currentDate.getMonth() + 1);
        currentDate.setDate(monthlyDay);
      }
    }

    for (const event of events) {
      await setDoc(doc(db, "schedules", event.id), event);
    }
  };

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
    currentDate.setDate(currentDate.getDate() + 1);
    
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

      if (recurrence === "weekly") {
        currentDate.setDate(currentDate.getDate() + 1);
      } else if (recurrence === "monthly") {
        currentDate.setMonth(currentDate.getMonth() + 1);
        currentDate.setDate(monthlyDay);
      }
    }

    for (const event of events) {
      await setDoc(doc(db, "schedules", event.id), event);
    }
  };

  const handleSaveEvent = async () => {
    try {
      // Validate form
      const values = await form.validateFields();
      
      if (!newEvent.title || !newEvent.date || !newEvent.startTime || !newEvent.endTime) {
        setError("Vui lòng nhập đầy đủ tên lịch*, ngày*, giờ bắt đầu* và giờ kết thúc*.");
        return;
      }

      // Validate class selection for teacher
      if (userRole === "teacher" && !newEvent.classId) {
        setError("Vui lòng chọn lớp học.");
        return;
      }

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

      const weeklyDays = Array.isArray(newEvent.weeklyDays) ? newEvent.weeklyDays : [];
      const monthlyDay = newEvent.monthlyDay || 1;

      const parentId = newEvent.isEditing ? (selectedEvent?.parentId || selectedEvent?.id) : `schedule_${Date.now()}`;

      if (newEvent.isEditing && selectedEvent) {
        // Update existing event
        await updateDoc(doc(db, "schedules", selectedEvent.id), {
          title: newEvent.title,
          start: startDate,
          end: endDate,
          description: newEvent.description || "",
          classId: newEvent.classId,
          recurrence: newEvent.recurrence,
          recurrenceEnd: newEvent.recurrenceEnd ? moment(newEvent.recurrenceEnd).toDate() : null,
          weeklyDays: weeklyDays,
          monthlyDay: monthlyDay,
          updatedAt: new Date(),
        });

        // Handle recurrence changes
        if (newEvent.recurrence === "none" && selectedEvent.recurrence !== "none") {
          const recurringQuery = query(collection(db, "schedules"), where("parentId", "==", parentId));
          const recurringSnapshot = await getDocs(recurringQuery);
          const deletePromises = recurringSnapshot.docs
            .filter((doc) => doc.id !== selectedEvent.id)
            .map((doc) => deleteDoc(doc.ref));
          await Promise.all(deletePromises);
        } else if (selectedEvent.recurrence === "none" && newEvent.recurrence !== "none" && newEvent.recurrenceEnd) {
          const eventData = {
            classId: newEvent.classId,
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
          const recurringQuery = query(collection(db, "schedules"), where("parentId", "==", parentId));
          const recurringSnapshot = await getDocs(recurringQuery);
          
          const newRecurrenceEndDate = moment(newEvent.recurrenceEnd).toDate();
          
          const eventsToUpdate = [];
          const eventsToDelete = [];
          
          recurringSnapshot.docs.forEach((doc) => {
            const eventData = doc.data();
            const eventStart = eventData.start.toDate();
            
            if (eventStart <= newRecurrenceEndDate) {
              eventsToUpdate.push(doc);
            } else {
              eventsToDelete.push(doc);
            }
          });
          
          if (eventsToDelete.length > 0) {
            const deletePromises = eventsToDelete.map((doc) => deleteDoc(doc.ref));
            await Promise.all(deletePromises);
          }
          
          if (eventsToUpdate.length > 0) {
            const updatePromises = eventsToUpdate.map((doc) =>
              updateDoc(doc.ref, {
                title: newEvent.title,
                description: newEvent.description || "",
                classId: newEvent.classId,
                recurrence: newEvent.recurrence,
                recurrenceEnd: newRecurrenceEndDate,
                weeklyDays: weeklyDays,
                monthlyDay: monthlyDay,
                updatedAt: new Date(),
              })
            );
            await Promise.all(updatePromises);
          }
          
          const oldRecurrenceEnd = selectedEvent.recurrenceEnd ? new Date(selectedEvent.recurrenceEnd) : null;
          
          if (oldRecurrenceEnd && newRecurrenceEndDate > oldRecurrenceEnd) {
            const eventData = {
              classId: newEvent.classId,
              teacherId: auth.currentUser?.uid,
              title: newEvent.title,
              description: newEvent.description || "",
              recurrence: newEvent.recurrence,
              recurrenceEnd: newRecurrenceEndDate,
              weeklyDays: weeklyDays,
              monthlyDay: monthlyDay,
            };

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
          classId: newEvent.classId,
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

        if (newEvent.recurrence !== "none" && newEvent.recurrenceEnd) {
          const eventData = {
            classId: newEvent.classId,
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
      form.resetFields();
      setShowModal(false);
      setError("");
      onRefreshEvents();
    } catch (err: any) {
      if (err.errorFields) {
        // Form validation error
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
      centered
      footer={null}
      width={700}
    >
      <Form form={form} layout="vertical">
        <div className="">
          {/* Tên lịch và Lớp học cùng 1 hàng */}
          <div className="grid grid-cols-2 gap-4">
            <Form.Item
              label="Tên lịch"
              name="title"
              rules={[{ required: true, message: 'Vui lòng nhập tên lịch!' }]}
            >
              <Input
                value={newEvent.title}
                onChange={(e) => setNewEvent({ ...newEvent, title: e.target.value })}
                placeholder="Nhập tên lịch học"
              />
            </Form.Item>
            
            {userRole === "teacher" && (
              <Form.Item
                label="Lớp học"
                name="classId"
                rules={[{ required: true, message: 'Vui lòng chọn lớp học!' }]}
              >
                <Select
                  value={newEvent.classId}
                  onChange={(value) => setNewEvent({ ...newEvent, classId: value })}
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
          
          {/* Ngày, Giờ bắt đầu và Giờ kết thúc */}
          <div className="grid grid-cols-3 gap-4">
            <Form.Item
              label="Ngày"
              name="date"
              rules={[{ required: true, message: 'Vui lòng chọn ngày!' }]}
            >
              <Input
                type="date"
                value={newEvent.date}
                onChange={(e) => setNewEvent({ ...newEvent, date: e.target.value })}
              />
            </Form.Item>
            
            <Form.Item
              label="Giờ bắt đầu"
              name="startTime"
              rules={[{ required: true, message: 'Vui lòng chọn giờ bắt đầu!' }]}
            >
              <Input
                type="time"
                value={newEvent.startTime}
                onChange={(e) => setNewEvent({ ...newEvent, startTime: e.target.value })}
              />
            </Form.Item>
            
            <Form.Item
              label="Giờ kết thúc"
              name="endTime"
              rules={[{ required: true, message: 'Vui lòng chọn giờ kết thúc!' }]}
            >
              <Input
                type="time"
                value={newEvent.endTime}
                onChange={(e) => setNewEvent({ ...newEvent, endTime: e.target.value })}
              />
            </Form.Item>
          </div>
          
          {/* Mô tả */}
          <Form.Item label="Mô tả">
            <Input.TextArea
              value={newEvent.description}
              onChange={(e) => setNewEvent({ ...newEvent, description: e.target.value })}
              rows={3}
              placeholder="Nhập mô tả chi tiết"
            />
          </Form.Item>
          
          {/* Lặp lại - chỉ hiển thị cho teacher */}
          {userRole === "teacher" && (
            <Form.Item label="Lặp lại">
              <Select
                value={newEvent.recurrence}
                onChange={(value) => setNewEvent({ 
                  ...newEvent, 
                  recurrence: value, 
                  weeklyDays: [], 
                  monthlyDay: 1 
                })}
              >
                <Option value="none">Không lặp lại</Option>
                <Option value="weekly">Hàng tuần</Option>
                <Option value="monthly">Hàng tháng</Option>
              </Select>
            </Form.Item>
          )}
          
          {/* Chọn ngày trong tuần - cho lặp lại hàng tuần */}
          {userRole === "teacher" && newEvent.recurrence === "weekly" && (
            <Form.Item label="Chọn ngày trong tuần">
              <Checkbox.Group
                value={Array.isArray(newEvent.weeklyDays) ? newEvent.weeklyDays : []}
                onChange={(checkedValues) => setNewEvent({ 
                  ...newEvent, 
                  weeklyDays: checkedValues as number[] 
                })}
              >
                <div className="flex gap-3">
                  <Checkbox value={1}>Thứ 2</Checkbox>
                  <Checkbox value={2}>Thứ 3</Checkbox>
                  <Checkbox value={3}>Thứ 4</Checkbox>
                  <Checkbox value={4}>Thứ 5</Checkbox>
                  <Checkbox value={5}>Thứ 6</Checkbox>
                  <Checkbox value={6}>Thứ 7</Checkbox>
                  <Checkbox value={0}>Chủ nhật</Checkbox>
                </div>
              </Checkbox.Group>
            </Form.Item>
          )}
          
          {/* Ngày cố định trong tháng - cho lặp lại hàng tháng */}
          {userRole === "teacher" && newEvent.recurrence === "monthly" && (
            <Form.Item label="Ngày cố định trong tháng">
              <Select
                value={newEvent.monthlyDay || 1}
                onChange={(value) => setNewEvent({ ...newEvent, monthlyDay: value })}
                style={{ width: "200px" }}
              >
                {Array.from({ length: 31 }, (_, i) => i + 1).map((day) => (
                  <Option key={day} value={day}>
                    Ngày {day}
                  </Option>
                ))}
              </Select>
            </Form.Item>
          )}
          
          {/* Kết thúc lặp lại */}
          {userRole === "teacher" && newEvent.recurrence !== "none" && (
            <Form.Item
              label={
                <span>
                  Kết thúc lặp lại
                  <span className="text-red-500 ml-1">*</span>
                </span>
              }
            >
              <Input
                type="date"
                value={newEvent.recurrenceEnd}
                onChange={(e) => setNewEvent({ ...newEvent, recurrenceEnd: e.target.value })}
              />
            </Form.Item>
          )}
          
          {/* Error Alert */}
          {error && (
            <Alert 
              type="error" 
              message={error} 
              showIcon 
              className="mb-4"
            />
          )}
          
          {/* Footer buttons */}
          <div className="flex justify-end gap-3 pt-6 border-t border-gray-200">
            {newEvent.isEditing && userRole === "teacher" && (
              <Button
                danger
                onClick={() => handleDeleteEvent(selectedEvent.id)}
                size="large"
              >
                Xóa lịch
              </Button>
            )}
            <Button 
              onClick={() => setShowModal(false)}
              size="large"
            >
              Hủy
            </Button>
            {userRole === "teacher" && (
              <Button 
                type="primary" 
                onClick={handleSaveEvent}
                size="large"
              >
                {newEvent.isEditing ? "Cập nhật" : "Thêm lịch"}
              </Button>
            )}
          </div>
        </div>
      </Form>
    </Modal>
  );
};

export default ScheduleEventModal;
