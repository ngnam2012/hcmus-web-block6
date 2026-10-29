'use strict';

// Original 17 slide cases. Version labels identify when the rule is introduced.
const ORACLE_TESTS = [
  { v: 1, name: 'Anonymous đọc A1', method: 'GET', path: '/tasks/A1', status: 401 },
  { v: 1, name: 'Alice đọc A1', user: 'alice', method: 'GET', path: '/tasks/A1', status: 200 },
  { v: 1, name: 'Alice đọc B1', user: 'alice', method: 'GET', path: '/tasks/B1', status: 403 },
  { v: 1, name: 'Charlie đọc B1', user: 'charlie', method: 'GET', path: '/tasks/B1', status: 200 },
  { v: 2, name: 'Viewer sửa A1', user: 'bob', method: 'PATCH', path: '/tasks/A1', fixture: 'viewer', body: {}, status: 403 },
  { v: 2, name: 'Member xóa Alpha', user: 'bob', method: 'DELETE', path: '/projects/alpha', status: 403 },
  { v: 2, name: 'Member quản lý thành viên', user: 'bob', method: 'POST', path: '/projects/alpha/members', body: {}, status: 403 },
  { v: 2, name: 'Owner xóa Alpha', user: 'alice', method: 'DELETE', path: '/projects/alpha', status: 200 },
  { v: 2, name: 'Owner quản lý thành viên', user: 'alice', method: 'POST', path: '/projects/alpha/members', body: {}, status: 200 },
  { v: 2, name: 'Bob giả mạo role Admin', user: 'bob', method: 'DELETE', path: '/projects/alpha', body: { role: 'Admin' }, status: 403 },
  { v: 3, name: 'Member sửa task được giao còn Open', user: 'bob', method: 'PATCH', path: '/tasks/A1', body: { title: 'Đã sửa' }, status: 200 },
  { v: 3, name: 'Member sửa task chưa được giao', user: 'bob', method: 'PATCH', path: '/tasks/A2', body: { title: 'Đã sửa' }, status: 403 },
  { v: 3, name: 'Member sửa task Closed', user: 'bob', method: 'PATCH', path: '/tasks/A1', fixture: 'closed', body: {}, status: 403 },
  { v: 3, name: 'Member sửa task project khác', user: 'bob', method: 'PATCH', path: '/tasks/B1', body: {}, status: 403 },
  { v: 4, name: 'Admin Alpha đọc A1', user: 'dana', method: 'GET', path: '/tasks/A1', status: 200 },
  { v: 4, name: 'Admin Alpha đọc B1', user: 'dana', method: 'GET', path: '/tasks/B1', status: 403 },
  { v: 4, name: 'Admin Alpha giả mạo tenant beta', user: 'dana', method: 'GET', path: '/tasks/B1', headers: { 'X-Tenant-Id': 'beta' }, status: 403 },
];

function applyFixture(db, fixture) {
  if (fixture === 'viewer') db.projects.alpha.members.bob = 'Viewer';
  if (fixture === 'closed') db.tasks.A1.status = 'Closed';
  return db;
}
module.exports = { ORACLE_TESTS, applyFixture };
