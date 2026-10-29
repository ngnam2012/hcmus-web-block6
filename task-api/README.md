# Task Management API — Block 6: Authorization

Bài thực hành theo [học liệu Block 6](../slides.html): V1 sửa IDOR/BOLA, V2 RBAC theo project, V3 kiểm assignee và trạng thái, V4 tenant boundary (mở rộng). Báo cáo năm thành phần và bảng đối chiếu yêu cầu ở [REPORT.md](REPORT.md).

## Chạy và kiểm thử

Cần Node.js 22 trở lên và npm. Trong PowerShell, dùng `npm.cmd` nếu execution policy chặn `npm.ps1`.

```bash
cd task-api
npm ci
npm test
```

`npm test` chạy 150 test service/HTTP, bao gồm đủ 17 ca oracle và minh chứng cùng một assertion IDOR đỏ trên V0, xanh trên V1. Test tự tạo server ở cổng ngẫu nhiên, fixture riêng và đóng tài nguyên; không cần chạy server trước.

```bash
npm run test:browser
npm run test:all
```

Browser test tự mở Chrome/Edge ở chế độ headless, kiểm tra kết quả thực tế của giao diện, 17 ca oracle và minh chứng IDOR, rồi cập nhật bảy ảnh trong `public/screenshots/`. Cần Chrome/Edge đã cài; có thể đặt `CHROME_PATH` tới executable nếu không nằm ở vị trí thông thường. `test:all` chạy cả backend và browser bằng một lệnh.

## API mặc định: V4 cố định

```bash
npm start
npm run tokens
```

Mở `http://127.0.0.1:3000`. Dán token mẫu được tạo bằng CLI vào trường Bearer token trên giao diện. Token mẫu phục vụ dữ liệu giả định của bài tập; HTTP API mặc định không có endpoint cấp token hàng loạt.

API bỏ qua `x-version` và `?version`; client không thể đổi policy. `POST /api/version`, `/api/tokens`, `/api/db`, `/test/reset` và `/api/test/reset` đều không tồn tại trong chế độ này. JWT chỉ xác định subject; role, admin và tenant được tra từ DB hiện tại. Các thao tác đọc/ghi/xóa/quản lý thành viên đều qua business policy `authorize`.

| Endpoint | Chức năng |
|---|---|
| `GET /tasks/:id` | Đọc task trong phạm vi được phép |
| `PATCH /tasks/:id` | Cập nhật `title`, `status`, `assignee` |
| `DELETE /projects/:id` | Xóa project và các task của project |
| `POST /projects/:id/members` | Thêm/đổi role hoặc gỡ thành viên |
| `GET /health`, `GET /api/version` | Thông tin trạng thái, không có dữ liệu task/token |

Ví dụ PATCH hợp lệ:

```json
{"title":"Hoàn tất bản thiết kế","status":"Closed"}
```

`project`, `id`, `tenant`, `tenantId`, `role` và trường lạ bị từ chối 400. Assignee phải là thành viên cùng project và tenant. Không thể dùng PATCH để di chuyển task sang project khác.

Payload quản lý thành viên, chỉ Owner hoặc Admin cùng tenant được phép:

```json
{"userId":"bob","role":"Viewer"}
```

```json
{"userId":"bob","remove":true}
```

Role chỉ nhận `Viewer`, `Member`, `Owner`. Không được gỡ hoặc giáng role Owner cuối cùng (409). Payload rỗng `{}` chỉ kiểm tra quyền cho ca oracle, không thay đổi dữ liệu. Xóa membership hoặc đổi role có hiệu lực ngay với JWT đang còn hạn.

## Demo so sánh V0–V4

```bash
npm run start:demo
```

Mở cùng địa chỉ localhost để chọn người dùng mẫu, đổi phiên bản, reset fixture, chạy oracle và minh chứng IDOR trực tiếp. Demo chỉ bind `127.0.0.1`, dùng dữ liệu giả và có các bản V0/V1 cố ý thiếu kiểm quyền để phục vụ học tập. Chế độ demo được bật ở lúc khởi động, không bật bằng request HTTP. `/api/db` không được cung cấp ở cả hai chế độ.

Các lệnh `start:v0`, `start:v1`, `start:v2`, `start:v3` khởi động demo ở phiên bản tương ứng. `start:v4` tương đương API V4 cố định. Tham số CLI là `--version=vN`; V0–V3 yêu cầu `--demo`.

## Minh chứng IDOR đỏ → xanh

```bash
npm run test:idor
npm run test:idor -- --version=v0
npm run test:idor -- --version=v1
```

Lệnh đầu kiểm chứng toàn bộ quy trình và thoát 0 khi V0 bị bắt lỗi, V1 đạt và các request hợp lệ vẫn được phép. Lệnh V0 riêng giữ kỳ vọng 403, nhận 200 và **cố ý thoát 1**; lệnh V1 dùng cùng assertion và thoát 0. Đây là negative control, không phải lỗi của bộ test cuối cùng.

## Cấu trúc

```text
src/auth.js              JWT authentication, identity từ subject
src/rbac.js              Ma trận role/action, deny by default
src/taskService.js       authorize + business operations + validation
src/server.js            App factory, HTTP routes, demo isolation
src/db.js                Dữ liệu mẫu và fixture clone
tests/run.js             150 test với status/body/data invariants
tests/oracle.js          17 ca oracle của học liệu
tests/idor-regression.js Cùng assertion đỏ → xanh
tests/browser-e2e.js     Browser assertions + ảnh minh chứng
evidence/               Log kiểm chứng và code diff để nộp
REPORT.md               Năm thành phần bài nộp
```

Giới hạn: DB trong bộ nhớ, JWT mẫu dùng secret phát triển nếu chưa đặt `JWT_SECRET`; chưa xây login/OAuth2 mới, list/search API, database transaction, concurrent revocation hoặc cache phân quyền. Chi tiết và phạm vi kiểm thử ở REPORT.
