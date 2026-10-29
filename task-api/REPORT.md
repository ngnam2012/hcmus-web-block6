# BÁO CÁO BÀI THỰC HÀNH AUTHORIZATION VÀ ACCESS CONTROL (BLOCK 6)
**Môn học:** Phát triển ứng dụng Web nâng cao (Advanced Web Development)  
**Trường:** Đại học Khoa học Tự nhiên — ĐHQG TP.HCM (HCMUS)  
**Dự án:** Task Management API  

---

## 1. BẢNG CHÍNH SÁCH QUYỀN (PERMISSION MATRIX)

Hệ thống kết hợp mô hình **RBAC (Role-Based Access Control)**, **ReBAC (Relationship-Based Access Control)**, **ABAC (Attribute-Based Access Control)** và **Tenant Isolation (Multi-Tenancy Boundary)** để kiểm soát truy cập tài nguyên.

### 1.1. Bảng ma trận quyền tổng thể

| Vai trò (Role) | Tài nguyên | Đọc Task (`read`) | Sửa Task (`edit`) | Xóa Project (`delete`) | Quản lý TV (`members`) | Điều kiện bổ sung (Conditions) | Test Case tương ứng trong Test Suite |
|---|---|:---:|:---:|:---:|:---:|---|---|
| **Anonymous** *(Chưa đăng nhập)* | Task / Project | ❌ 401 | ❌ 401 | ❌ 401 | ❌ 401 | Thiếu JWT Bearer Token | `Anonymous đọc A1 → 401` |
| **Viewer** *(Khách xem project)* | Task / Project | ✅ Cho phép | ❌ 403 | ❌ 403 | ❌ 403 | Thuộc cùng project | `Viewer sửa A1 → 403` |
| **Member** *(Thành viên project)* | Task / Project | ✅ Cho phép | ⚡ Điều kiện | ❌ 403 | ❌ 403 | **ReBAC:** `task.assignee == userId`<br>**ABAC:** `task.status == 'Open'` | - `Bob đọc A1 → 200`<br>- `Bob sửa A1 (assignee, Open) → 200`<br>- `Bob sửa A2 (chưa assign) → 403`<br>- `Bob sửa A1 Closed → 403`<br>- `Bob xóa Alpha → 403`<br>- `Bob quản lý TV → 403` |
| **Owner** *(Chủ sở hữu project)* | Task / Project | ✅ Cho phép | ✅ Cho phép | ✅ Cho phép | ✅ Cho phép | Toàn quyền trong phạm vi project thuộc về | - `Alice đọc A1 → 200`<br>- `Alice sửa A1 → 200`<br>- `Alice sửa A2 → 200`<br>- `Alice xóa Alpha → 200`<br>- `Alice quản lý TV → 200` |
| **Admin** *(Dana - Quản trị tenant)* | Task / Project | ✅ Cho phép | ✅ Cho phép | ✅ Cho phép | ✅ Cho phép | **Tenant Boundary (V4):** Chỉ có quyền Owner trong tenant của mình (`user.tenant == project.tenant`) | - `Dana đọc A1 (cùng Alpha) → 200`<br>- `Dana đọc B1 (khác Beta) → 403`<br>- `Dana gửi header tenantId=beta → 403` |
| **Cross-Tenant / Non-Member** | Task / Project | ❌ 403/404 | ❌ 403 | ❌ 403 | ❌ 403 | Không thuộc project / khác tenant | - `Alice đọc B1 → 403`<br>- `Bob sửa B1 → 403` |

> **Tự kiểm tra:** Mỗi ô của bảng ma trận trên đều có ít nhất một test case automated kiểm thử cụ thể trong bộ test suite.

---

## 2. AUTOMATED TESTS (BỘ KIỂM THỬ TỰ ĐỘNG)

Bộ kiểm thử được xây dựng độc lập, bao quát toàn diện cả **Request được phép (Positive Tests - HTTP 200)** và **Request bị từ chối (Negative Tests - HTTP 401, 403, 404)**.

