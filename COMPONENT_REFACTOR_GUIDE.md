# Refactor ClassDetailPage - Component Architecture

## Tổng quan

ClassDetailPage đã được tách thành các component con để cải thiện khả năng bảo trì, debug và mở rộng. Mỗi tab hiện tại được quản lý bởi một component riêng biệt với logic xử lý riêng.

## Cấu trúc mới

### 1. ClassDetailPage (Parent Component)
**Đường dẫn:** `src/pages/ClassDetailPage.tsx`

**Trách nhiệm:**
- Quản lý authentication và user state
- Fetch dữ liệu class ban đầu
- Điều phối giữa các tab component
- Layout chính và navigation

**State quản lý:**
- `classData`: Thông tin cơ bản của lớp học
- `students`: Danh sách học sinh
- `userRole`, `userId`: Thông tin user hiện tại
- `loading`: Trạng thái loading

### 2. ClassInfoTab Component
**Đường dẫn:** `src/components/ClassInfoTab.tsx`

**Trách nhiệm:**
- Hiển thị thông tin chi tiết lớp học
- Chỉnh sửa thông tin lớp học (chỉ teacher)
- Xóa lớp học và tất cả dữ liệu liên quan (chỉ teacher)
- Hiển thị thống kê (số học sinh, số lịch học)

**Props:**
```typescript
interface ClassInfoTabProps {
  classId: string;
  userRole: string;
  userId: string;
  initialClassData?: ClassData;
  onClassDataChange?: (classData: ClassData) => void;
}
```

**API Calls:**
- `updateDoc()`: Cập nhật thông tin lớp học
- `deleteDoc()`: Xóa lớp học và lịch học liên quan

### 3. StudentsTab Component
**Đường dẫn:** `src/components/StudentsTab.tsx`

**Trách nhiệm:**
- Hiển thị danh sách học sinh
- Mời học sinh vào lớp (multiple selection)
- Xóa học sinh khỏi lớp
- Tìm kiếm và filter học sinh

**Props:**
```typescript
interface StudentsTabProps {
  classId: string;
  userRole: string;
  initialStudents?: Student[];
  classData?: { studentIds?: string[] };
  onStudentsChange?: (students: Student[]) => void;
}
```

**API Calls:**
- `getDocs()`: Fetch tất cả students
- `updateDoc()` với `arrayUnion()`: Thêm học sinh
- `updateDoc()` với `arrayRemove()`: Xóa học sinh

### 4. ScheduleTab Component
**Đường dẫn:** `src/components/ScheduleTab.tsx`

**Trách nhiệm:**
- Hiển thị danh sách lịch học
- Tạo/chỉnh sửa lịch học (chỉ teacher)
- Xóa lịch học và recurring sessions (chỉ teacher)
- Hiển thị thông tin recurring (weekly/monthly)

**Props:**
```typescript
interface ScheduleTabProps {
  classId: string;
  userRole: string;
  userId: string;
  classData: {
    name: string;
    teacherId: string;
  };
}
```

**API Calls:**
- `getDocs()`: Fetch schedules theo classId
- `deleteDoc()`: Xóa schedule và recurring sessions

### 5. JoinRequestsTab Component
**Đường dẫn:** `src/components/JoinRequestsTab.tsx`

**Trách nhiệm:**
- Hiển thị danh sách yêu cầu tham gia (chỉ teacher)
- Chấp nhận/từ chối yêu cầu tham gia
- Tự động thêm học sinh khi chấp nhận

**Props:**
```typescript
interface JoinRequestsTabProps {
  classId: string;
  userRole: string;
  joinRequests?: JoinRequest[];
  onRequestsChange?: (requests: JoinRequest[]) => void;
  onStudentAdded?: (studentId: string) => void;
}
```

**API Calls:**
- `updateDoc()`: Chấp nhận/từ chối requests

## Lợi ích của việc refactor

### 1. **Separation of Concerns**
- Mỗi component chỉ chịu trách nhiệm cho một tính năng cụ thể
- Logic xử lý được tách riêng, dễ debug
- Reduced coupling between features

### 2. **Reusability**
- Các component có thể được tái sử dụng ở nơi khác
- Props interface rõ ràng, dễ integration

### 3. **Maintainability**
- Code ngắn gọn hơn, dễ đọc
- Bug isolation - lỗi chỉ ảnh hưởng đến component cụ thể
- Testing dễ dàng hơn

### 4. **Performance**
- Mỗi component quản lý state riêng, giảm re-render không cần thiết
- Lazy loading có thể được implement dễ dàng

### 5. **Scalability**
- Thêm tính năng mới không ảnh hưởng đến code hiện tại
- Dễ dàng thêm tabs mới

## Cách sử dụng

### Thêm tab mới:
1. Tạo component mới trong `src/components/`
2. Implement interface props phù hợp
3. Add component vào ClassDetailPage
4. Thêm TabPane mới

### Modify existing tab:
1. Chỉ cần sửa component tương ứng
2. Các tab khác không bị ảnh hưởng

### Debug issue:
1. Xác định tab nào có vấn đề
2. Focus vào component cụ thể
3. Kiểm tra props và API calls

## Migration Notes

- Tất cả functionality được giữ nguyên
- API calls được phân tán vào từng component
- State management được simplified
- No breaking changes cho user experience

## Future Improvements

1. **Add Error Boundaries** cho từng tab
2. **Implement Loading states** cho từng component
3. **Add Unit Tests** cho từng component
4. **Optimize API calls** với caching
5. **Add TypeScript strict mode** compliance
