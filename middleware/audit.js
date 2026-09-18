const db = require('../db');

function logAudit({
  userId = null,
  showroomId = null,
  module,
  recordId,
  action,
  oldValues = null,
  newValues = null,
  reason = null,
  ipAddress = '127.0.0.1'
}) {
  try {
    db.run(
      `INSERT INTO audit_logs (user_id, showroom_id, module, record_id, action, old_values, new_values, reason, ip_address)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        userId,
        showroomId,
        module,
        String(recordId),
        action,
        oldValues ? JSON.stringify(oldValues) : null,
        newValues ? JSON.stringify(newValues) : null,
        reason,
        ipAddress
      ]
    );
  } catch (err) {
    console.error('Failed to write audit log:', err);
  }
}

function auditMiddleware(req, auditData) {
  const userId = req.user ? req.user.id : null;
  const showroomId = req.user ? req.user.showroom_id : null;
  const ipAddress = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1';

  logAudit({
    userId,
    showroomId,
    ipAddress,
    ...auditData
  });
}

module.exports = {
  logAudit,
  auditMiddleware
};