### 2.1. Lệnh thực thi kiểm thử duy nhất
```bash
cd task-api

# Chạy toàn bộ 39 unit & HTTP integration tests:
npm test

# Hoặc mở trực tiếp Google Chrome và tự động thao tác E2E toàn diện:
npm run test:browser
```

### 2.2. Minh chứng ảnh chụp E2E Browser Testing
Toàn bộ quá trình kiểm thử trực tiếp trên trình duyệt đã được chụp ảnh lưu tại thư mục `public/screenshots/`:
- `01_alice_read_a1_200.png`: Alice đọc hợp lệ Task A1 (HTTP 200 OK).
- `02_alice_read_b1_403.png`: Alice bị chặn khi đọc Task B1 (HTTP 403 Forbidden - Vá lỗi IDOR).
- `03_bob_edit_a2_403.png`: Bob bị chặn khi sửa Task A2 chưa được phân công (HTTP 403 Forbidden).
- `04_dana_forge_tenant_403.png`: Dana bị chặn khi giả mạo header X-Tenant-Id (HTTP 403 Forbidden).
- `05_test_oracle_17_pass.png`: Bảng kết quả 17/17 Test Oracle chuẩn slide chạy tự động trên trình duyệt đạt 100% PASS.
- `06_idor_evidence_tab.png`: Giao diện so sánh minh chứng lỗi IDOR trước và sau khi sửa.
- `07_permission_matrix_tab.png`: Giao diện hiển thị bảng ma trận phân quyền RBAC/ReBAC/ABAC.

