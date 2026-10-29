/**
 * TaskService — Business layer chứa toàn bộ logic kiểm quyền (PEP & PDP).
 *
 * Theo nguyên tắc từ slide:
 *  - Đặt kiểm quyền ở business layer (không ở controller) để mọi
 *    entry point đều đi qua cùng một điểm kiểm.
 *  - Không tin userId, role, tenantId do client tự khai.
 *  - Deny by default: nếu không có rule nào cấp quyền thì từ chối.
 *
 * ─────────────────────────────────────────────────────────────
 * Các phiên bản (version) được export ra:
 *  v0  – Starter: chỉ kiểm token, không kiểm quyền object (Lỗ hổng IDOR/BOLA).
 *  v1  – Kiểm thành viên project khi đọc task (Sửa IDOR).
 *  v2  – RBAC: role lấy từ bảng thành viên; Admin toàn cục là Owner mọi project.
 *  v3  – RBAC + ABAC + ReBAC: Member chỉ sửa task giao cho mình và còn Open.
 *  v4  – V3 + Tenant boundary: Admin và User bị giới hạn trong tenant của mình.
 * ─────────────────────────────────────────────────────────────
 */

'use strict';

const { BASE }     = require('./db');
const { canByRole } = require('./rbac');

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Lấy project theo projectId (hoặc null).
 */
function getProject(db, projectId) {
  return db.projects[projectId] || null;
}

// ── V0: Starter ──────────────────────────────────────────────────────────────
// Lỗi IDOR: chỉ kiểm token, không kiểm quyền trên object.

const v0 = {
  getTask(db, userId, taskId) {
    const task = db.tasks[taskId];
    if (!task) return { status: 404, body: { error: 'not_found' } };
    // ❌ LỖI IDOR: Không kiểm tra người gọi có thuộc project chứa task không!
    return { status: 200, body: { id: taskId, ...task } };
  },

  editTask(db, userId, taskId, data) {
    const task = db.tasks[taskId];
    if (!task) return { status: 404, body: { error: 'not_found' } };
    Object.assign(task, data);
    return { status: 200, body: { ok: true } };
  },

  deleteProject(db, userId, projectId) {
    const project = getProject(db, projectId);
    if (!project) return { status: 404, body: { error: 'not_found' } };
    delete db.projects[projectId];
    return { status: 200, body: { ok: true } };
  },

  manageMembers(db, userId, projectId) {
    const project = getProject(db, projectId);
    if (!project) return { status: 404, body: { error: 'not_found' } };
    return { status: 200, body: { ok: true } };
  },
};

// ── V1: Kiểm thành viên project khi đọc ─────────────────────────────────────

const v1 = {
  getTask(db, userId, taskId) {
    const task    = db.tasks[taskId];
    if (!task) return { status: 404, body: { error: 'not_found' } };

    const project = db.projects[task.project];
    const member  = project && project.members[userId];

    // ✅ Kiểm thành viên (sửa IDOR đọc)
    if (!member) return { status: 403, body: { error: 'forbidden' } };

    return { status: 200, body: { id: taskId, ...task } };
  },

  editTask(db, userId, taskId, data) {
    const task = db.tasks[taskId];
    if (!task) return { status: 404, body: { error: 'not_found' } };

    // ⚠️ Thao tác ghi chưa được bảo vệ theo role (V1 chỉ fix READ)
    Object.assign(task, data);
    return { status: 200, body: { ok: true } };
  },

  deleteProject(db, userId, projectId) {
    const project = getProject(db, projectId);
    if (!project) return { status: 404, body: { error: 'not_found' } };

    // ⚠️ Chưa kiểm quyền xóa project
    delete db.projects[projectId];
    return { status: 200, body: { ok: true } };
  },

  manageMembers(db, userId, projectId) {
    const project = getProject(db, projectId);
    if (!project) return { status: 404, body: { error: 'not_found' } };

    return { status: 200, body: { ok: true } };
  },
};

// ── V2: RBAC ─────────────────────────────────────────────────────────────────
// Role lấy từ bảng thành viên, không tin role do client tự khai.
// Admin (global) coi như Owner ở mọi project — nhưng chưa có tenant boundary.

const v2 = {
  _resolveRole(db, userId, project) {
    const user = BASE.users[userId];
    if (!user) return null;

    // Admin toàn cục → Owner (V2 chưa có tenant boundary)
    if (user.admin) return 'Owner';

    return project.members[userId] || null;
  },

  getTask(db, userId, taskId) {
    const task    = db.tasks[taskId];
    if (!task) return { status: 404, body: { error: 'not_found' } };

    const project = db.projects[task.project];
    if (!project) return { status: 404, body: { error: 'not_found' } };

    const role = this._resolveRole(db, userId, project);
    if (!canByRole(role, 'read'))
      return { status: 403, body: { error: 'forbidden' } };

    return { status: 200, body: { id: taskId, ...task } };
  },

  editTask(db, userId, taskId, data) {
    const task    = db.tasks[taskId];
    if (!task) return { status: 404, body: { error: 'not_found' } };

    const project = db.projects[task.project];
    if (!project) return { status: 404, body: { error: 'not_found' } };

    const role = this._resolveRole(db, userId, project);
    if (!canByRole(role, 'edit'))
      return { status: 403, body: { error: 'forbidden' } };

    Object.assign(task, data);
    return { status: 200, body: { ok: true } };
  },

  deleteProject(db, userId, projectId) {
    const project = getProject(db, projectId);
    if (!project) return { status: 404, body: { error: 'not_found' } };

    const role = this._resolveRole(db, userId, project);
    if (!canByRole(role, 'delete'))
      return { status: 403, body: { error: 'forbidden' } };

    delete db.projects[projectId];
    return { status: 200, body: { ok: true } };
  },

  manageMembers(db, userId, projectId) {
    const project = getProject(db, projectId);
    if (!project) return { status: 404, body: { error: 'not_found' } };

    const role = this._resolveRole(db, userId, project);
    if (!canByRole(role, 'members'))
      return { status: 403, body: { error: 'forbidden' } };

    return { status: 200, body: { ok: true } };
  },
};

