const express = require('express');
const db = require('../db');
const { authenticateToken } = require('../middleware/auth');
const { requirePermission, getEffectiveShowroomId } = require('../middleware/rbac');

const router = express.Router();
router.use(authenticateToken);

// GET /api/audit-logs
router.get('/', requirePermission('VIEW_AUDIT'), (req, res) => {
  const effectiveShowroomId = getEffectiveShowroomId(req);
  const { module, action, search, from_date, to_date, limit = 100 } = req.query;

  let query = `
    SELECT al.*, u.username, u.full_name as actor_name, r.name as actor_role,
           s.name as showroom_name, s.code as showroom_code
    FROM audit_logs al
    LEFT JOIN users u ON al.user_id = u.id
    LEFT JOIN roles r ON u.role_id = r.id
    LEFT JOIN showrooms s ON al.showroom_id = s.id
    WHERE 1=1
  `;

  const params = [];

  if (effectiveShowroomId) {
    query += ` AND (al.showroom_id = ? OR al.showroom_id IS NULL)`;
    params.push(effectiveShowroomId);
  }

  if (module) {
    query += ` AND al.module = ?`;
    params.push(module.toUpperCase());
  }

  if (action) {
    query += ` AND al.action = ?`;
    params.push(action.toUpperCase());
  }

  if (from_date) {
    query += ` AND al.created_at >= ?`;
    params.push(from_date);
  }

  if (to_date) {
    query += ` AND al.created_at <= ?`;
    params.push(to_date);
  }

  if (search) {
    query += ` AND (al.record_id LIKE ? OR al.reason LIKE ? OR u.full_name LIKE ? OR al.module LIKE ?)`;
    const s = `%${search.trim()}%`;
    params.push(s, s, s, s);
  }

  query += ` ORDER BY al.id DESC LIMIT ?`;
  params.push(parseInt(limit, 10) || 100);

  const logs = db.query(query, params);
  res.json({ success: true, data: logs });
});

module.exports = router;
