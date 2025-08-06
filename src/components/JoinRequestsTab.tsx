import { useState, useEffect } from "react";
import { doc, updateDoc, arrayRemove, arrayUnion } from "firebase/firestore";
import { db } from "@/firebase/firebase";
import { Button, List, message } from "antd";
import { UserOutlined } from "@ant-design/icons";

interface JoinRequest {
  studentId: string;
  studentName?: string;
  requestedAt: { seconds: number };
}

interface JoinRequestsTabProps {
  classId: string;
  userRole: string;
  joinRequests?: JoinRequest[];
  onRequestsChange?: (requests: JoinRequest[]) => void;
  onStudentAdded?: (studentId: string) => void;
  onShowMessage?: (type: 'success' | 'error', message: string) => void;
}

function JoinRequestsTab({ 
  classId, 
  userRole, 
  joinRequests = [], 
  onRequestsChange,
  onStudentAdded,
  onShowMessage
}: JoinRequestsTabProps) {
  const [requests, setRequests] = useState<JoinRequest[]>(joinRequests);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setRequests(joinRequests);
  }, [joinRequests]);

  const handleAcceptJoinRequest = async (studentId: string) => {
    try {
      setLoading(true);
      const requestToRemove = requests.find(req => req.studentId === studentId);
      
      if (!requestToRemove) {
        message.error("Không tìm thấy yêu cầu tham gia");
        return;
      }

      await updateDoc(doc(db, "classes", classId), {
        studentIds: arrayUnion(studentId),
        joinRequests: arrayRemove(requestToRemove),
      });

      const updatedRequests = requests.filter(req => req.studentId !== studentId);
      setRequests(updatedRequests);
      onRequestsChange?.(updatedRequests);
      onStudentAdded?.(studentId);
      
      onShowMessage?.('success', "Đã chấp nhận yêu cầu tham gia!");
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : "Lỗi không xác định";
      onShowMessage?.('error', `Lỗi khi chấp nhận yêu cầu: ${errorMessage}`);
    } finally {
      setLoading(false);
    }
  };

  const handleRejectJoinRequest = async (studentId: string) => {
    try {
      setLoading(true);
      const requestToRemove = requests.find(req => req.studentId === studentId);
      
      if (!requestToRemove) {
        message.error("Không tìm thấy yêu cầu tham gia");
        return;
      }

      await updateDoc(doc(db, "classes", classId), {
        joinRequests: arrayRemove(requestToRemove),
      });

      const updatedRequests = requests.filter(req => req.studentId !== studentId);
      setRequests(updatedRequests);
      onRequestsChange?.(updatedRequests);
      
      onShowMessage?.('success', "Đã từ chối yêu cầu tham gia!");
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : "Lỗi không xác định";
      onShowMessage?.('error', `Lỗi khi từ chối yêu cầu: ${errorMessage}`);
    } finally {
      setLoading(false);
    }
  };

  // Only teachers can see this tab
  if (userRole !== "teacher") {
    return null;
  }

  return (
    <div>
      
      {requests && requests.length > 0 ? (
        <List
          dataSource={requests}
          renderItem={(request: JoinRequest) => (
            <List.Item
              actions={[
                <Button
                  type="primary"
                  size="small"
                  onClick={() => handleAcceptJoinRequest(request.studentId)}
                  loading={loading}
                  disabled={loading}
                >
                  Chấp nhận
                </Button>,
                <Button
                  danger
                  size="small"
                  onClick={() => handleRejectJoinRequest(request.studentId)}
                  loading={loading}
                  disabled={loading}
                >
                  Từ chối
                </Button>,
              ]}
            >
              <List.Item.Meta
                avatar={<UserOutlined />}
                title={request.studentName || "Không có tên"}
                description={`Gửi vào: ${new Date(request.requestedAt.seconds * 1000).toLocaleDateString()}`}
              />
            </List.Item>
          )}
        />
      ) : (
        <div className="text-center py-8">
          <UserOutlined className="text-4xl text-gray-300 mb-4" />
          <p className="text-gray-500 mb-4">Chưa có yêu cầu tham gia nào</p>
        </div>
      )}
    </div>
  );
}

export default JoinRequestsTab;
