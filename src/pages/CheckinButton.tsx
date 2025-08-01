import { Button } from "antd";
import { useState } from "react";
import { toast } from "react-toastify";
import { updateDoc, doc, arrayUnion } from "firebase/firestore";
import { db } from "@/firebase/firebase";

function isCheckinAvailable(selectedClass: any) {
  if (!selectedClass || !selectedClass.schedule || selectedClass.schedule.length === 0) return false;
  const now = new Date();
  const today = now.getDay();
  const slot = selectedClass.schedule.find((s: any) => s.dayOfWeek === today);
  if (!slot) return false;
  const [h, m] = slot.startTime.split(":").map(Number);
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m, 0, 0);
  const diff = (now.getTime() - start.getTime()) / 60000;
  return diff >= 0 && diff <= 30;
}

export default function CheckinButton({ selectedClass, userId }: { selectedClass: any, userId: string }) {
  const [loading, setLoading] = useState(false);
  const [checked, setChecked] = useState(false);

  const handleCheckin = async () => {
    setLoading(true);
    try {
      await updateDoc(doc(db, "classes", selectedClass.id), {
        checkins: arrayUnion({ studentId: userId, checkedAt: new Date() })
      });
      setChecked(true);
      toast.success("Checkin thành công!");
    } catch (err: any) {
      toast.error("Checkin thất bại: " + err.message);
    }
    setLoading(false);
  };

  if (!isCheckinAvailable(selectedClass)) return null;
  if (checked) return <Button disabled>Đã checkin</Button>;
  return <Button type="primary" loading={loading} onClick={handleCheckin}>Checkin</Button>;
}
