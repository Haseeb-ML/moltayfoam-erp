const express = require('express');
const db = require('../db');
const { authenticateToken } = require('../middleware/auth');
const { requirePermission } = require('../middleware/rbac');
const { auditMiddleware } = require('../middleware/audit');
const { seedDatabase } = require('../db/seed');

const router = express.Router();
router.use(authenticateToken);

// GET /api/settings - System settings
router.get('/', (req, res) => {
  const settingsRows = db.query('SELECT key, value, category FROM settings');
  const settingsObj = {};
  for (const row of settingsRows) {
    settingsObj[row.key] = row.value;
  }
  res.json({ success: true, data: settingsObj });
});

// PUT /api/settings - Update system settings
router.put('/', requirePermission('MANAGE_SETTINGS'), (req, res) => {
  const updates = req.body; // { key: value }

  db.transaction(() => {
    for (const [key, value] of Object.entries(updates)) {
      db.run('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', [key, String(value)]);
    }
  });

  auditMiddleware(req, {
    module: 'SETTINGS',
    recordId: 'GLOBAL',
    action: 'UPDATE_SETTINGS',
    newValues: updates
  });

  res.json({ success: true, message: 'Settings updated successfully.' });
});

// GET /api/settings/roles - List all roles with assigned permissions
router.get('/roles', requirePermission('MANAGE_SETTINGS'), (req, res) => {
  const roles = db.query('SELECT * FROM roles ORDER BY id ASC');
  const allPerms = db.query('SELECT * FROM permissions ORDER BY module, name');

  const rolePerms = db.query('SELECT role_id, permission_id FROM role_permissions');
  const permMapByRole = {};

  for (const rp of rolePerms) {
    if (!permMapByRole[rp.role_id]) permMapByRole[rp.role_id] = [];
    permMapByRole[rp.role_id].push(rp.permission_id);
  }

  const result = roles.map((r) => ({
    ...r,
    permission_ids: permMapByRole[r.id] || []
  }));

  res.json({ success: true, data: { roles: result, allPermissions: allPerms } });
});

// POST /api/settings/roles - Create new custom role
router.post('/roles', requirePermission('MANAGE_SETTINGS'), (req, res) => {
  const { name, description, permission_ids } = req.body;

  if (!name) {
    return res.status(400).json({ success: false, error: 'Role name is required.' });
  }

  try {
    const roleId = db.transaction(() => {
      const rResult = db.run(
        'INSERT INTO roles (name, description, is_system) VALUES (?, ?, 0)',
        [name.trim(), description || '']
      );
      const newId = rResult.lastInsertRowid;

      if (Array.isArray(permission_ids)) {
        for (const pId of permission_ids) {
          db.run('INSERT INTO role_permissions (role_id, permission_id) VALUES (?, ?)', [newId, parseInt(pId, 10)]);
        }
      }
      return newId;
    });

    auditMiddleware(req, {
      module: 'RBAC',
      recordId: roleId,
      action: 'CREATE_ROLE',
      newValues: { name, description, permission_ids }
    });

    res.status(201).json({ success: true, message: `Role "${name}" created successfully.`, id: roleId });
  } catch (err) {
    res.status(400).json({ success: false, error: 'Role name already exists.' });
  }
});

// PUT /api/settings/roles/:id - Update role permissions (Controls dynamic tab visibility)
router.put('/roles/:id', requirePermission('MANAGE_SETTINGS'), (req, res) => {
  const roleId = parseInt(req.params.id, 10);
  const { name, description, permission_ids } = req.body;

  const existing = db.get('SELECT * FROM roles WHERE id = ?', [roleId]);
  if (!existing) {
    return res.status(404).json({ success: false, error: 'Role not found.' });
  }

  try {
    db.transaction(() => {
      if (name) {
        db.run('UPDATE roles SET name = ?, description = ? WHERE id = ?', [name.trim(), description || '', roleId]);
      }

      if (Array.isArray(permission_ids)) {
        // Replace permissions
        db.run('DELETE FROM role_permissions WHERE role_id = ?', [roleId]);
        for (const pId of permission_ids) {
          db.run('INSERT INTO role_permissions (role_id, permission_id) VALUES (?, ?)', [roleId, parseInt(pId, 10)]);
        }
      }
    });

    auditMiddleware(req, {
      module: 'RBAC',
      recordId: roleId,
      action: 'UPDATE_ROLE_PERMISSIONS',
      newValues: { roleId, permission_ids }
    });

    res.json({ success: true, message: `Permissions for role "${existing.name}" updated successfully.` });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/settings/seed-reset - Reset and seed demo database
router.post('/seed-reset', requirePermission('MANAGE_SETTINGS'), (req, res) => {
  try {
    seedDatabase();
    res.json({ success: true, message: 'Database reset and seeded with demo data.' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
