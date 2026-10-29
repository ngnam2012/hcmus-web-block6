# Báo cáo bài thực hành Authorization và Access Control — Block 6

Đối chiếu phần D và slide “Bài nộp và tự kiểm tra” trong [học liệu Block 6](../slides.html). V1–V3 là yêu cầu chính; V4 là phần mở rộng. Dữ liệu người dùng, project và task đều là fixture giả định của học liệu.

## 1. Bảng chính sách quyền

| Vai trò | Tài nguyên | Đọc task | Sửa task | Xóa project | Quản lý thành viên | Điều kiện |
|---|---|---|---|---|---|---|
| Anonymous | Task / Project | 401 | 401 | 401 | 401 | Thiếu/sai/hết hạn token, subject không còn tồn tại |
| Viewer | Task / Project | 200 | 403 | 403 | 403 | Membership trong project; V4 cùng tenant |
| Member | Task / Project | 200 | Có điều kiện | 403 | 403 | V3/V4: task được giao cho mình **và** còn Open; V4 cùng tenant |
| Owner | Task / Project | 200 | 200 | 200 | 200 | Membership Owner của project; V4 cùng tenant; không phụ thuộc assignee/status |
| Admin | Task / Project | 200 | 200 | 200 | 200 | V4: chỉ trong tenant của Admin, kiểm tenant trước khi cấp Owner |
| Non-member / khác tenant | Task / Project | 403 | 403 | 403 | 403 | Không có rule cấp quyền; V4 không có ngoại lệ Admin xuyên tenant |

Resource không tồn tại trả 404. Bài chọn trả 403 cho resource tồn tại nhưng nằm ngoài phạm vi, thay vì che sự tồn tại bằng 404; cả hai cách đều được học liệu cho phép. Payload không hợp lệ trả 400; gỡ/giáng Owner cuối cùng trả 409. Rule, role và action không nhận diện đều bị từ chối.

Mỗi ô có automated test với tên có thể tìm trực tiếp trong `tests/run.js`:

| Hàng trong bảng | Test đối chiếu |
|---|---|
| Viewer × 4 action | `v2/v3/v4 matrix Viewer.read/edit/delete/members` |
| Member × 4 action | `v2/v3/v4 matrix Member.read/edit/delete/members` |
| Owner × 4 action | `v2/v3/v4 matrix Owner.read/edit/delete/members` |
| Anonymous × 4 action | `HTTP Anonymous GET/PATCH/DELETE/POST ... -> 401` |
| Admin × 4 action được phép | `v4 Admin own tenant read/edit/delete/members allowed` |
| Admin / user ngoài phạm vi × 4 action | `v4 dana/alice/charlie/nonmember forbidden scope ...; no mutation` |
| Điều kiện Member | `v3/v4 Member edit denied: unassigned/assigned_to_other/closed/other_project; no mutation` và các ô Member.edit được phép |

36 test ma trận kiểm độc lập đủ 12 ô ở mỗi mốc V2, V3, V4. Test allow kiểm response và thay đổi dữ liệu tương ứng; test deny kiểm DB giữ nguyên. Các test điều kiện bổ sung không được thay thế bằng việc từ chối mọi request.

## 2. Automated tests

```bash
cd task-api
npm ci
npm test
npm run test:browser
# Một lệnh chạy toàn bộ:
npm run test:all
```

Trong PowerShell có thể dùng `npm.cmd`. Backend test tự mở server trên cổng ngẫu nhiên ở loopback, không dùng server đang mở của người dùng. Mỗi fixture độc lập; server được đóng bằng `finally`. Không gọi `process.exit()` khi còn tài nguyên đang đóng.

150 test backend/service/HTTP bao gồm:

- 36 ô RBAC, V1 object-level access và V3/V4 assignee/status.
- Đủ 17 oracle gốc của học liệu, chạy qua HTTP với V4 và fixture Viewer/Closed tương ứng.
- Anonymous ở cả bốn endpoint; token sai/hết hạn, principal không tồn tại.
- Giả mạo `id`, `role`, `tenant`, `tenantId` trong claim/body/header; subject đã verify là nguồn identity duy nhất.
- Thử hạ policy qua header/query, gọi endpoint version/token/reset ở API mặc định và kiểm tra không thay đổi DB/version.
- Mass assignment `project`, `id`, `tenant`, role, trường lạ, prototype key; invalid status/title/assignee; xác nhận không có task bị chuyển tenant.
- Tạo/đổi/gỡ membership thật; cùng JWT mất quyền ngay sau khi thay membership; Admin/tenant hiện tại từ DB ghi đè claim cũ.
- Kiểm tra status chính xác, response không lộ task khi deny, invariant không mutation; delete cascade; bảo vệ Owner cuối cùng.

