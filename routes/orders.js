const express = require('express');
const db = require('../db');
const { authenticateToken } = require('../middleware/auth');
const { requirePermission, getEffectiveShowroomId } = require('../middleware/rbac');
const { auditMiddleware } = require('../middleware/audit');

const router = express.Router();
router.use(authenticateToken);

// GET /api/orders
router.get('/', requirePermission('VIEW_SALES'), (req, res) => {
  const effectiveShowroomId = getEffectiveShowroomId(req);
  const { status, payment_status, customer_id, from_date, to_date, search } = req.query;

  let query = `
    SELECT o.*, c.name as customer_name, c.phone as customer_phone,
           s.name as showroom_name, s.code as showroom_code,
           u.full_name as salesman_name,
           inv.invoice_number,
           del.delivery_number, del.status as delivery_current_status
    FROM orders o
    JOIN customers c ON o.customer_id = c.id
    JOIN showrooms s ON o.showroom_id = s.id
    JOIN users u ON o.salesman_id = u.id
    LEFT JOIN invoices inv ON o.id = inv.order_id
    LEFT JOIN deliveries del ON o.id = del.order_id
    WHERE 1=1
  `;

  const params = [];

  if (effectiveShowroomId) {
    query += ` AND o.showroom_id = ?`;
    params.push(effectiveShowroomId);
  }

  if (status) {
    query += ` AND o.order_status = ?`;
    params.push(status.toUpperCase());
  }

  if (payment_status) {
    query += ` AND o.payment_status = ?`;
    params.push(payment_status.toUpperCase());
  }

  if (customer_id) {
    query += ` AND o.customer_id = ?`;
    params.push(parseInt(customer_id, 10));
  }

  if (from_date) {
    query += ` AND DATE(o.order_date) >= ?`;
    params.push(from_date);
  }

  if (to_date) {
    query += ` AND DATE(o.order_date) <= ?`;
    params.push(to_date);
  }

  if (search) {
    query += ` AND (o.order_number LIKE ? OR c.name LIKE ? OR c.phone LIKE ? OR inv.invoice_number LIKE ?)`;
    const s = `%${search.trim()}%`;
    params.push(s, s, s, s);
  }

  query += ` ORDER BY o.id DESC`;

  const orders = db.query(query, params);
  res.json({ success: true, data: orders });
});

// GET /api/orders/:id
router.get('/:id', requirePermission('VIEW_SALES'), (req, res) => {
  const order = db.get(
    `SELECT o.*, c.name as customer_name, c.phone as customer_phone, c.address as customer_default_address,
            s.name as showroom_name, s.code as showroom_code, s.address as showroom_address, s.phone as showroom_phone,
            u.full_name as salesman_name,
            inv.invoice_number
     FROM orders o
     JOIN customers c ON o.customer_id = c.id
     JOIN showrooms s ON o.showroom_id = s.id
     JOIN users u ON o.salesman_id = u.id
     LEFT JOIN invoices inv ON o.id = inv.order_id
     WHERE o.id = ?`,
    [req.params.id]
  );

  if (!order) {
    return res.status(404).json({ success: false, error: 'Order not found.' });
  }

  // Items
  const items = db.query(
    `SELECT oi.*, p.name as product_name, p.sku as product_sku, p.unit,
            pv.variant_name, pv.sku as variant_sku
     FROM order_items oi
     JOIN products p ON oi.product_id = p.id
     LEFT JOIN product_variants pv ON oi.variant_id = pv.id
     WHERE oi.order_id = ?`,
    [order.id]
  );

  // Payments
  const payments = db.query(
    `SELECT p.*, u.full_name as received_by_name
     FROM payments p
     JOIN users u ON p.received_by = u.id
     WHERE p.order_id = ?
     ORDER BY p.id ASC`,
    [order.id]
  );

  // Delivery details
  const delivery = db.get(
    `SELECT d.*, e.full_name as delivery_staff_name, e.phone as delivery_staff_phone
     FROM deliveries d
     LEFT JOIN employees e ON d.assigned_staff_id = e.id
     WHERE d.order_id = ?`,
    [order.id]
  );

  res.json({
    success: true,
    data: {
      ...order,
      items,
      payments,
      delivery
    }
  });
});

