const express = require('express');
const db = require('../db');
const { authenticateToken } = require('../middleware/auth');
const { requirePermission, getEffectiveShowroomId } = require('../middleware/rbac');
const { auditMiddleware } = require('../middleware/audit');

const router = express.Router();
router.use(authenticateToken);

// GET /api/deliveries
router.get('/', requirePermission('VIEW_DELIVERIES'), (req, res) => {
  const effectiveShowroomId = getEffectiveShowroomId(req);
  const { status, assigned_staff_id, search, from_date, to_date } = req.query;

  let query = `
    SELECT d.*, c.name as customer_name, c.phone as customer_mobile,
           s.name as showroom_name, s.code as showroom_code,
           e.full_name as delivery_staff_name, e.phone as delivery_staff_phone,
           o.order_number, o.net_total as order_net_total,
           co.custom_order_number
    FROM deliveries d
    JOIN customers c ON d.customer_id = c.id
    JOIN showrooms s ON d.showroom_id = s.id
    LEFT JOIN employees e ON d.assigned_staff_id = e.id
    LEFT JOIN orders o ON d.order_id = o.id
    LEFT JOIN custom_orders co ON d.custom_order_id = co.id
    WHERE 1=1
  `;

  const params = [];

  // If the user is specifically Delivery Staff, show only deliveries assigned to their employee record
  if (req.user.role_id === 5) {
    const emp = db.get('SELECT id FROM employees WHERE user_id = ?', [req.user.id]);
    if (emp) {
      query += ` AND d.assigned_staff_id = ?`;
      params.push(emp.id);
    }
  } else {
    if (effectiveShowroomId) {
      query += ` AND d.showroom_id = ?`;
      params.push(effectiveShowroomId);
    }
    if (assigned_staff_id) {
      query += ` AND d.assigned_staff_id = ?`;
      params.push(parseInt(assigned_staff_id, 10));
    }
  }

  if (status) {
    query += ` AND d.status = ?`;
    params.push(status.toUpperCase());
  }

  if (from_date) {
    query += ` AND d.delivery_date >= ?`;
    params.push(from_date);
  }

  if (to_date) {
    query += ` AND d.delivery_date <= ?`;
    params.push(to_date);
  }

  if (search) {
    query += ` AND (d.delivery_number LIKE ? OR o.order_number LIKE ? OR co.custom_order_number LIKE ? OR c.name LIKE ? OR d.customer_phone LIKE ? OR d.delivery_address LIKE ?)`;
    const s = `%${search.trim()}%`;
    params.push(s, s, s, s, s, s);
  }

  query += ` ORDER BY d.id DESC`;

  const deliveries = db.query(query, params);
  res.json({ success: true, data: deliveries });
});

// GET /api/deliveries/:id
router.get('/:id', requirePermission('VIEW_DELIVERIES'), (req, res) => {
  const delivery = db.get(
    `SELECT d.*, c.name as customer_name, c.phone as customer_mobile, c.address as customer_full_address,
            s.name as showroom_name, s.code as showroom_code,
            e.full_name as delivery_staff_name, e.phone as delivery_staff_phone,
            o.order_number, o.net_total as order_net_total, o.paid_amount as order_paid, o.remaining_balance as order_balance,
            co.custom_order_number
     FROM deliveries d
     JOIN customers c ON d.customer_id = c.id
     JOIN showrooms s ON d.showroom_id = s.id
     LEFT JOIN employees e ON d.assigned_staff_id = e.id
     LEFT JOIN orders o ON d.order_id = o.id
     LEFT JOIN custom_orders co ON d.custom_order_id = co.id
     WHERE d.id = ?`,
    [req.params.id]
  );

  if (!delivery) {
    return res.status(404).json({ success: false, error: 'Delivery record not found.' });
  }

  let items = [];
  if (delivery.order_id) {
    items = db.query(
      `SELECT oi.*, p.name as product_name, pv.variant_name
       FROM order_items oi
       JOIN products p ON oi.product_id = p.id
       LEFT JOIN product_variants pv ON oi.variant_id = pv.id
       WHERE oi.order_id = ?`,
      [delivery.order_id]
    );
  }

  res.json({ success: true, data: { ...delivery, items } });
});