Browser E2E có 11 nhóm assertion: kết quả request thực tế, oracle đúng 17 pass/0 fail, IDOR cùng kỳ vọng đỏ→xanh, UI fixed tắt công cụ demo, token nhập tay, chống downgrade và không có JavaScript error. Script tự khởi động hai app riêng, tự tìm Chrome/Edge hoặc nhận `CHROME_PATH`, chạy headless và đóng browser/server. Chỉ lưu ảnh sau khi assertion thành công.

Log chạy cuối và môi trường kiểm chứng được lưu trong [evidence/verification.txt](evidence/verification.txt). Bảy ảnh được tạo lại ở [public/screenshots/](public/screenshots/), bao gồm response cho phép, response từ chối, oracle, bằng chứng IDOR và ma trận quyền.

Ở môi trường Windows hiện tại, lần chạy `test:all` trong sandbox đạt toàn bộ backend nhưng Chrome bị timeout khi khởi động. Lần kiểm tra browser được cho phép chạy ngoài sandbox đã đạt 11/11 nhóm và 17/17 oracle, exit 0. Log giữ lại cả lần bị giới hạn môi trường và lần chạy thành công; không khẳng định đã chạy thành công toàn bộ `test:all` trong sandbox.

## 3. Evidence IDOR: cùng một test đỏ trước, xanh sau

Scenario: Alice là Owner Alpha, gửi token hợp lệ để đọc task B1 thuộc Beta.

Request giữ nguyên:

```http
GET /tasks/B1
Authorization: Bearer <Alice token>
```

Assertion trong `tests/idor-regression.js` giữ nguyên ở cả hai phiên bản:

```js
assert.equal(response.status, 403);
assert.equal(response.body.error, 'forbidden');
assert.equal(response.body.title, undefined);
```

V0 trả 200 và dữ liệu B1: assertion thất bại (đỏ). V1 kiểm membership trong project của task, trả 403 `{"error":"forbidden"}`: cùng assertion đạt (xanh). Positive controls Alice→A1 và Charlie→B1 đều trả 200.

```bash
npm run test:idor
# Chạy từng mốc để thấy exit code thật:
npm run test:idor -- --version=v0   # expected exit 1: red
npm run test:idor -- --version=v1   # exit 0: green
```

Lệnh không tham số kiểm chứng V0 bắt buộc thất bại với đúng AssertionError, V1 bắt buộc đạt, rồi chạy hai positive controls; toàn bộ quy trình đúng thì exit 0. Đây cũng là một test trong `npm test`. Response và log thực tế ở [evidence/idor-red-green.txt](evidence/idor-red-green.txt). Giao diện demo có nút chạy lại minh chứng qua HTTP và khôi phục version ban đầu sau khi xong; ảnh [06_idor_evidence_tab.png](public/screenshots/06_idor_evidence_tab.png).

## 4. Code diff và nơi áp dụng authorization

Code diff thực tế của các file server/business/auth nằm trong [evidence/authorization.patch](evidence/authorization.patch).

```text
HTTP route
  -> authenticate (verify JWT HS256; identity = sub)
  -> kiểm user còn tồn tại trong DB
  -> TaskService operation (PEP)
  -> authorize(version, db, userId, action, resourceId) (PDP chung)
  -> tenant / project role / action / assignee / status
  -> validation trước mutation
  -> đọc hoặc thay đổi dữ liệu
```

Tất cả bốn business entry point (`getTask`, `editTask`, `deleteProject`, `manageMembers`) gọi cùng `authorize`. Gọi service trực tiếp cũng không bỏ qua policy. `canByRole` dùng ma trận chung và chỉ nhận own property; không cấp quyền qua prototype hoặc role lạ.

Các thay đổi chính:

