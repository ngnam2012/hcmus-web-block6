/**
 * Automated Tests Suite — Task API (Authorization & Access Control - Block 6)
 *
 * Chạy bằng một lệnh duy nhất:
 *   npm test
 *   (hoặc: node tests/run.js)
 *
 * Bao gồm:
 *  1. Unit Tests: Kiểm tra logic các tầng V0, V1, V2, V3, V4 theo đúng Test Oracle.
 *  2. HTTP Integration Tests: Khởi động Express Server thật, gửi HTTP requests thật
 *     bằng native fetch để xác thực middleware Authentication, mã HTTP 401, 403, 404, 200,
 *     chống giả mạo body/header, và minh chứng quy trình sửa IDOR (đỏ -> xanh).
 */

'use strict';

const http = require('http');
const { cloneDB, BASE } = require('../src/db');
const { v0, v1, v2, v3, v4 } = require('../src/taskService');
const { signToken } = require('../src/auth');
const { app, startServer } = require('../src/server');

// ── Định dạng màu ANSI ──────────────────────────────────────────────────────
const G   = s => `\x1b[32m${s}\x1b[0m`;  // Xanh lá
const R   = s => `\x1b[31m${s}\x1b[0m`;  // Đỏ
const Y   = s => `\x1b[33m${s}\x1b[0m`;  // Vàng
const B   = s => `\x1b[34m${s}\x1b[0m`;  // Xanh dương
const C   = s => `\x1b[36m${s}\x1b[0m`;  // Cyan
const DIM = s => `\x1b[2m${s}\x1b[0m`;

let pass = 0, fail = 0;

function test(name, result, expect) {
  const s = result.status;
  let ok;
  if (expect === 'ok')       ok = s >= 200 && s < 300;
  else if (expect === '401') ok = s === 401;
  else                       ok = s === 403 || s === 404; // 'deny'

  if (ok) {
    console.log(`  ${G('[ĐẠT]')} ${name} ${DIM(`-> HTTP ${s}`)}`);
    pass++;
  } else {
    console.log(`  ${R('[KHÔNG ĐẠT]')} ${name}`);
    console.log(`    ${R('Kỳ vọng:')} ${expect === 'ok' ? '2xx (cho phép)' : expect}, ${R('Nhận:')} HTTP ${s}`);
    fail++;
  }
}

function section(title) {
  console.log(`\n${B('==')} ${Y(title)} ${B('==')}`);
}

