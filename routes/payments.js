const express = require('express');
const db = require('../db');
const { authenticateToken } = require('../middleware/auth');
const { requirePermission, getEffectiveShowroomId } = require('../middleware/rbac');
const { auditMiddleware } = require('../middleware/audit');

const router = express.Router();
router.use(authenticateToken);

// GET /api/payments - Payment transaction ledger
router.get('/', requirePermission('VIEW_PAYMENTS'), (req, res) => {
  const effectiveShowroomId = getEffectiveShowroomId(req);
  const { customer_id, order_id, payment_method, from_date, to_date, search } = req.query;

  let query = `
    SELECT p.*, c.name as customer_name, c.phone as customer_phone,
           s.name as showroom_name, s.code as showroom_code,
           u.full_name as received_by_name,
           o.order_number, co.custom_order_number
    FROM payments p
    JOIN customers c ON p.customer_id = c.id
    JOIN showrooms s ON p.showroom_id = s.id
    JOIN users u ON p.received_by = u.id
    LEFT JOIN orders o ON p.order_id = o.id
    LEFT JOIN custom_orders co ON p.custom_order_id = co.id
    WHERE 1=1
  `;

  const params = [];

  if (effectiveShowroomId) {
    query += ` AND p.showroom_id = ?`;
    params.push(effectiveShowroomId);
  }

  if (customer_id) {
    query += ` AND p.customer_id = ?`;
    params.push(parseInt(customer_id, 10));
  }

  if (order_id) {
    query += ` AND p.order_id = ?`;
    params.push(parseInt(order_id, 10));
  }

  if (payment_method) {
    query += ` AND p.payment_method = ?`;
    params.push(payment_method.toUpperCase());
  }

  if (from_date) {
    query += ` AND DATE(p.created_at) >= ?`;
    params.push(from_date);
  }

  if (to_date) {
    query += ` AND DATE(p.created_at) <= ?`;
    params.push(to_date);
  }

  if (search) {
    query += ` AND (p.receipt_number LIKE ? OR c.name LIKE ? OR c.phone LIKE ? OR p.reference_number LIKE ?)`;
    const s = `%${search.trim()}%`;
    params.push(s, s, s, s);
  }

  query += ` ORDER BY p.id DESC`;

  const payments = db.query(query, params);
  res.json({ success: true, data: payments });
});

// POST /api/payments - Record Payment (Cash, Bank, COD settlement)
router.post('/', requirePermission('CREATE_PAYMENT'), (req, res) => {
  const {
    order_id,
    custom_order_id,
    customer_id,
    showroom_id,
    amount,
    payment_method = 'CASH',
    reference_number = '',
    notes = ''
  } = req.body;

  const payAmount = parseFloat(amount);
  if (isNaN(payAmount) || payAmount <= 0) {
    return res.status(400).json({ success: false, error: 'Payment amount must be greater than zero.' });
  }

  const targetShowroomId = showroom_id ? parseInt(showroom_id, 10) : (req.user.showroom_id || 1);

  try {
    const result = db.transaction(() => {
      let resolvedCustomerId = customer_id ? parseInt(customer_id, 10) : null;
      let order = null;
      let customOrder = null;

      // 1. If linked to regular order
      if (order_id) {
        order = db.get('SELECT * FROM orders WHERE id = ?', [parseInt(order_id, 10)]);
        if (!order) throw new Error('Referenced order not found.');
        resolvedCustomerId = order.customer_id;

        if (payAmount > order.remaining_balance) {
          throw new Error(`Payment amount (${payAmount}) cannot exceed remaining balance (${order.remaining_balance}).`);
        }

        const newPaid = order.paid_amount + payAmount;
        const newBalance = order.remaining_balance - payAmount;
        const newPayStatus = newBalance <= 0 ? 'PAID' : 'PARTIAL';

        db.run(
          'UPDATE orders SET paid_amount = ?, remaining_balance = ?, payment_status = ? WHERE id = ?',
          [newPaid, newBalance, newPayStatus, order.id]
        );

        // Update connected invoice
        db.run(
          'UPDATE invoices SET paid_amount = ?, balance = ? WHERE order_id = ?',
          [newPaid, newBalance, order.id]
        );

        // Update delivery COD if exists
        db.run(
          'UPDATE deliveries SET collected_amount = collected_amount + ?, cod_amount = ? WHERE order_id = ?',
          [payAmount, newBalance, order.id]
        );
      }

      // 2. If linked to custom order
      if (custom_order_id) {
        customOrder = db.get('SELECT * FROM custom_orders WHERE id = ?', [parseInt(custom_order_id, 10)]);
        if (!customOrder) throw new Error('Referenced custom order not found.');
        resolvedCustomerId = customOrder.customer_id;

        if (payAmount > customOrder.remaining_balance) {
          throw new Error(`Payment amount cannot exceed custom order remaining balance (${customOrder.remaining_balance}).`);
        }

        const newPaid = customOrder.paid_amount + payAmount;
        const newBalance = customOrder.remaining_balance - payAmount;

        db.run(
          'UPDATE custom_orders SET paid_amount = ?, remaining_balance = ? WHERE id = ?',
          [newPaid, newBalance, customOrder.id]
        );

        db.run(
          'UPDATE invoices SET paid_amount = ?, balance = ? WHERE custom_order_id = ?',
          [newPaid, newBalance, customOrder.id]
        );

        db.run(
          'UPDATE deliveries SET collected_amount = collected_amount + ?, cod_amount = ? WHERE custom_order_id = ?',
          [payAmount, newBalance, customOrder.id]
        );
      }

      if (!resolvedCustomerId) {
        throw new Error('A valid customer, order, or custom order is required.');
      }

      // 3. Insert Payment Record
      const receiptNumber = `RCT-${Date.now().toString().slice(-6)}`;
      const pResult = db.run(
        `INSERT INTO payments (receipt_number, order_id, custom_order_id, customer_id, showroom_id, amount, payment_method, reference_number, notes, received_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          receiptNumber,
          order ? order.id : null,
          customOrder ? customOrder.id : null,
          resolvedCustomerId,
          targetShowroomId,
          payAmount,
          payment_method.toUpperCase(),
          reference_number || '',
          notes || '',
          req.user.id
        ]
      );

      // 4. Reduce Customer Outstanding Balance
      db.run(
        'UPDATE customers SET outstanding_balance = MAX(0, outstanding_balance - ?) WHERE id = ?',
        [payAmount, resolvedCustomerId]
      );

      return {
        paymentId: pResult.lastInsertRowid,
        receiptNumber,
        amount: payAmount,
        customerId: resolvedCustomerId,
        orderId: order ? order.id : null
      };
    });

    auditMiddleware(req, {
      showroomId: targetShowroomId,
      module: 'PAYMENTS',
      recordId: result.paymentId,
      action: 'RECORD_PAYMENT',
      newValues: { receiptNumber: result.receiptNumber, amount: result.amount, method: payment_method }
    });

    res.status(201).json({
      success: true,
      message: `Payment receipt ${result.receiptNumber} recorded successfully.`,
      data: result
    });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

module.exports = router;
