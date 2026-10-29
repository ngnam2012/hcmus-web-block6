/**
 * TaskService: mọi business entry point dùng chung authorize (PEP/PDP).
 * V0/V1 giữ các thiếu sót phân quyền có chủ đích để so sánh trong demo.
 * V2: RBAC project; V3: thêm assignee + Open; V4: thêm tenant boundary.
 */
'use strict';

const { MATRIX, canByRole } = require('./rbac');

const own = (object, key) => typeof key === 'string' &&
  object != null && Object.prototype.hasOwnProperty.call(object, key);
const get = (object, key) => own(object, key) ? object[key] : null;
const deny = (reason) => ({ status: 403, body: { error: 'forbidden', ...(reason && { reason }) } });
const invalid = (reason) => ({ status: 400, body: { error: 'invalid_input', reason } });
const success = () => ({ status: 200, body: { ok: true } });
const plainObject = value => value != null && typeof value === 'object' &&
  !Array.isArray(value) && [Object.prototype, null].includes(Object.getPrototypeOf(value));

/**
 * Policy Decision Point. Identity, membership, role và tenant chỉ lấy từ DB.
 * Không dùng role/tenant/userId trong payload để xác định người đang gọi.
 * Rule không tồn tại hoặc role không hợp lệ luôn bị từ chối.
 */
function authorize(version, db, userId, action, resourceId) {
  const user = get(db.users, userId);
  if (!user) return { status: 401, body: { error: 'unauthenticated' } };
  if (!['v0', 'v1', 'v2', 'v3', 'v4'].includes(version)) return deny('invalid_policy');
  if (!['read', 'edit', 'delete', 'members'].includes(action)) return deny('unknown_action');

  const projectAction = action === 'delete' || action === 'members';
  const resource = get(projectAction ? db.projects : db.tasks, resourceId);
  const project = projectAction ? resource : resource && get(db.projects, resource.project);
  if (!resource || !project) return { status: 404, body: { error: 'not_found' } };

  const memberRole = get(project.members, userId);
  let role = memberRole;
  // Historical demo: V0 lacks object authorization; V1 fixes only reading.
  if (version === 'v0' || (version === 'v1' && action !== 'read')) {
    return { status: 200, resource, project, user, role };
  }
  if (version === 'v1') {
    if (!own(MATRIX, memberRole)) return deny();
    return { status: 200, resource, project, user, role };
  }

  // Tenant boundary must run before the Admin shortcut.
  if (version === 'v4' && user.tenant !== project.tenant) return deny('tenant_mismatch');
  if (user.admin === true) role = 'Owner';
  if (!canByRole(role, action)) return deny();

  if ((version === 'v3' || version === 'v4') && action === 'edit' && role === 'Member') {
    if (resource.assignee !== userId) return deny('not_assignee');
    if (resource.status !== 'Open') return deny('task_closed');
  }
  return { status: 200, resource, project, user, role };
}

/** Validate before mutation: task.project is immutable, so PATCH cannot move data. */
function validateTaskPatch(db, project, data) {
  if (!plainObject(data)) return invalid('expected_object');
  const allowedFields = ['title', 'status', 'assignee'];
  if (Object.keys(data).some(key => !allowedFields.includes(key))) return invalid('unsupported_field');
  if (own(data, 'title') && (typeof data.title !== 'string' ||
      !data.title.trim() || data.title.length > 500)) return invalid('invalid_title');
  if (own(data, 'status') && !['Open', 'Closed'].includes(data.status)) return invalid('invalid_status');
  if (own(data, 'assignee') && data.assignee !== null) {
    const assignee = get(db.users, data.assignee);
    const role = get(project.members, data.assignee);
    if (!assignee || assignee.tenant !== project.tenant || !own(MATRIX, role)) {
      return invalid('invalid_assignee');
    }
  }
  return null;
}

function validateMemberChange(db, project, data) {
  if (!plainObject(data)) return invalid('expected_object');
  if (Object.keys(data).length === 0) return null; // Oracle permission probe.
  if (Object.keys(data).some(key => !['userId', 'role', 'remove'].includes(key))) {
    return invalid('unsupported_field');
  }
  const target = get(db.users, data.userId);
  if (!target || target.tenant !== project.tenant) return invalid('invalid_member');
  if (data.remove === true) {
    if (own(data, 'role')) return invalid('ambiguous_member_change');
  } else if (own(data, 'remove') || !own(MATRIX, data.role)) {
    return invalid('invalid_role');
  }
  // Keep at least one project Owner. Admin remains a tenant-level privilege,
  // and can never be assigned as a project role by the request body.
  const existingRole = get(project.members, data.userId);
  if (existingRole === 'Owner' && (data.remove === true || data.role !== 'Owner')) {
    const owners = Object.values(project.members).filter(role => role === 'Owner').length;
    if (owners <= 1) return { status: 409, body: { error: 'last_owner' } };
  }
  return null;
}

function createService(version) {
  return Object.freeze({
    getTask(db, userId, taskId) {
      const decision = authorize(version, db, userId, 'read', taskId);
      if (decision.status !== 200) return decision;
      return { status: 200, body: { id: taskId, ...decision.resource } };
    },

    editTask(db, userId, taskId, data = {}) {
      const decision = authorize(version, db, userId, 'edit', taskId);
      if (decision.status !== 200) return decision;
      const error = validateTaskPatch(db, decision.project, data);
      if (error) return error;
      // Explicit assignment prevents arbitrary properties or prototype setters.
      for (const field of ['title', 'status', 'assignee']) {
        if (own(data, field)) decision.resource[field] = data[field];
      }
      return success();
    },

    deleteProject(db, userId, projectId) {
      const decision = authorize(version, db, userId, 'delete', projectId);
      if (decision.status !== 200) return decision;
      for (const [taskId, task] of Object.entries(db.tasks)) {
        if (task.project === projectId) delete db.tasks[taskId];
      }
      delete db.projects[projectId];
      return success();
    },

    manageMembers(db, userId, projectId, data = {}) {
      const decision = authorize(version, db, userId, 'members', projectId);
      if (decision.status !== 200) return decision;
      const error = validateMemberChange(db, decision.project, data);
      if (error) return error;
      if (Object.keys(data).length === 0) return success();
      if (data.remove === true) {
        delete decision.project.members[data.userId];
        for (const task of Object.values(db.tasks)) {
          if (task.project === projectId && task.assignee === data.userId) task.assignee = null;
        }
      } else {
        decision.project.members[data.userId] = data.role;
      }
      return success();
    },
  });
}

module.exports = Object.fromEntries(['v0', 'v1', 'v2', 'v3', 'v4'].map(v => [v, createService(v)]));
// Keep policy inspection available to tests without adding a selectable version.
Object.defineProperty(module.exports, 'authorize', { value: authorize });