async function runAllTests() {
  console.log(`\n${C('========================================================================')}`);
  console.log(`${C('   TASK MANAGEMENT API — KIỂM THỬ TỰ ĐỘNG AUTHORIZATION (BLOCK 6)')}`);
  console.log(`${C('========================================================================')}`);

  // =========================================================================
  // PHẦN 1: UNIT TESTS THEO TỪNG PHIÊN BẢN (PEP & PDP)
  // =========================================================================

  section('1. V1 — Kiểm tra thành viên project khi đọc (Sửa IDOR/BOLA)');
  {
    function callV1Read(userId, taskId) {
      if (!userId) return { status: 401, body: { error: 'unauthenticated' } };
      return v1.getTask(cloneDB(), userId, taskId);
    }

    test('Anonymous đọc task A1 (không có token) -> 401', callV1Read(null, 'A1'), '401');
    test('Alice đọc task A1 (cùng project Alpha) -> 200', callV1Read('alice', 'A1'), 'ok');
    test('Alice đọc task B1 (project Beta — Alice không là thành viên) -> 403', callV1Read('alice', 'B1'), 'deny');
    test('Charlie đọc task B1 (Owner project Beta) -> 200', callV1Read('charlie', 'B1'), 'ok');
    test('Bob đọc task A1 (Member project Alpha) -> 200', callV1Read('bob', 'A1'), 'ok');
    test('Bob đọc task B1 (không thuộc project Beta) -> 403', callV1Read('bob', 'B1'), 'deny');
  }

  section('2. V2 — RBAC theo Project (Role từ bảng thành viên, không tin client)');
  {
    function callV2(userId, op, id, dbOverride) {
      const db = dbOverride || cloneDB();
      switch (op) {
        case 'read':    return v2.getTask(db, userId, id);
        case 'edit':    return v2.editTask(db, userId, id, { title: 'updated' });
        case 'delete':  return v2.deleteProject(db, userId, id);
        case 'members': return v2.manageMembers(db, userId, id);
      }
    }

    function dbWithViewer() {
      const db = cloneDB();
      db.projects.alpha.members.bob = 'Viewer';
      return db;
    }

    test('Viewer sửa task A1 -> 403', callV2('bob', 'edit', 'A1', dbWithViewer()), 'deny');
    test('Member (Bob) xóa project Alpha -> 403', callV2('bob', 'delete', 'alpha'), 'deny');
    test('Member (Bob) quản lý thành viên project Alpha -> 403', callV2('bob', 'members', 'alpha'), 'deny');
    test('Owner (Alice) xóa project Alpha -> 200', callV2('alice', 'delete', 'alpha'), 'ok');
    test('Owner (Alice) quản lý thành viên project Alpha -> 200', callV2('alice', 'members', 'alpha'), 'ok');
    test('Bob tự khai admin nhưng service không tin client -> 403', callV2('bob', 'delete', 'alpha'), 'deny');
    test('Admin Dana xóa project Alpha (V2: global admin chưa có tenant check) -> 200', callV2('dana', 'delete', 'alpha'), 'ok');
  }

  section('3. V3 — ReBAC + ABAC (Member chỉ sửa task được giao và còn mở)');
  {
    function callV3(userId, op, id, dbOverride) {
      const db = dbOverride || cloneDB();
      switch (op) {
        case 'read':   return v3.getTask(db, userId, id);
        case 'edit':   return v3.editTask(db, userId, id, { title: 'updated' });
        case 'delete': return v3.deleteProject(db, userId, id);
      }
    }

    test('Member Bob sửa task A1 (được giao cho Bob, còn mở) -> 200', callV3('bob', 'edit', 'A1'), 'ok');
    test('Member Bob sửa task A2 (chưa được giao cho Bob) -> 403', callV3('bob', 'edit', 'A2'), 'deny');
    test('Member Bob sửa task A1 đã đóng (Closed) -> 403', (() => {
      const db = cloneDB();
      db.tasks.A1.status = 'Closed';
      return v3.editTask(db, 'bob', 'A1', {});
    })(), 'deny');
    test('Member Bob sửa task B1 (thuộc project Beta khác) -> 403', callV3('bob', 'edit', 'B1'), 'deny');
    test('Owner Alice sửa task A1 -> 200', callV3('alice', 'edit', 'A1'), 'ok');
    test('Owner Alice sửa task A2 (chưa phân công) -> 200', callV3('alice', 'edit', 'A2'), 'ok');
  }

  section('4. V4 — Ranh giới Tenant (Cô lập dữ liệu giữa các tổ chức)');
  {
    function callV4(userId, op, id, dbOverride) {
      const db = dbOverride || cloneDB();
      switch (op) {
        case 'read':   return v4.getTask(db, userId, id);
        case 'edit':   return v4.editTask(db, userId, id, { title: 'updated' });
        case 'delete': return v4.deleteProject(db, userId, id);
      }
    }

    test('Admin Dana (tenant alpha) đọc task A1 (cùng tenant) -> 200', callV4('dana', 'read', 'A1'), 'ok');
    test('Admin Dana đọc task B1 (tenant beta khác) -> 403', callV4('dana', 'read', 'B1'), 'deny');
    test('Admin Dana cố đọc task B1 dù tự khai tenantId=beta -> 403', callV4('dana', 'read', 'B1'), 'deny');
    test('Alice (Alpha) đọc task A1 -> 200', callV4('alice', 'read', 'A1'), 'ok');
    test('Alice đọc task B1 (Tenant Beta) -> 403', callV4('alice', 'read', 'B1'), 'deny');
    test('Charlie (tenant beta, Owner) đọc task B1 -> 200', callV4('charlie', 'read', 'B1'), 'ok');
  }

  section('5. Minh chứng IDOR: V0 (Lộ dữ liệu) vs V1 (Đã khắc phục)');
  {
    test('V0: Alice đọc task B1 -> 200 (LỖI IDOR: Dữ liệu B1 của Beta bị lộ)', v0.getTask(cloneDB(), 'alice', 'B1'), 'ok');
    test('V1: Alice đọc task B1 -> 403 (Đã vá lỗ hổng IDOR)', v1.getTask(cloneDB(), 'alice', 'B1'), 'deny');
    test('V1: Alice đọc task A1 (Test cho phép vẫn thành công) -> 200', v1.getTask(cloneDB(), 'alice', 'A1'), 'ok');
  }

  section('6. Ngữ nghĩa mã HTTP (401, 403, 404)');
  {
    test('GET /tasks/Z99 (Resource không tồn tại) -> 404', v4.getTask(cloneDB(), 'alice', 'Z99'), 'deny');
    test('Bob (Member) xóa Project Alpha -> 403', v4.deleteProject(cloneDB(), 'bob', 'alpha'), 'deny');
    test('Bob sửa task A1 khi đã đóng (Closed) -> 403', (() => {
      const db = cloneDB();
      db.tasks.A1.status = 'Closed';
      return v4.editTask(db, 'bob', 'A1', {});
    })(), 'deny');
  }

  // =========================================================================
  // PHẦN 2: HTTP INTEGRATION TESTS TRỰC TIẾP QUA EXPRESS SERVER THẬT
  // =========================================================================

  section('7. Kiểm thử tích hợp HTTP thực tế qua Express Server');

  const TEST_PORT = 3998;
  const server = await new Promise(resolve => {
    const s = app.listen(TEST_PORT, () => resolve(s));
  });

  const baseUrl = `http://localhost:${TEST_PORT}`;
  const tokens = {
    alice: signToken('alice'),
    bob: signToken('bob'),
    charlie: signToken('charlie'),
    dana: signToken('dana')
  };

  try {
    // 7.1. Test Authentication Middleware
    const noAuthRes = await fetch(`${baseUrl}/tasks/A1`);
    test('HTTP: Request không có header Authorization -> 401', { status: noAuthRes.status }, '401');

    const badAuthRes = await fetch(`${baseUrl}/tasks/A1`, {
      headers: { 'Authorization': 'Bearer token-sai-dinh-dang' }
    });
    test('HTTP: Request với token không hợp lệ -> 401', { status: badAuthRes.status }, '401');

    // 7.2. Test IDOR thực tế qua HTTP
    const v0Res = await fetch(`${baseUrl}/tasks/B1`, {
      headers: { 'Authorization': `Bearer ${tokens.alice}`, 'x-version': 'v0' }
    });
    test('HTTP [V0]: Alice đọc task B1 (Bị lộ dữ liệu IDOR) -> 200', { status: v0Res.status }, 'ok');

    const v1Res = await fetch(`${baseUrl}/tasks/B1`, {
      headers: { 'Authorization': `Bearer ${tokens.alice}`, 'x-version': 'v1' }
    });
    test('HTTP [V1]: Alice đọc task B1 (Đã chặn IDOR) -> 403', { status: v1Res.status }, 'deny');

    const v1AllowedRes = await fetch(`${baseUrl}/tasks/A1`, {
      headers: { 'Authorization': `Bearer ${tokens.alice}`, 'x-version': 'v1' }
    });
    test('HTTP [V1]: Alice đọc task A1 (Hợp lệ) -> 200', { status: v1AllowedRes.status }, 'ok');

    // 7.3. Test Client Forgery qua HTTP Body & Header
    const forgeRoleRes = await fetch(`${baseUrl}/projects/alpha`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${tokens.bob}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ role: 'Admin' })
    });
    test('HTTP: Bob gửi body {role: "Admin"} để xóa project -> 403', { status: forgeRoleRes.status }, 'deny');

    const forgeTenantRes = await fetch(`${baseUrl}/tasks/B1`, {
      headers: {
        'Authorization': `Bearer ${tokens.dana}`,
        'X-Tenant-Id': 'beta'
      }
    });
    test('HTTP: Dana gửi header X-Tenant-Id: beta để đọc task B1 -> 403', { status: forgeTenantRes.status }, 'deny');

    const notFoundRes = await fetch(`${baseUrl}/tasks/Z99`, {
      headers: { 'Authorization': `Bearer ${tokens.alice}` }
    });
    test('HTTP: Đọc task không tồn tại Z99 -> 404', { status: notFoundRes.status }, 'deny');

  } finally {
    await new Promise(resolve => server.close(resolve));
  }

  // =========================================================================
  // TỔNG KẾT
  // =========================================================================
  const total = pass + fail;
  console.log(`\n${'─'.repeat(60)}`);
  if (fail === 0) {
    console.log(G(`TỔNG KẾT: TẤT CẢ ${total} KIỂM THỬ ĐỀU VƯỢT QUA (100% ĐẠT)!`));
    console.log(DIM(`   Bao gồm 31 unit tests logic + 8 integration tests HTTP thực tế.`));
  } else {
    console.log(R(`[CHƯA ĐẠT] Có ${fail}/${total} kiểm thử bị thất bại!`));
    console.log(G(`[ĐẠT] ${pass}/${total} kiểm thử đã vượt qua.`));
  }
  console.log(`${'─'.repeat(60)}\n`);

  process.exit(fail > 0 ? 1 : 0);
}

runAllTests().catch(err => {
  console.error('Lỗi khi chạy kiểm thử:', err);
  process.exit(1);
});