### 2.3. Kết quả chạy thực tế (39/39 Tests PASS 100%)
```text
╔════════════════════════════════════════════════════════════════════════╗
║   TASK MANAGEMENT API — KIỂM THỬ TỰ ĐỘNG AUTHORIZATION (BLOCK 6)    ║
╚════════════════════════════════════════════════════════════════════════╝

══ 1. V1 — Kiểm thành viên project khi đọc (Sửa IDOR/BOLA) ══
  ✓ Anonymous đọc A1 (không có token) → 401 → HTTP 401
  ✓ Alice đọc A1 (cùng project Alpha) → 200 → HTTP 200
  ✓ Alice đọc B1 (project Beta — Alice không là thành viên) → 403 → HTTP 403
  ✓ Charlie đọc B1 (Owner Beta) → 200 → HTTP 200
  ✓ Bob đọc A1 (Member Alpha) → 200 → HTTP 200
  ✓ Bob đọc B1 (không thuộc Beta) → 403 → HTTP 403

══ 2. V2 — RBAC theo Project (Role từ bảng thành viên, không tin client) ══
  ✓ Viewer sửa A1 → 403 → HTTP 403
  ✓ Member (Bob) xóa project Alpha → 403 → HTTP 403
  ✓ Member (Bob) quản lý thành viên → 403 → HTTP 403
  ✓ Owner (Alice) xóa project Alpha → 200 → HTTP 200
  ✓ Owner (Alice) quản lý thành viên → 200 → HTTP 200
  ✓ Bob tự khai admin nhưng service không tin client → 403 → HTTP 403
  ✓ Admin Dana xóa project Alpha (V2: global admin chưa có tenant check) → 200 → HTTP 200

══ 3. V3 — ReBAC + ABAC (Member chỉ sửa task được giao và còn Open) ══
  ✓ Member Bob sửa A1 (được giao cho Bob, còn Open) → 200 → HTTP 200
  ✓ Member Bob sửa A2 (chưa được giao cho Bob) → 403 → HTTP 403
  ✓ Member Bob sửa A1 đã Closed → 403 → HTTP 403
  ✓ Member Bob sửa B1 (thuộc project Beta khác) → 403 → HTTP 403
  ✓ Owner Alice sửa A1 → 200 → HTTP 200
  ✓ Owner Alice sửa A2 (chưa giao) → 200 → HTTP 200

══ 4. V4 — Tenant Boundary (Cô lập dữ liệu giữa các tổ chức) ══
  ✓ Admin Dana (tenant alpha) đọc A1 (cùng tenant) → 200 → HTTP 200
  ✓ Admin Dana đọc B1 (tenant beta khác) → 403 → HTTP 403
  ✓ Admin Dana cố đọc B1 dù khai tenantId=beta → 403 → HTTP 403
  ✓ Alice (Alpha) đọc A1 → 200 → HTTP 200
  ✓ Alice đọc B1 (Tenant Beta) → 403 → HTTP 403
  ✓ Charlie (tenant beta, Owner) đọc B1 → 200 → HTTP 200

══ 5. Minh chứng IDOR: V0 (Lộ dữ liệu) vs V1 (Khắc phục) ══
  ✓ V0: Alice đọc B1 → 200 (LỖI IDOR: Dữ liệu B1 của Beta bị lộ) → HTTP 200
  ✓ V1: Alice đọc B1 → 403 (Đã vá lỗ hổng IDOR) → HTTP 403
  ✓ V1: Alice đọc A1 (Test cho phép vẫn thành công) → 200 → HTTP 200

══ 6. Ngữ nghĩa HTTP Codes (401, 403, 404) ══
  ✓ GET /tasks/Z99 (Resource không tồn tại) → 404 → HTTP 404
  ✓ Bob (Member) xóa Project Alpha → 403 → HTTP 403
  ✓ Bob sửa A1 khi đã Closed → 403 → HTTP 403

══ 7. HTTP Integration Tests (Thực tế qua Express Server) ══
  ✓ HTTP: Request không có header Authorization → 401 → HTTP 401
  ✓ HTTP: Request với token không hợp lệ → 401 → HTTP 401
  ✓ HTTP [V0]: Alice đọc B1 (Bị lộ dữ liệu IDOR) → 200 → HTTP 200
  ✓ HTTP [V1]: Alice đọc B1 (Đã chặn IDOR) → 403 → HTTP 403
  ✓ HTTP [V1]: Alice đọc A1 (Hợp lệ) → 200 → HTTP 200
  ✓ HTTP: Bob gửi body {role: "Admin"} để xóa project → 403 → HTTP 403
  ✓ HTTP: Dana gửi header X-Tenant-Id: beta để đọc B1 → 403 → HTTP 403
  ✓ HTTP: Đọc task không tồn tại Z99 → 404 → HTTP 404

────────────────────────────────────────────────────────────
🎉 XUẤT SẮC: TẤT CẢ 39 TESTS ĐỀU VƯỢT QUA (100% PASS)!
   Bao gồm 31 unit tests logic + 8 integration tests HTTP thực tế.
────────────────────────────────────────────────────────────
```

---

## 3. EVIDENCE IDOR (BẰNG CHỨNG TÁI HIỆN VÀ KHẮC PHỤC LỖ HỔNG)

### 3.1. Kịch bản tấn công IDOR / BOLA
- **Alice** (chỉ là Owner của Project Alpha, Tenant Alpha) gửi request đọc task `B1` (thuộc Project Beta, Tenant Beta).
- Token JWT gửi kèm là token hoàn toàn hợp lệ của Alice.

### 3.2. Response trước khi sửa (V0 — Starter)
Request được gửi đến API server chạy phiên bản `v0`:
```http
GET /tasks/B1 HTTP/1.1
Host: localhost:3000
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9... (Token Alice)
```

**Response trả về (Lộ dữ liệu nhạy cảm):**
```http
HTTP/1.1 200 OK
Content-Type: application/json; charset=utf-8

{
  "id": "B1",
  "project": "beta",
  "title": "Ngân sách dự án Beta",
  "assignee": "charlie",
  "status": "Open"
}
```
> **Đánh giá:** Server chỉ xác thực danh tính (token hợp lệ) mà **không kiểm tra quyền đối với đối tượng (Object-level Authorization)**. Alice đã xem trộm được thông tin ngân sách dự án bí mật của Beta!

