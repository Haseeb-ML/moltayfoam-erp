const express = require('express');
const db = require('../db');
const { authenticateToken } = require('../middleware/auth');
const { requirePermission, getEffectiveShowroomId } = require('../middleware/rbac');
const { auditMiddleware } = require('../middleware/audit');

const router = express.Router();
router.use(authenticateToken);

// GET /api/custom-orders - List custom orders
router.get('/', requirePermission('VIEW_CUSTOM_ORDERS'), (req, res) => {
  const effectiveShowroomId = getEffectiveShowroomId(req);
  const { status, customer_id, search, from_date, to_date } = req.query;

  let query = `
    SELECT co.*, c.name as customer_name, c.phone as customer_phone,
           s.name as showroom_name, s.code as showroom_code,
           u.full_name as cashier_name,
           inv.invoice_number
    FROM custom_orders co
    JOIN customers c ON co.customer_id = c.id
    JOIN showrooms s ON co.showroom_id = s.id
    JOIN users u ON co.cashier_id = u.id
    LEFT JOIN invoices inv ON co.id = inv.custom_order_id
    WHERE 1=1
  `;

  const params = [];

  if (effectiveShowroomId) {
    query += ` AND co.showroom_id = ?`;
    params.push(effectiveShowroomId);
  }

  if (status) {
    query += ` AND co.status = ?`;
    params.push(status.toUpperCase());
  }

  if (customer_id) {
    query += ` AND co.customer_id = ?`;
    params.push(parseInt(customer_id, 10));
  }

  if (from_date) {
    query += ` AND DATE(co.created_at) >= ?`;
    params.push(from_date);
  }

  if (to_date) {
    query += ` AND DATE(co.created_at) <= ?`;
    params.push(to_date);
  }

  if (search) {
    query += ` AND (co.custom_order_number LIKE ? OR c.name LIKE ? OR c.phone LIKE ? OR co.item_description LIKE ?)`;
    const s = `%${search.trim()}%`;
    params.push(s, s, s, s);
  }

  query += ` ORDER BY co.id DESC`;

  const customOrders = db.query(query, params);
  res.json({ success: true, data: customOrders });
});

// GET /api/custom-orders/:id
router.get('/:id', requirePermission('VIEW_CUSTOM_ORDERS'), (req, res) => {
  const order = db.get(
    `SELECT co.*, c.name as customer_name, c.phone as customer_phone, c.address as customer_address,
            s.name as showroom_name, s.code as showroom_code,
            u.full_name as cashier_name,
            inv.invoice_number
     FROM custom_orders co
     JOIN customers c ON co.customer_id = c.id
     JOIN showrooms s ON co.showroom_id = s.id
     JOIN users u ON co.cashier_id = u.id
     LEFT JOIN invoices inv ON co.id = inv.custom_order_id
     WHERE co.id = ?`,
    [req.params.id]
  );

  if (!order) {
    return res.status(404).json({ success: false, error: 'Custom order not found.' });
  }

  const payments = db.query(
    `SELECT p.*, u.full_name as received_by_name
     FROM payments p
     JOIN users u ON p.received_by = u.id
     WHERE p.custom_order_id = ?
     ORDER BY p.id ASC`,
    [order.id]
  );

  const delivery = db.get(
    `SELECT d.*, e.full_name as delivery_staff_name
     FROM deliveries d
     LEFT JOIN employees e ON d.assigned_staff_id = e.id
     WHERE d.custom_order_id = ?`,
    [order.id]
  );

  res.json({
    success: true,
    data: {
      ...order,
      payments,
      delivery
    }
  });
});

