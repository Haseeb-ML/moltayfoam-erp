const express = require('express');
const db = require('../db');
const { authenticateToken } = require('../middleware/auth');
const { requirePermission } = require('../middleware/rbac');
const { auditMiddleware } = require('../middleware/audit');

const router = express.Router();
router.use(authenticateToken);

// GET /api/customers
router.get('/', requirePermission('VIEW_CUSTOMERS'), (req, res) => {
  const { search, has_balance } = req.query;

  let query = `
    SELECT c.*,
      (SELECT COUNT(*) FROM orders o WHERE o.customer_id = c.id) as order_count,
      (SELECT COUNT(*) FROM custom_orders co WHERE co.customer_id = c.id) as custom_order_count
    FROM customers c
    WHERE 1=1
  `;

  const params = [];

  if (search) {
    query += ` AND (c.name LIKE ? OR c.phone LIKE ? OR c.id = ?)`;
    const s = `%${search.trim()}%`;
    params.push(s, s, parseInt(search, 10) || 0);
  }

  if (has_balance === 'true' || has_balance === '1') {
    query += ` AND c.outstanding_balance > 0`;
  }

  query += ` ORDER BY c.id DESC`;

  const customers = db.query(query, params);
  res.json({ success: true, data: customers });
});

// GET /api/customers/:id - 360 Degree Customer Ledger
router.get('/:id', requirePermission('VIEW_CUSTOMERS'), (req, res) => {
  const customer = db.get('SELECT * FROM customers WHERE id = ?', [req.params.id]);
  if (!customer) {
    return res.status(404).json({ success: false, error: 'Customer not found.' });
  }

  // 1. Orders
  const orders = db.query(
    `SELECT o.*, s.name as showroom_name, s.code as showroom_code, u.full_name as salesman_name
     FROM orders o
     JOIN showrooms s ON o.showroom_id = s.id
     JOIN users u ON o.salesman_id = u.id
     WHERE o.customer_id = ?
     ORDER BY o.id DESC`,
    [customer.id]
  );

  // 2. Custom Orders
  const customOrders = db.query(
    `SELECT co.*, s.name as showroom_name, s.code as showroom_code, u.full_name as cashier_name
     FROM custom_orders co
     JOIN showrooms s ON co.showroom_id = s.id
     JOIN users u ON co.cashier_id = u.id
     WHERE co.customer_id = ?
     ORDER BY co.id DESC`,
    [customer.id]
  );

  // 3. Payments
  const payments = db.query(
    `SELECT p.*, s.name as showroom_name, u.full_name as received_by_name
     FROM payments p
     JOIN showrooms s ON p.showroom_id = s.id
     JOIN users u ON p.received_by = u.id
     WHERE p.customer_id = ?
     ORDER BY p.id DESC`,
    [customer.id]
  );

  // 4. Deliveries
  const deliveries = db.query(
    `SELECT d.*, s.name as showroom_name, e.full_name as delivery_staff_name
     FROM deliveries d
     JOIN showrooms s ON d.showroom_id = s.id
     LEFT JOIN employees e ON d.assigned_staff_id = e.id
     WHERE d.customer_id = ?
     ORDER BY d.id DESC`,
    [customer.id]
  );

  res.json({
    success: true,
    data: {
      customer,
      orders,
      customOrders,
      payments,
      deliveries
    }
  });
});

// POST /api/customers
router.post('/', requirePermission('MANAGE_CUSTOMERS'), (req, res) => {
  const { name, phone, address, notes } = req.body;

  if (!name || !phone) {
    return res.status(400).json({ success: false, error: 'Customer name and phone number are required.' });
  }

  try {
    const result = db.run(
      'INSERT INTO customers (name, phone, address, notes) VALUES (?, ?, ?, ?)',
      [name.trim(), phone.trim(), address ? address.trim() : '', notes ? notes.trim() : '']
    );

    auditMiddleware(req, {
      module: 'CUSTOMERS',
      recordId: result.lastInsertRowid,
      action: 'CREATE',
      newValues: { name, phone, address }
    });

    res.status(201).json({
      success: true,
      message: 'Customer registered successfully.',
      id: result.lastInsertRowid
    });
  } catch (err) {
    if (err.message && err.message.includes('UNIQUE')) {
      return res.status(400).json({ success: false, error: 'A customer with this phone number already exists.' });
    }
    res.status(500).json({ success: false, error: err.message });
  }
});

// PUT /api/customers/:id
router.put('/:id', requirePermission('MANAGE_CUSTOMERS'), (req, res) => {
  const { name, phone, address, notes } = req.body;
  const existing = db.get('SELECT * FROM customers WHERE id = ?', [req.params.id]);

  if (!existing) {
    return res.status(404).json({ success: false, error: 'Customer not found.' });
  }

  try {
    db.run(
      'UPDATE customers SET name = ?, phone = ?, address = ?, notes = ? WHERE id = ?',
      [
        name ? name.trim() : existing.name,
        phone ? phone.trim() : existing.phone,
        address !== undefined ? address.trim() : existing.address,
        notes !== undefined ? notes.trim() : existing.notes,
        req.params.id
      ]
    );

    auditMiddleware(req, {
      module: 'CUSTOMERS',
      recordId: req.params.id,
      action: 'UPDATE',
      oldValues: existing,
      newValues: { name, phone, address, notes }
    });

    res.json({ success: true, message: 'Customer updated successfully.' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