// ── V3: RBAC + ABAC + ReBAC ──────────────────────────────────────────────────
// Mở rộng V2: Member chỉ sửa task được giao cho mình (ReBAC) VÀ task còn Open (ABAC).

const v3 = {
  ...v2,

  editTask(db, userId, taskId, data) {
    const task    = db.tasks[taskId];
    if (!task) return { status: 404, body: { error: 'not_found' } };

    const project = db.projects[task.project];
    if (!project) return { status: 404, body: { error: 'not_found' } };

    const role = v2._resolveRole(db, userId, project);
    if (!canByRole(role, 'edit'))
      return { status: 403, body: { error: 'forbidden' } };

    // ✅ ReBAC + ABAC: Member chỉ sửa task của chính mình khi còn Open
    if (role === 'Member') {
      if (task.assignee !== userId)
        return { status: 403, body: { error: 'forbidden', reason: 'not_assignee' } };
      if (task.status !== 'Open')
        return { status: 403, body: { error: 'forbidden', reason: 'task_closed' } };
    }

    Object.assign(task, data);
    return { status: 200, body: { ok: true } };
  },
};

// ── V4: V3 + Tenant Boundary ─────────────────────────────────────────────────
// Ranh giới Tenant cách ly hoàn toàn dữ liệu giữa các tổ chức.
// Admin chỉ có quyền Owner trong tenant của chính họ.
// tenantId PHẢI lấy từ DB (không tin header/body client tự khai).

const v4 = {
  _resolveRole(db, userId, project) {
    const user = BASE.users[userId];
    if (!user) return null;

    // ✅ Admin chỉ là Owner trong cùng tenant
    if (user.admin && user.tenant === project.tenant) return 'Owner';

    // Thành viên thông thường
    return project.members[userId] || null;
  },

  _checkTenant(userId, project) {
    const user = BASE.users[userId];
    if (!user || !project) return false;
    // Ranh giới tenant: người dùng thuộc tenant nào chỉ truy cập tài nguyên tenant đó
    return user.tenant === project.tenant;
  },

  getTask(db, userId, taskId) {
    const task = db.tasks[taskId];
    if (!task) return { status: 404, body: { error: 'not_found' } };

    const project = db.projects[task.project];
    if (!project) return { status: 404, body: { error: 'not_found' } };

    // ✅ Kiểm tra tenant boundary
    if (!this._checkTenant(userId, project)) {
      return { status: 403, body: { error: 'forbidden', reason: 'tenant_mismatch' } };
    }

    const role = this._resolveRole(db, userId, project);
    if (!canByRole(role, 'read'))
      return { status: 403, body: { error: 'forbidden' } };

    return { status: 200, body: { id: taskId, ...task } };
  },

  editTask(db, userId, taskId, data) {
    const task = db.tasks[taskId];
    if (!task) return { status: 404, body: { error: 'not_found' } };

    const project = db.projects[task.project];
    if (!project) return { status: 404, body: { error: 'not_found' } };

    // ✅ Kiểm tra tenant boundary
    if (!this._checkTenant(userId, project)) {
      return { status: 403, body: { error: 'forbidden', reason: 'tenant_mismatch' } };
    }

    const role = this._resolveRole(db, userId, project);
    if (!canByRole(role, 'edit'))
      return { status: 403, body: { error: 'forbidden' } };

    // ReBAC + ABAC: Member chỉ sửa task của mình khi còn Open
    if (role === 'Member') {
      if (task.assignee !== userId)
        return { status: 403, body: { error: 'forbidden', reason: 'not_assignee' } };
      if (task.status !== 'Open')
        return { status: 403, body: { error: 'forbidden', reason: 'task_closed' } };
    }

    Object.assign(task, data);
    return { status: 200, body: { ok: true } };
  },

  deleteProject(db, userId, projectId) {
    const project = getProject(db, projectId);
    if (!project) return { status: 404, body: { error: 'not_found' } };

    // ✅ Kiểm tra tenant boundary
    if (!this._checkTenant(userId, project)) {
      return { status: 403, body: { error: 'forbidden', reason: 'tenant_mismatch' } };
    }

    const role = this._resolveRole(db, userId, project);
    if (!canByRole(role, 'delete'))
      return { status: 403, body: { error: 'forbidden' } };

    delete db.projects[projectId];
    return { status: 200, body: { ok: true } };
  },

  manageMembers(db, userId, projectId) {
    const project = getProject(db, projectId);
    if (!project) return { status: 404, body: { error: 'not_found' } };

    // ✅ Kiểm tra tenant boundary
    if (!this._checkTenant(userId, project)) {
      return { status: 403, body: { error: 'forbidden', reason: 'tenant_mismatch' } };
    }

    const role = this._resolveRole(db, userId, project);
    if (!canByRole(role, 'members'))
      return { status: 403, body: { error: 'forbidden' } };

    return { status: 200, body: { ok: true } };
  },
};

module.exports = { v0, v1, v2, v3, v4 };
