const express = require('express');
const db = require('../db');
const { authenticateToken } = require('../middleware/auth');
const { requirePermission, getEffectiveShowroomId } = require('../middleware/rbac');
const { auditMiddleware } = require('../middleware/audit');

const router = express.Router();
router.use(authenticateToken);

// GET /api/showrooms
router.get('/', requirePermission('VIEW_SHOWROOMS'), (req, res) => {
  const showrooms = db.query(`
    SELECT s.*, 
      (SELECT COUNT(DISTINCT e.id) FROM employees e WHERE e.showroom_id = s.id AND e.status = 'ACTIVE') as staff_count,
      (SELECT COUNT(DISTINCT o.id) FROM orders o WHERE o.showroom_id = s.id) as order_count,
      (SELECT COALESCE(SUM(i.quantity), 0) FROM inventory i WHERE i.showroom_id = s.id) as total_stock_items
    FROM showrooms s
    ORDER BY s.id ASC
  `);

  res.json({ success: true, data: showrooms });
});

// GET /api/showrooms/:id
router.get('/:id', requirePermission('VIEW_SHOWROOMS'), (req, res) => {
  const showroom = db.get('SELECT * FROM showrooms WHERE id = ?', [req.params.id]);
  if (!showroom) {
    return res.status(404).json({ success: false, error: 'Showroom not found.' });
  }

  res.json({ success: true, data: showroom });
});

// POST /api/showrooms
router.post('/', requirePermission('MANAGE_SHOWROOMS'), (req, res) => {
  const { name, code, address, phone } = req.body;

  if (!name || !code || !address || !phone) {
    return res.status(400).json({ success: false, error: 'Name, code, address and phone are required.' });
  }

  try {
    const result = db.run(
      'INSERT INTO showrooms (name, code, address, phone, is_active) VALUES (?, ?, ?, ?, 1)',
      [name.trim(), code.trim().toUpperCase(), address.trim(), phone.trim()]
    );

    auditMiddleware(req, {
      module: 'SHOWROOMS',
      recordId: result.lastInsertRowid,
      action: 'CREATE',
      newValues: { name, code, address, phone }
    });

    res.status(201).json({ success: true, message: 'Showroom created successfully.', id: result.lastInsertRowid });
  } catch (err) {
    if (err.message && err.message.includes('UNIQUE')) {
      return res.status(400).json({ success: false, error: 'A showroom with this code already exists.' });
    }
    res.status(500).json({ success: false, error: err.message });
  }
});

// PUT /api/showrooms/:id
router.put('/:id', requirePermission('MANAGE_SHOWROOMS'), (req, res) => {
  const { name, code, address, phone, is_active } = req.body;
  const existing = db.get('SELECT * FROM showrooms WHERE id = ?', [req.params.id]);

  if (!existing) {
    return res.status(404).json({ success: false, error: 'Showroom not found.' });
  }

  try {
    db.run(
      'UPDATE showrooms SET name = ?, code = ?, address = ?, phone = ?, is_active = ? WHERE id = ?',
      [
        name || existing.name,
        (code || existing.code).toUpperCase(),
        address || existing.address,
        phone || existing.phone,
        is_active !== undefined ? is_active : existing.is_active,
        req.params.id
      ]
    );

    auditMiddleware(req, {
      module: 'SHOWROOMS',
      recordId: req.params.id,
      action: 'UPDATE',
      oldValues: existing,
      newValues: { name, code, address, phone, is_active }
    });

    res.json({ success: true, message: 'Showroom updated successfully.' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