// POST /api/orders - Atomic Checkout & Inventory Deduction
router.post('/', requirePermission('CREATE_SALE'), (req, res) => {
  const {
    customer_id,
    customer_data, // optional quick customer creation { name, phone, address }
    showroom_id,
    items, // array of { product_id, variant_id, quantity, unit_price }
    discount = 0,
    paid_amount = 0,
    payment_method = 'CASH',
    payment_reference = '',
    delivery_required = 1,
    delivery_address = '',
    delivery_notes = '',
    notes = ''
  } = req.body;

  const targetShowroomId = showroom_id ? parseInt(showroom_id, 10) : req.user.showroom_id;
  if (!targetShowroomId) {
    return res.status(400).json({ success: false, error: 'Showroom selection is required.' });
  }

  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ success: false, error: 'At least one item is required in the order.' });
  }

  try {
    const result = db.transaction(() => {
      // 1. Resolve or Create Customer
      let resolvedCustomerId = customer_id ? parseInt(customer_id, 10) : null;
      if (!resolvedCustomerId && customer_data && customer_data.phone && customer_data.name) {
        let existingCust = db.get('SELECT id FROM customers WHERE phone = ?', [customer_data.phone.trim()]);
        if (existingCust) {
          resolvedCustomerId = existingCust.id;
        } else {
          const newCust = db.run(
            'INSERT INTO customers (name, phone, address) VALUES (?, ?, ?)',
            [customer_data.name.trim(), customer_data.phone.trim(), customer_data.address ? customer_data.address.trim() : '']
          );
          resolvedCustomerId = newCust.lastInsertRowid;
        }
      }

      if (!resolvedCustomerId) {
        throw new Error('Valid customer is required for order creation.');
      }

      // 2. Validate Items & Stock Availability
      let subtotal = 0;
      for (const item of items) {
        const qty = parseInt(item.quantity, 10);
        const price = parseFloat(item.unit_price);
        const prdId = parseInt(item.product_id, 10);
        const varId = item.variant_id ? parseInt(item.variant_id, 10) : null;

        if (isNaN(qty) || qty <= 0 || isNaN(price) || price < 0) {
          throw new Error('Invalid item quantity or price.');
        }

        // Check stock in showroom
        let stockRecord;
        if (varId) {
          stockRecord = db.get('SELECT quantity FROM inventory WHERE showroom_id = ? AND product_id = ? AND variant_id = ?', [targetShowroomId, prdId, varId]);
        } else {
          stockRecord = db.get('SELECT quantity FROM inventory WHERE showroom_id = ? AND product_id = ? AND variant_id IS NULL', [targetShowroomId, prdId]);
        }

        const available = stockRecord ? stockRecord.quantity : 0;
        if (available < qty) {
          const prd = db.get('SELECT name, sku FROM products WHERE id = ?', [prdId]);
          throw new Error(`Insufficient stock for "${prd ? prd.name : 'Item'}". Available: ${available}, Requested: ${qty}`);
        }

        subtotal += qty * price;
      }

      const parsedDiscount = parseFloat(discount) || 0;
      const netTotal = Math.max(0, subtotal - parsedDiscount);
      const parsedPaid = Math.min(netTotal, parseFloat(paid_amount) || 0);
      const remainingBalance = netTotal - parsedPaid;

      let paymentStatus = 'PENDING';
      if (parsedPaid >= netTotal && netTotal > 0) {
        paymentStatus = 'PAID';
      } else if (parsedPaid > 0) {
        paymentStatus = 'PARTIAL';
      }

      const orderNumber = `ORD-${Date.now().toString().slice(-6)}`;

      // 3. Create Order
      const orderResult = db.run(
        `INSERT INTO orders (order_number, customer_id, showroom_id, salesman_id, subtotal, discount, net_total, paid_amount, remaining_balance, order_status, payment_status, delivery_required, delivery_address, delivery_status, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'CONFIRMED', ?, ?, ?, ?, ?)`,
        [
          orderNumber,
          resolvedCustomerId,
          targetShowroomId,
          req.user.id,
          subtotal,
          parsedDiscount,
          netTotal,
          parsedPaid,
          remainingBalance,
          paymentStatus,
          delivery_required ? 1 : 0,
          delivery_address || '',
          delivery_required ? 'ORDERED' : 'NOT_REQUIRED',
          notes || ''
        ]
      );

      const orderId = orderResult.lastInsertRowid;

      // 4. Create Order Items & Deduct Stock
      for (const item of items) {
        const qty = parseInt(item.quantity, 10);
        const price = parseFloat(item.unit_price);
        const prdId = parseInt(item.product_id, 10);
        const varId = item.variant_id ? parseInt(item.variant_id, 10) : null;
        const lineSubtotal = qty * price;

        db.run(
          `INSERT INTO order_items (order_id, product_id, variant_id, quantity, unit_price, subtotal)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [orderId, prdId, varId, qty, price, lineSubtotal]
        );

        // Deduct inventory
        let currentStock;
        if (varId) {
          currentStock = db.get('SELECT quantity FROM inventory WHERE showroom_id = ? AND product_id = ? AND variant_id = ?', [targetShowroomId, prdId, varId]);
        } else {
          currentStock = db.get('SELECT quantity FROM inventory WHERE showroom_id = ? AND product_id = ? AND variant_id IS NULL', [targetShowroomId, prdId]);
        }

        const newStockQty = (currentStock ? currentStock.quantity : 0) - qty;

        if (varId) {
          db.run('UPDATE inventory SET quantity = ?, updated_at = CURRENT_TIMESTAMP WHERE showroom_id = ? AND product_id = ? AND variant_id = ?', [newStockQty, targetShowroomId, prdId, varId]);
        } else {
          db.run('UPDATE inventory SET quantity = ?, updated_at = CURRENT_TIMESTAMP WHERE showroom_id = ? AND product_id = ? AND variant_id IS NULL', [newStockQty, targetShowroomId, prdId]);
        }

        // Auditable Movement
        db.run(
          `INSERT INTO inventory_movements (showroom_id, product_id, variant_id, movement_type, quantity, balance_after, reference_id, notes, created_by)
           VALUES (?, ?, ?, 'SALE', ?, ?, ?, ?, ?)`,
          [targetShowroomId, prdId, varId, -qty, newStockQty, orderNumber, `Retail Sale (#${orderNumber})`, req.user.id]
        );
      }

      // 5. Create Invoice
      const invoiceNumber = `INV-${Date.now().toString().slice(-6)}`;
      db.run(
        `INSERT INTO invoices (invoice_number, order_id, customer_id, showroom_id, net_total, paid_amount, balance)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [invoiceNumber, orderId, resolvedCustomerId, targetShowroomId, netTotal, parsedPaid, remainingBalance]
      );

      // 6. Record Payment if paid > 0
      if (parsedPaid > 0) {
        const receiptNumber = `RCT-${Date.now().toString().slice(-6)}`;
        db.run(
          `INSERT INTO payments (receipt_number, order_id, customer_id, showroom_id, amount, payment_method, reference_number, notes, received_by)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            receiptNumber,
            orderId,
            resolvedCustomerId,
            targetShowroomId,
            parsedPaid,
            payment_method,
            payment_reference || '',
            `Initial checkout payment for Order #${orderNumber}`,
            req.user.id
          ]
        );
      }

      // 7. Create Delivery Entry if delivery is required
      if (delivery_required) {
        const customer = db.get('SELECT phone, address FROM customers WHERE id = ?', [resolvedCustomerId]);
        const deliveryNumber = `DEL-${Date.now().toString().slice(-6)}`;
        db.run(
          `INSERT INTO deliveries (delivery_number, order_id, customer_id, showroom_id, delivery_address, customer_phone, status, cod_amount, collected_amount, notes)
           VALUES (?, ?, ?, ?, ?, ?, 'ORDERED', ?, 0.0, ?)`,
          [
            deliveryNumber,
            orderId,
            resolvedCustomerId,
            targetShowroomId,
            delivery_address || (customer ? customer.address : ''),
            customer ? customer.phone : '',
            remainingBalance, // COD amount = remaining balance
            delivery_notes || ''
          ]
        );
      }

      // 8. Update Customer Stats
      db.run(
        `UPDATE customers
         SET total_orders = total_orders + 1,
             total_spent = total_spent + ?,
             outstanding_balance = outstanding_balance + ?
         WHERE id = ?`,
        [netTotal, remainingBalance, resolvedCustomerId]
      );

      return { orderId, orderNumber, invoiceNumber, netTotal, parsedPaid, remainingBalance };
    });

    auditMiddleware(req, {
      showroomId: targetShowroomId,
      module: 'ORDERS',
      recordId: result.orderId,
      action: 'CREATE_ORDER',
      newValues: { orderNumber: result.orderNumber, netTotal: result.netTotal, paid: result.parsedPaid }
    });

    res.status(201).json({
      success: true,
      message: `Order ${result.orderNumber} created successfully.`,
      data: result
    });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

module.exports = router;