| Vị trí | Hành vi sau sửa |
|---|---|
| `src/taskService.js` | Policy dùng chung; V1 membership, V2 RBAC, V3 assignee/status, V4 tenant trước Admin |
| `src/taskService.js` | PATCH chỉ nhận title/status/assignee; project bất biến; assignee hợp lệ cùng project/tenant |
| `src/taskService.js` | Membership thay đổi thật; không gán Admin bằng project role; delete cascade |
| `src/auth.js` | Identity chỉ từ subject đã verify; claim `id` không được ghi đè subject |
| `src/server.js` | Mặc định V4 cố định; không nhận policy từ header/query; helper demo chỉ đăng ký khi bật demo ở lúc tạo app |
| `src/server.js` | Không có `/api/db` ở cả hai chế độ; app/DB/config độc lập cho từng instance |

`GET /health` và `GET /api/version` công khai chỉ chứa metadata, không có dữ liệu resource/token. API mặc định không đăng ký POST version, token hàng loạt hoặc reset. Demo chỉ bind loopback và cố ý cho chọn V0–V4/fixture trên dữ liệu mẫu để giảng dạy; nó là môi trường so sánh riêng, không được coi là API đã bảo vệ. Đổi phiên bản demo không ảnh hưởng instance mặc định.

## 5. Giải thích lựa chọn và giới hạn

- **RBAC** phù hợp vì quyền đọc/sửa/xóa/quản lý thành viên ổn định theo Viewer, Member, Owner. Membership được lưu theo project, không phải role toàn cục do client khai.
- **ReBAC** mô tả quan hệ Member với task qua assignee; **ABAC** kiểm thuộc tính trạng thái Open. Cả hai thu hẹp ô Member.edit, thay vì tạo thêm nhiều role.
- **Tenant boundary** ngăn truy cập xuyên tổ chức, kể cả Admin. User/tenant/admin được tra từ DB hiện tại trước mỗi quyết định, không tin header hoặc claim role/tenant.
- **ACL** có thể phù hợp nếu cần chia sẻ trực tiếp từng task cho từng user. Bài không có yêu cầu đó, nên membership theo project đơn giản hơn. Số bản ghi ACL tệ nhất có thể tăng theo tích Users × Objects; đây không phải độ phức tạp hàm mũ.
- **Deny by default** áp dụng cho user/role/action không hợp lệ hoặc ngoài phạm vi; các positive controls bảo đảm bản sửa không trở thành deny-all.

Thu hồi quyền project có hiệu lực ngay khi membership đổi vì policy đọc DB mỗi lần, dù JWT identity chưa hết hạn. Token vẫn còn hợp lệ để xác định người dùng không có nghĩa quyền cũ còn tồn tại. Test đã kiểm cùng JWT trước/sau giáng role và gỡ membership. Xóa user khỏi DB làm request tiếp theo trả 401.

Các giới hạn chưa triển khai/kiểm chứng:

1. DB trong bộ nhớ, không persistence; chưa kiểm transaction, cạnh tranh giữa kiểm quyền và ghi dữ liệu, hoặc tải phân tán.
2. Chưa có list/search/bulk/export/background job. Khi thêm entry point phải dùng cùng policy; API danh sách cần lọc theo quyền ở tầng truy vấn.
3. Không xây lại login/JWT/OAuth2 theo phạm vi học liệu. Chưa triển khai OAuth2 scope, refresh/revocation token theo phiên, issuer/audience hoặc quản lý secret cho triển khai thực tế; `JWT_SECRET` hỗ trợ cấu hình secret và giá trị mặc định chỉ phục vụ bài tập local.
4. Không cache quyền, nên chưa có kiểm thử TTL/cache invalidation. Chưa có audit log, performance/load test hay kiểm thử chống truy cập mạng vào demo ngoài thiết kế bind loopback.
5. Browser test đã chạy trên Chrome/Windows hiện có; nhánh phát hiện Edge/Linux/macOS chưa được kiểm chứng tại môi trường này.

## Đối chiếu bài nộp

| Yêu cầu phần D | Thành phần đáp ứng |
|---|---|
| Bảng role/resource/action + assignee/status/tenant; mỗi ô có test | Mục 1 và 36 matrix tests + Anonymous/Admin/scope tests |
| Automated allow/deny, chạy một lệnh | `npm test`; `npm run test:all` bao gồm browser |
| Response IDOR trước sửa + cùng test đỏ→xanh | Mục 3, regression harness, log và ảnh evidence |
| Code diff, các entry point chung kiểm quyền | Mục 4, `authorize`, patch thực tế |
| Lý do mô hình + trường hợp chưa kiểm tra | Mục 5 |
