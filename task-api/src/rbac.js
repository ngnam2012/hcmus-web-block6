/** Project role matrix, shared by V2, V3 and V4. */
'use strict';

const MATRIX = Object.freeze({
  Viewer: Object.freeze({ read: true, edit: false, delete: false, members: false }),
  Member: Object.freeze({ read: true, edit: true, delete: false, members: false }),
  Owner: Object.freeze({ read: true, edit: true, delete: true, members: true }),
});

/** Unknown roles/actions (including inherited Object keys) deny by default. */
function canByRole(role, action) {
  return typeof role === 'string' && typeof action === 'string' &&
    Object.prototype.hasOwnProperty.call(MATRIX, role) &&
    Object.prototype.hasOwnProperty.call(MATRIX[role], action) &&
    MATRIX[role][action] === true;
}

module.exports = { MATRIX, canByRole };