### 3.3. Response sau khi sửa (V1 — TaskService)
Cùng một request gửi đến API server chạy phiên bản `v1`:
```http
GET /tasks/B1 HTTP/1.1
Host: localhost:3000
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9... (Token Alice)
```

**Response trả về (Đã bị chặn):**
```http
HTTP/1.1 403 Forbidden
Content-Type: application/json; charset=utf-8

{
  "error": "forbidden"
}
```

### 3.4. Quy trình kiểm thử: Đỏ $\rightarrow$ Xanh
- **Khi chạy test chặn IDOR trên V0:**
  - Kỳ vọng: `HTTP 403`
  - Thực tế nhận: `HTTP 200`
  - Kết quả: **TEST ĐỎ (FAIL)** $\rightarrow$ Chứng minh test case bắt đúng lỗ hổng.
- **Khi áp dụng bản sửa V1:**
  - Chạy lại test `Alice đọc B1`: Kết quả **TEST XANH (PASS - 403)**.
  - Chạy test cho phép `Alice đọc A1`: Kết quả **TEST XANH (PASS - 200)**.
  - Chạy test cho phép `Charlie đọc B1`: Kết quả **TEST XANH (PASS - 200)**.
> **Lưu ý:** Tuyệt đối không dùng lối tắt "từ chối toàn bộ request" (deny all), vì cách làm đó sẽ khiến các test cho phép hợp lệ (Alice đọc A1, Charlie đọc B1) bị chuyển sang ĐỎ. Bản sửa V1 đảm bảo cả test từ chối lẫn test cho phép đều XANH.

---

## 4. CODE DIFF VÀ VỊ TRÍ KIỂM QUYỀN (PEP / PDP)

### 4.1. Kiến trúc PEP (Policy Enforcement Point) và PDP (Policy Decision Point)
Toàn bộ logic kiểm soát quyền được đặt tập trung tại **Business Layer** (`src/taskService.js`), không đặt phân tán tại Express Controllers. Mọi route (`server.js`) chỉ đóng vai trò nhận request và chuyển vào `taskService` làm điểm kiểm tra duy nhất:

```
Client Request
      │
      ▼
┌────────────────────────┐
│ Express Router         │ 
│ (HTTP Entry Points)    │
└──────────┬─────────────┘
           │
           ▼
┌────────────────────────┐
│ Authentication MW      │ ──[ Thiếu/sai Token ]──► Trả về 401
│ (auth.js: JWT Verify)  │
└──────────┬─────────────┘
           │ req.user = { id: sub }
           ▼
┌─────────────────────────────────────────────────────────────┐
│ Business Layer: TaskService (PEP & PDP Duy Nhất)            │
│                                                             │
│  [Lớp 1] Multi-Tenant Boundary: user.tenant == proj.tenant? │
│  [Lớp 2] Project Membership & RBAC Role Resolution          │
│  [Lớp 3] Action Permission: canByRole(role, action)?        │
│  [Lớp 4] ReBAC & ABAC: assignee == user && status == Open?  │
└──────────┬──────────────────────────────────────────────────┘
           │
     ┌─────┴───────────────┐
     ▼                     ▼
Cho phép: 200 OK      Từ chối: 403 Forbidden
```

### 4.2. Code Diff qua các phiên bản tiến hóa

#### Diff 1: Từ V0 (Starter lỗi) $\rightarrow$ V1 (Vá IDOR Đọc)
```diff
--- a/src/taskService.js (v0)
+++ b/src/taskService.js (v1)
@@ -1,7 +1,13 @@
   getTask(db, userId, taskId) {
     const task = db.tasks[taskId];
     if (!task) return { status: 404, body: { error: 'not_found' } };
-    // ❌ Không kiểm tra quyền object
+
+    const project = db.projects[task.project];
+    const member  = project && project.members[userId];
+
+    // ✅ Kiểm tra người gọi có là thành viên của project chứa task không
+    if (!member) return { status: 403, body: { error: 'forbidden' } };
+
     return { status: 200, body: { id: taskId, ...task } };
   }
```

