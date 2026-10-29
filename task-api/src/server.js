/**
 * Task API — Express server
 *
 * Chạy mặc định (v4):
 *   node src/server.js
 *
 * Hoặc chạy các phiên bản cụ thể (tương thích đa nền tảng Windows/Linux/macOS):
 *   node src/server.js v0
 *   node src/server.js v1
 *   node src/server.js v2
 *   node src/server.js v3
 *   node src/server.js v4
 */

'use strict';

const path      = require('path');
const express   = require('express');
const { cloneDB, BASE } = require('./db');
const { authenticate, signToken } = require('./auth');
const services  = require('./taskService');

// Hỗ trợ truyền version qua tham số dòng lệnh hoặc biến môi trường
let activeVersion = (process.argv[2] && process.argv[2].replace(/^--version=/, '')) || process.env.VERSION || 'v4';

if (!services[activeVersion]) {
  console.error(`Phiên bản không hợp lệ: ${activeVersion}. Vui lòng chọn v0, v1, v2, v3, hoặc v4.`);
  process.exit(1);
}

const app = express();
app.use(express.json());

// Phục vụ giao diện E2E Dashboard tại thư mục public
app.use(express.static(path.join(__dirname, '../public')));

// ── In-memory Database ───────────────────────────────────────────────────────
let db = cloneDB();

/** Helper lấy service theo request (ưu tiên header x-version / query ?version nếu có để test) */
function getService(req) {
  const reqVer = req.headers['x-version'] || req.query.version;
  if (reqVer && services[reqVer]) {
    return { service: services[reqVer], version: reqVer };
  }
  return { service: services[activeVersion], version: activeVersion };
}

// ── Utility Endpoints ────────────────────────────────────────────────────────

app.get('/health', (_req, res) => res.json({ ok: true, version: activeVersion }));

app.get('/api/version', (_req, res) => res.json({ version: activeVersion }));

app.post('/api/version', (req, res) => {
  const v = req.body && req.body.version;
  if (v && services[v]) {
    activeVersion = v;
    return res.json({ ok: true, version: activeVersion });
  }
  return res.status(400).json({ error: 'invalid_version', allowed: Object.keys(services) });
});

/** Lấy JWT token cho các người dùng mẫu để kiểm thử */
app.get('/api/tokens', (_req, res) => {
  const tokens = {};
  for (const u of Object.keys(BASE.users)) {
    tokens[u] = signToken(u);
  }
  res.json({ tokens });
});

/** Lấy trạng thái hiện tại của cơ sở dữ liệu */
app.get('/api/db', (_req, res) => {
  res.json({ db, users: BASE.users });
});

/** Khởi tạo lại cơ sở dữ liệu về trạng thái ban đầu (hỗ trợ nạp fixture kiểm thử) */
const resetHandler = (req, res) => {
  db = cloneDB();
  if (req.body && req.body.fixture) {
    if (req.body.fixture === 'viewer') {
      db.projects.alpha.members.bob = 'Viewer';
    } else if (req.body.fixture === 'closed') {
      db.tasks.A1.status = 'Closed';
    }
  }
  res.json({ ok: true, message: 'Khởi tạo lại cơ sở dữ liệu thành công' });
};
app.post('/test/reset', resetHandler);
app.post('/api/test/reset', resetHandler);

// ── Tasks Endpoints ──────────────────────────────────────────────────────────

/**
 * GET /tasks/:id
 * Đọc task theo ID.
 * Yêu cầu: token hợp lệ.
 */
app.get('/tasks/:id', authenticate, (req, res) => {
  const { service } = getService(req);
  const result = service.getTask(db, req.user.id, req.params.id);
  res.status(result.status).json(result.body);
});

/**
 * PATCH /tasks/:id
 * Sửa task (title, status, assignee).
 * Yêu cầu: token hợp lệ.
 */
app.patch('/tasks/:id', authenticate, (req, res) => {
  const { service } = getService(req);
  if (!service.editTask) {
    return res.status(501).json({ error: 'not_implemented' });
  }
  const result = service.editTask(db, req.user.id, req.params.id, req.body);
  res.status(result.status).json(result.body);
});

// ── Projects Endpoints ───────────────────────────────────────────────────────

/**
 * DELETE /projects/:id
 * Xóa project.
 */
app.delete('/projects/:id', authenticate, (req, res) => {
  const { service } = getService(req);
  if (!service.deleteProject) {
    return res.status(501).json({ error: 'not_implemented' });
  }
  const result = service.deleteProject(db, req.user.id, req.params.id);
  res.status(result.status).json(result.body);
});

/**
 * POST /projects/:id/members
 * Quản lý thành viên project.
 */
app.post('/projects/:id/members', authenticate, (req, res) => {
  const { service } = getService(req);
  if (!service.manageMembers) {
    return res.status(501).json({ error: 'not_implemented' });
  }
  const result = service.manageMembers(db, req.user.id, req.params.id);
  res.status(result.status).json(result.body);
});

// ── Khởi động Server ─────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;

function startServer(port = PORT) {
  return new Promise((resolve) => {
    const server = app.listen(port, () => {
      console.log(`Task API [${activeVersion}] đang chạy tại http://localhost:${port}`);
      resolve(server);
    });
  });
}

if (require.main === module) {
  startServer();
}

module.exports = { app, startServer, getActiveVersion: () => activeVersion, setActiveVersion: (v) => { activeVersion = v; } };