// PATCH /api/deliveries/:id/assign - Assign delivery staff
router.patch('/:id/assign', requirePermission('UPDATE_DELIVERY'), (req, res) => {
  const { assigned_staff_id, delivery_date, delivery_time, notes } = req.body;
  const delivery = db.get('SELECT * FROM deliveries WHERE id = ?', [req.params.id]);

  if (!delivery) {
    return res.status(404).json({ success: false, error: 'Delivery not found.' });
  }

  const staffId = assigned_staff_id ? parseInt(assigned_staff_id, 10) : null;
  const newStatus = staffId ? 'ASSIGNED' : delivery.status;

  db.run(
    `UPDATE deliveries
     SET assigned_staff_id = ?, status = ?, delivery_date = ?, delivery_time = ?, notes = ?, updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    [staffId, newStatus, delivery_date || delivery.delivery_date, delivery_time || delivery.delivery_time, notes || delivery.notes, req.params.id]
  );

  // Update order status if regular order
  if (delivery.order_id) {
    db.run("UPDATE orders SET delivery_status = ? WHERE id = ?", [newStatus, delivery.order_id]);
  }

  auditMiddleware(req, {
    showroomId: delivery.showroom_id,
    module: 'DELIVERIES',
    recordId: req.params.id,
    action: 'ASSIGN_STAFF',
    newValues: { staffId, newStatus, delivery_date }
  });

  res.json({ success: true, message: 'Delivery assigned successfully.' });
});

// PATCH /api/deliveries/:id/status - Update Status & Process COD collection
router.patch('/:id/status', requirePermission('UPDATE_DELIVERY'), (req, res) => {
  const { status, collected_amount, notes } = req.body;
  const validStatuses = [
    'ORDERED', 'CONFIRMED', 'PREPARING', 'READY', 'ASSIGNED',
    'OUT_FOR_DELIVERY', 'DELIVERED', 'FAILED', 'CANCELLED', 'RETURNED'
  ];

  if (!status || !validStatuses.includes(status.toUpperCase())) {
    return res.status(400).json({ success: false, error: 'Invalid delivery status.' });
  }

  const delivery = db.get('SELECT * FROM deliveries WHERE id = ?', [req.params.id]);
  if (!delivery) {
    return res.status(404).json({ success: false, error: 'Delivery not found.' });
  }

  const targetStatus = status.toUpperCase();

  try {
    db.transaction(() => {
      let collected = delivery.collected_amount;
      const parsedCollected = parseFloat(collected_amount);

      if (!isNaN(parsedCollected) && parsedCollected > 0) {
        collected += parsedCollected;

        // Auto-record payment receipt for COD
        const receiptNumber = `RCT-COD-${Date.now().toString().slice(-6)}`;
        db.run(
          `INSERT INTO payments (receipt_number, order_id, custom_order_id, customer_id, showroom_id, amount, payment_method, reference_number, notes, received_by)
           VALUES (?, ?, ?, ?, ?, ?, 'COD', ?, ?, ?)`,
          [
            receiptNumber,
            delivery.order_id,
            delivery.custom_order_id,
            delivery.customer_id,
            delivery.showroom_id,
            parsedCollected,
            `Delivery #${delivery.delivery_number}`,
            `COD Payment collected upon delivery`,
            req.user.id
          ]
        );

        // Update Order or Custom Order
        if (delivery.order_id) {
          const ord = db.get('SELECT paid_amount, remaining_balance FROM orders WHERE id = ?', [delivery.order_id]);
          if (ord) {
            const newPaid = ord.paid_amount + parsedCollected;
            const newBal = Math.max(0, ord.remaining_balance - parsedCollected);
            const pStatus = newBal <= 0 ? 'PAID' : 'PARTIAL';
            db.run('UPDATE orders SET paid_amount = ?, remaining_balance = ?, payment_status = ? WHERE id = ?', [newPaid, newBal, pStatus, delivery.order_id]);
            db.run('UPDATE invoices SET paid_amount = ?, balance = ? WHERE order_id = ?', [newPaid, newBal, delivery.order_id]);
          }
        }

        if (delivery.custom_order_id) {
          const cord = db.get('SELECT paid_amount, remaining_balance FROM custom_orders WHERE id = ?', [delivery.custom_order_id]);
          if (cord) {
            const newPaid = cord.paid_amount + parsedCollected;
            const newBal = Math.max(0, cord.remaining_balance - parsedCollected);
            db.run('UPDATE custom_orders SET paid_amount = ?, remaining_balance = ? WHERE id = ?', [newPaid, newBal, delivery.custom_order_id]);
            db.run('UPDATE invoices SET paid_amount = ?, balance = ? WHERE custom_order_id = ?', [newPaid, newBal, delivery.custom_order_id]);
          }
        }

        // Deduct from customer outstanding
        db.run('UPDATE customers SET outstanding_balance = MAX(0, outstanding_balance - ?) WHERE id = ?', [parsedCollected, delivery.customer_id]);
      }

      // Update delivery record
      db.run(
        `UPDATE deliveries
         SET status = ?, collected_amount = ?, notes = COALESCE(?, notes), updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [targetStatus, collected, notes || null, delivery.id]
      );

      // Reflect on parent order
      if (delivery.order_id) {
        db.run('UPDATE orders SET delivery_status = ? WHERE id = ?', [targetStatus, delivery.order_id]);
        if (targetStatus === 'DELIVERED') {
          db.run("UPDATE orders SET order_status = 'COMPLETED' WHERE id = ?", [delivery.order_id]);
        }
      }
    });

    auditMiddleware(req, {
      showroomId: delivery.showroom_id,
      module: 'DELIVERIES',
      recordId: delivery.id,
      action: 'UPDATE_STATUS',
      oldValues: { status: delivery.status },
      newValues: { status: targetStatus, collected: collected_amount }
    });

    res.json({ success: true, message: `Delivery marked as ${targetStatus}.` });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

module.exports = router;