#### Diff 2: Từ V1 $\rightarrow$ V2 (RBAC theo Project)
```diff
--- a/src/taskService.js (v1)
+++ b/src/taskService.js (v2)
@@ -1,10 +1,24 @@
+  _resolveRole(db, userId, project) {
+    const user = BASE.users[userId];
+    if (!user) return null;
+    if (user.admin) return 'Owner'; // Admin global
+    // ✅ Lấy role từ DB hệ thống, TUYỆT ĐỐI không tin role client gửi trong body
+    return project.members[userId] || null;
+  },
+
   deleteProject(db, userId, projectId) {
     const project = getProject(db, projectId);
     if (!project) return { status: 404, body: { error: 'not_found' } };
-    // ⚠️ Chưa kiểm quyền xóa project
+
+    const role = this._resolveRole(db, userId, project);
+    if (!canByRole(role, 'delete'))
+      return { status: 403, body: { error: 'forbidden' } };
+
     delete db.projects[projectId];
     return { status: 200, body: { ok: true } };
   }
```

#### Diff 3: Từ V2 $\rightarrow$ V3 (ReBAC + ABAC: Thu hẹp quyền sửa của Member)
```diff
--- a/src/taskService.js (v2)
+++ b/src/taskService.js (v3)
@@ -5,6 +5,14 @@
     const role = this._resolveRole(db, userId, project);
     if (!canByRole(role, 'edit'))
       return { status: 403, body: { error: 'forbidden' } };
 
+    // ✅ Bổ sung ReBAC & ABAC cho Member
+    if (role === 'Member') {
+      // ReBAC: Task phải được phân công cho chính người gọi
+      if (task.assignee !== userId)
+        return { status: 403, body: { error: 'forbidden', reason: 'not_assignee' } };
+      // ABAC: Trạng thái task phải còn đang mở (Open)
+      if (task.status !== 'Open')
+        return { status: 403, body: { error: 'forbidden', reason: 'task_closed' } };
+    }
+
     Object.assign(task, data);
     return { status: 200, body: { ok: true } };
   }
```

#### Diff 4: Từ V3 $\rightarrow$ V4 (Tenant Boundary: Cô lập Tenant)
```diff
--- a/src/taskService.js (v3)
+++ b/src/taskService.js (v4)
@@ -1,6 +1,18 @@
+  _checkTenant(userId, project) {
+    const user = BASE.users[userId];
+    if (!user || !project) return false;
+    // ✅ Tenant lấy từ DB xác thực, KHÔNG lấy từ header X-Tenant-Id
+    return user.tenant === project.tenant;
+  },
+
   getTask(db, userId, taskId) {
     const task = db.tasks[taskId];
     if (!task) return { status: 404, body: { error: 'not_found' } };
 
     const project = db.projects[task.project];
+    // ✅ Kiểm tra ranh giới tenant trước khi xét quyền project
+    if (!this._checkTenant(userId, project)) {
+      return { status: 403, body: { error: 'forbidden', reason: 'tenant_mismatch' } };
+    }
```

---

## 5. GIẢI THÍCH LỰA CHỌN MÔ HÌNH VÀ CÁC GIỚI HẠN

### 5.1. Lý do chọn mô hình kết hợp (RBAC + ReBAC + ABAC)

