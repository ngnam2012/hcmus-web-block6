# Task API — Bài thực hành Authorization & Access Control (Block 6)
**Trường:** Đại học Khoa học Tự nhiên TP.HCM (HCMUS) — Advanced Web Development

> 📄 **Xem báo cáo nộp bài chi tiết 5 thành phần theo chuẩn Slide 26 tại [REPORT.md](./REPORT.md)**.

---

## 1. Cấu trúc dự án

```
task-api/
├── public/
│   └── index.html      # Interactive E2E Browser Dashboard (giao diện web kiểm thử trực quan)
├── src/
│   ├── db.js           # Dữ liệu mẫu (users, projects, tasks)
│   ├── auth.js         # Middleware xác thực JWT Bearer Token
│   ├── rbac.js         # Ma trận quyền RBAC
│   ├── taskService.js  # Business layer: PEP & PDP (v0, v1, v2, v3, v4)
│   └── server.js       # Express server & API endpoints
├── tests/
│   ├── run.js          # Test runner tự động (39 test cases: unit + HTTP integration)
│   └── generate-tokens.js
├── REPORT.md           # Báo cáo nộp bài đầy đủ 5 thành phần chuẩn Slide 26
└── package.json
```

---

## 2. Hướng dẫn chạy và kiểm thử

### Cài đặt dependencies
```bash
npm install
```

### Chạy kiểm thử tự động (Automated Tests)
```bash
npm test
```
> Lệnh trên sẽ tự động chạy **39 test cases** bao gồm 31 unit test logic phân quyền qua các tầng V1-V4 và 8 HTTP integration test thực tế qua Express server.

### Trải nghiệm kiểm thử E2E trên trình duyệt (Browser Dashboard)
1. Khởi động server:
   ```bash
   npm start
   ```
2. Mở trình duyệt tại:
   ```
   http://localhost:3000
   ```
3. Tại giao diện web, bạn có thể:
   - Thử nghiệm 1-click các kịch bản đọc, sửa, xóa, giả mạo role, giả mạo tenant.
   - Bấm nút **"🚀 CHẠY TOÀN BỘ TEST ORACLE"** để xem 17 test chạy tự động ngay trên trình duyệt.
   - Xem bảng ma trận phân quyền và so sánh minh chứng lỗi IDOR (trước vs sau khi sửa).

### Khởi động từng phiên bản cụ thể (Cross-platform)
```bash
npm run start:v0    # V0: Starter (có lỗ hổng IDOR)
npm run start:v1    # V1: Sửa IDOR đọc
npm run start:v2    # V2: RBAC theo project
npm run start:v3    # V3: ReBAC + ABAC
npm run start:v4    # V4: Tenant boundary (Hoàn chỉnh)
```

---

## 3. Bảng tóm tắt các phiên bản (V0 → V4)

| Phiên bản | Nội dung kiểm quyền | Mục tiêu giải quyết |
|---|---|---|
| **V0** | Chỉ kiểm token hợp lệ | Tái hiện lỗ hổng IDOR/BOLA (Alice đọc được B1) |
| **V1** | Kiểm thành viên project khi đọc | Sửa lỗi IDOR cho thao tác `read` |
| **V2** | RBAC theo project (`Viewer`, `Member`, `Owner`) | Bảo vệ thao tác ghi, xóa, quản lý TV; chống giả mạo role |
| **V3** | ReBAC (`assignee`) + ABAC (`status == 'Open'`) | Thu hẹp quyền sửa của `Member` |
| **V4** | Tenant Boundary (`user.tenant == project.tenant`) | Cách ly tổ chức; Admin chỉ có quyền trong tenant của mình |

Chi tiết đầy đủ về **Bảng chính sách quyền, Automated tests, Evidence IDOR, Code Diff, và Giải thích lựa chọn** được trình bày chi tiết trong file **[REPORT.md](./REPORT.md)**.