// POST /api/custom-orders - Cashier Make-To-Order Creation
router.post('/', requirePermission('CREATE_CUSTOM_ORDERS'), (req, res) => {
  const {
    customer_id,
    customer_data,
    showroom_id,
    item_description,
    size_specification,
    quantity = 1,
    manufacturing_cost,
    selling_price,
    paid_amount = 0,
    payment_method = 'CASH',
    payment_reference = '',
    delivery_address = '',
    notes = ''
  } = req.body;

  const targetShowroomId = showroom_id ? parseInt(showroom_id, 10) : req.user.showroom_id;
  if (!targetShowroomId) {
    return res.status(400).json({ success: false, error: 'Showroom selection is required.' });
  }

  if (!item_description || !size_specification) {
    return res.status(400).json({ success: false, error: 'Item description and size/specification are required.' });
  }

  const qty = parseInt(quantity, 10) || 1;
  const costPerUnit = parseFloat(manufacturing_cost);
  const pricePerUnit = parseFloat(selling_price);

  if (isNaN(costPerUnit) || costPerUnit < 0 || isNaN(pricePerUnit) || pricePerUnit <= 0) {
    return res.status(400).json({ success: false, error: 'Valid manufacturing cost and selling price are required.' });
  }

  // Calculate profit and margin
  const totalCost = costPerUnit * qty;
  const totalSale = pricePerUnit * qty;
  const grossProfit = totalSale - totalCost;
  const profitMarginPct = totalSale > 0 ? (grossProfit / totalSale) * 100 : 0;

  const parsedPaid = Math.min(totalSale, parseFloat(paid_amount) || 0);
  const remainingBalance = totalSale - parsedPaid;

  try {
    const result = db.transaction(() => {
      // 1. Resolve customer
      let resolvedCustomerId = customer_id ? parseInt(customer_id, 10) : null;
      if (!resolvedCustomerId && customer_data && customer_data.phone && customer_data.name) {
        let existing = db.get('SELECT id FROM customers WHERE phone = ?', [customer_data.phone.trim()]);
        if (existing) {
          resolvedCustomerId = existing.id;
        } else {
          const newCust = db.run(
            'INSERT INTO customers (name, phone, address) VALUES (?, ?, ?)',
            [customer_data.name.trim(), customer_data.phone.trim(), customer_data.address ? customer_data.address.trim() : '']
          );
          resolvedCustomerId = newCust.lastInsertRowid;
        }
      }

      if (!resolvedCustomerId) {
        throw new Error('Valid customer is required for custom orders.');
      }

      const customOrderNumber = `CUST-${Date.now().toString().slice(-6)}`;

      // 2. Insert Custom Order (locked for immutability)
      const coResult = db.run(
        `INSERT INTO custom_orders (
          custom_order_number, customer_id, showroom_id, cashier_id,
          item_description, size_specification, quantity,
          manufacturing_cost, selling_price, total_cost, total_sale,
          gross_profit, profit_margin_pct, paid_amount, remaining_balance,
          status, delivery_address, is_locked, notes
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'RECEIVED', ?, 1, ?)`,
        [
          customOrderNumber,
          resolvedCustomerId,
          targetShowroomId,
          req.user.id,
          item_description.trim(),
          size_specification.trim(),
          qty,
          costPerUnit,
          pricePerUnit,
          totalCost,
          totalSale,
          grossProfit,
          profitMarginPct.toFixed(2),
          parsedPaid,
          remainingBalance,
          delivery_address || '',
          notes || ''
        ]
      );

      const customOrderId = coResult.lastInsertRowid;

      // 3. Connect to Sales Invoice
      const invoiceNumber = `INV-CUST-${Date.now().toString().slice(-6)}`;
      db.run(
        `INSERT INTO invoices (invoice_number, custom_order_id, customer_id, showroom_id, net_total, paid_amount, balance)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [invoiceNumber, customOrderId, resolvedCustomerId, targetShowroomId, totalSale, parsedPaid, remainingBalance]
      );

      // 4. Record Initial Payment
      if (parsedPaid > 0) {
        const receiptNumber = `RCT-CUST-${Date.now().toString().slice(-6)}`;
        db.run(
          `INSERT INTO payments (receipt_number, custom_order_id, customer_id, showroom_id, amount, payment_method, reference_number, notes, received_by)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            receiptNumber,
            customOrderId,
            resolvedCustomerId,
            targetShowroomId,
            parsedPaid,
            payment_method,
            payment_reference || '',
            `Advance payment for Custom Order #${customOrderNumber}`,
            req.user.id
          ]
        );
      }

      // 5. Create Delivery Record
      const customer = db.get('SELECT phone, address FROM customers WHERE id = ?', [resolvedCustomerId]);
      const deliveryNumber = `DEL-CUST-${Date.now().toString().slice(-6)}`;
      db.run(
        `INSERT INTO deliveries (delivery_number, custom_order_id, customer_id, showroom_id, delivery_address, customer_phone, status, cod_amount, collected_amount, notes)
         VALUES (?, ?, ?, ?, ?, ?, 'ORDERED', ?, 0.0, ?)`,
        [
          deliveryNumber,
          customOrderId,
          resolvedCustomerId,
          targetShowroomId,
          delivery_address || (customer ? customer.address : ''),
          customer ? customer.phone : '',
          remainingBalance,
          `Custom order delivery: ${item_description}`
        ]
      );

      // 6. Update Customer Ledger
      db.run(
        `UPDATE customers
         SET total_orders = total_orders + 1,
             total_spent = total_spent + ?,
             outstanding_balance = outstanding_balance + ?
         WHERE id = ?`,
        [totalSale, remainingBalance, resolvedCustomerId]
      );

      return {
        customOrderId,
        customOrderNumber,
        invoiceNumber,
        totalCost,
        totalSale,
        grossProfit,
        profitMarginPct: profitMarginPct.toFixed(2),
        paidAmount: parsedPaid,
        remainingBalance
      };
    });

    auditMiddleware(req, {
      showroomId: targetShowroomId,
      module: 'CUSTOM_ORDERS',
      recordId: result.customOrderId,
      action: 'CREATE_CUSTOM_ORDER',
      newValues: result
    });

    res.status(201).json({
      success: true,
      message: `Custom Order ${result.customOrderNumber} created with Gross Profit of ${result.grossProfit}.`,
      data: result
    });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// PATCH /api/custom-orders/:id/status - Production / Delivery Status Workflow
router.patch('/:id/status', requirePermission('CREATE_CUSTOM_ORDERS'), (req, res) => {
  const { status, notes } = req.body;
  const validStatuses = ['RECEIVED', 'IN_PRODUCTION', 'READY', 'DELIVERED', 'COMPLETED', 'CANCELLED'];

  if (!status || !validStatuses.includes(status.toUpperCase())) {
    return res.status(400).json({ success: false, error: 'Invalid status.' });
  }

  const existing = db.get('SELECT * FROM custom_orders WHERE id = ?', [req.params.id]);
  if (!existing) {
    return res.status(404).json({ success: false, error: 'Custom order not found.' });
  }

  const newStatus = status.toUpperCase();

  db.run('UPDATE custom_orders SET status = ? WHERE id = ?', [newStatus, req.params.id]);

  auditMiddleware(req, {
    showroomId: existing.showroom_id,
    module: 'CUSTOM_ORDERS',
    recordId: req.params.id,
    action: 'STATUS_CHANGE',
    oldValues: { status: existing.status },
    newValues: { status: newStatus },
    reason: notes || `Status changed to ${newStatus}`
  });

  res.json({ success: true, message: `Status updated to ${newStatus}.` });
});

// POST /api/custom-orders/:id/correct - Admin-only controlled correction (Strict Immutability Safeguard)
router.post('/:id/correct', requirePermission('MANAGE_SETTINGS'), (req, res) => {
  const { reason, new_manufacturing_cost, new_selling_price } = req.body;

  if (!reason || reason.trim().length < 10) {
    return res.status(400).json({ success: false, error: 'A detailed reason (minimum 10 characters) is required for audit.' });
  }

  const existing = db.get('SELECT * FROM custom_orders WHERE id = ?', [req.params.id]);
  if (!existing) {
    return res.status(404).json({ success: false, error: 'Custom order not found.' });
  }

  const cost = new_manufacturing_cost !== undefined ? parseFloat(new_manufacturing_cost) : existing.manufacturing_cost;
  const price = new_selling_price !== undefined ? parseFloat(new_selling_price) : existing.selling_price;
  const totalCost = cost * existing.quantity;
  const totalSale = price * existing.quantity;
  const grossProfit = totalSale - totalCost;
  const marginPct = totalSale > 0 ? (grossProfit / totalSale) * 100 : 0;
  const newBalance = totalSale - existing.paid_amount;

  db.transaction(() => {
    db.run(
      `UPDATE custom_orders
       SET manufacturing_cost = ?, selling_price = ?, total_cost = ?, total_sale = ?,
           gross_profit = ?, profit_margin_pct = ?, remaining_balance = ?
       WHERE id = ?`,
      [cost, price, totalCost, totalSale, grossProfit, marginPct.toFixed(2), newBalance, req.params.id]
    );

    // Update connected invoice
    db.run(
      'UPDATE invoices SET net_total = ?, balance = ? WHERE custom_order_id = ?',
      [totalSale, newBalance, req.params.id]
    );

    // Update customer outstanding balance
    const diff = newBalance - existing.remaining_balance;
    db.run('UPDATE customers SET outstanding_balance = outstanding_balance + ? WHERE id = ?', [diff, existing.customer_id]);
  });

  auditMiddleware(req, {
    showroomId: existing.showroom_id,
    module: 'CUSTOM_ORDERS',
    recordId: req.params.id,
    action: 'ADMIN_CORRECTION',
    oldValues: { cost: existing.manufacturing_cost, price: existing.selling_price, profit: existing.gross_profit },
    newValues: { cost, price, profit: grossProfit },
    reason: reason.trim()
  });

  res.json({ success: true, message: 'Custom order corrected and audit log recorded.' });
});

module.exports = router;