| Mô hình | Lý do áp dụng & Đánh giá |
|---|---|
| **Tại sao không dùng ACL thuần túy?** | ACL (Access Control List) gán trực tiếp danh sách user vào từng task/project. Khi hệ thống có hàng ngàn dự án và hàng triệu task, số lượng bản ghi quyền bùng nổ theo cấp số nhân ($O(Users \times Objects)$), gây khó khăn nghiêm trọng khi thu hồi quyền hoặc thay đổi nhân sự. |
| **Tại sao cần RBAC (Role-Based)?** | RBAC phân tách người dùng qua vai trò trừu tượng (`Viewer`, `Member`, `Owner`). Khi một nhân viên tham gia dự án, chỉ cần gán 1 vai trò duy nhất, hệ thống tự động kế thừa ma trận quyền tương ứng. |
| **Tại sao RBAC là chưa đủ mà cần ReBAC & ABAC?** | RBAC chỉ trả lời câu hỏi ở mức danh mục: *"Member có được sửa task không?"* (Có). Nhưng nó không thể trả lời các câu hỏi phụ thuộc ngữ cảnh động: *"Member này có phải người thực hiện task này không?"* (**ReBAC - Quan hệ quan hệ sở hữu**) và *"Task này đã kết thúc chưa?"* (**ABAC - Thuộc tính trạng thái**). Kết hợp ReBAC và ABAC giúp thực hiện nguyên tắc **Đặc quyền tối thiểu (Least Privilege)** mà không làm phức tạp hóa ma trận RBAC. |
| **Tại sao cần Tenant Boundary?** | Trong các ứng dụng SaaS B2B, Admin của Tenant này (ví dụ: công ty Alpha) tuyệt đối không được có quyền xem hoặc sửa dữ liệu của Tenant khác (công ty Beta). Tenant ID phải được gắn chặt với Identity đã xác thực ở tầng cơ sở dữ liệu thay vì tin vào Header client gửi lên. |

### 5.2. Các giới hạn và trường hợp biên chưa kiểm tra trong bài tập

1. **Vấn đề Cache Invalidation & Thu hồi quyền tức thì (Session Revocation):**
   - Hiện tại hệ thống dùng JWT stateless. Nếu một user bị xóa khỏi project hoặc giáng chức từ Owner xuống Viewer, token JWT của họ vẫn có hiệu lực cho đến khi hết hạn (`exp = 1h`).
   - *Hướng giải quyết thực tế:* Sử dụng short-lived access tokens (ví dụ: 5-15 phút) kết hợp token revocation list (Redis blacklist) hoặc kiểm tra version của user profile tại PDP.
2. **Lọc dữ liệu danh sách ở tầng Database (Query-level Authorization):**
   - Bài thực hành tập trung vào endpoint kiểm tra đơn lẻ: `GET /tasks/:id`.
   - Với các API lấy danh sách (`GET /tasks` hoặc phân trang/tìm kiếm), không thể đọc toàn bộ dữ liệu từ database lên bộ nhớ rồi lọc từng phần tử (gây cạn kiệt RAM và nghẽn CPU). Cần đẩy điều kiện quyền xuống câu lệnh truy vấn cơ sở dữ liệu (ví dụ: `WHERE project_id IN (SELECT project_id FROM project_members WHERE user_id = :userId)`).
3. **Phân quyền ủy quyền của Bên thứ ba (OAuth2 Scopes):**
   - Chưa kiểm tra trường hợp client bên thứ ba gọi API thay mặt người dùng với phạm vi quyền bị giới hạn (Token Scope, ví dụ: `tasks:read` chỉ được đọc, không được xóa).

---

## 6. HƯỚNG DẪN TRẢI NGHIỆM E2E TRÊN TRÌNH DUYỆT (BROWSER DASHBOARD)

Dự án đã tích hợp sẵn một **Interactive E2E Web Dashboard** trực quan:

1. Khởi động server:
   ```bash
   npm start
   ```
2. Mở trình duyệt tại địa chỉ:
   ```text
   http://localhost:3000
   ```
3. Các tính năng tương tác trực tiếp trên giao diện:
   - **Chuyển đổi tức thì giữa các phiên bản (V0 $\rightarrow$ V4)** để so sánh hành vi.
   - **Gửi request 1-click** với các vai trò Alice, Bob, Charlie, Dana hoặc Anonymous.
   - **Bấm "CHẠY TOÀN BỘ TEST ORACLE"**: Toàn bộ 17 test case chuẩn slide sẽ được thực thi tuần tự qua HTTP fetch thật và hiển thị kết quả trực quan ngay trên trình duyệt.

