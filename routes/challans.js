const express = require('express');
const db = require('../db');
const { authenticateToken } = require('../middleware/auth');
const { requirePermission, getEffectiveShowroomId } = require('../middleware/rbac');
const { auditMiddleware } = require('../middleware/audit');

const router = express.Router();
router.use(authenticateToken);

// GET /api/challans/suppliers/all
router.get('/suppliers/all', (req, res) => {
  const suppliers = db.query('SELECT * FROM suppliers WHERE is_active = 1 ORDER BY name ASC');
  res.json({ success: true, data: suppliers });
});

// POST /api/challans/suppliers
router.post('/suppliers', requirePermission('CREATE_CHALLAN'), (req, res) => {
  const { name, contact_person, phone, address } = req.body;
  if (!name || !phone) {
    return res.status(400).json({ success: false, error: 'Supplier name and phone are required.' });
  }

  try {
    const result = db.run(
      'INSERT INTO suppliers (name, contact_person, phone, address, is_active) VALUES (?, ?, ?, ?, 1)',
      [name.trim(), contact_person || '', phone.trim(), address || '']
    );
    res.status(201).json({ success: true, id: result.lastInsertRowid, message: 'Supplier registered successfully.' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/challans
router.get('/', requirePermission('VIEW_CHALLANS'), (req, res) => {
  const showroomId = getEffectiveShowroomId(req);
  const { supplier_id, from_date, to_date, search } = req.query;

  let query = `
    SELECT c.*, s.name as supplier_name, s.phone as supplier_phone,
           sh.name as showroom_name, sh.code as showroom_code,
           u.full_name as received_by_name
    FROM challans c
    JOIN suppliers s ON c.supplier_id = s.id
    JOIN showrooms sh ON c.showroom_id = sh.id
    JOIN users u ON c.created_by = u.id
    WHERE 1=1
  `;

  const params = [];

  if (showroomId) {
    query += ` AND c.showroom_id = ?`;
    params.push(showroomId);
  }

  if (supplier_id) {
    query += ` AND c.supplier_id = ?`;
    params.push(parseInt(supplier_id, 10));
  }

  if (from_date) {
    query += ` AND c.challan_date >= ?`;
    params.push(from_date);
  }

  if (to_date) {
    query += ` AND c.challan_date <= ?`;
    params.push(to_date);
  }

  if (search) {
    query += ` AND (c.challan_number LIKE ? OR s.name LIKE ?)`;
    const s = `%${search.trim()}%`;
    params.push(s, s);
  }

  query += ` ORDER BY c.id DESC`;

  const challans = db.query(query, params);
  res.json({ success: true, data: challans });
});

// GET /api/challans/:id
router.get('/:id', requirePermission('VIEW_CHALLANS'), (req, res) => {
  const challan = db.get(
    `SELECT c.*, s.name as supplier_name, s.phone as supplier_phone, s.address as supplier_address,
            sh.name as showroom_name, sh.code as showroom_code,
            u.full_name as received_by_name
     FROM challans c
     JOIN suppliers s ON c.supplier_id = s.id
     JOIN showrooms sh ON c.showroom_id = sh.id
     JOIN users u ON c.created_by = u.id
     WHERE c.id = ?`,
    [req.params.id]
  );

  if (!challan) {
    return res.status(404).json({ success: false, error: 'Challan not found.' });
  }

  const items = db.query(
    `SELECT ci.*, p.name as product_name, p.sku as product_sku, p.unit,
            pv.variant_name, pv.sku as variant_sku
     FROM challan_items ci
     JOIN products p ON ci.product_id = p.id
     LEFT JOIN product_variants pv ON ci.variant_id = pv.id
     WHERE ci.challan_id = ?`,
    [challan.id]
  );

  res.json({ success: true, data: { ...challan, items } });
});

// POST /api/challans - Atomic receiving transaction (Mobile & Desktop friendly)
router.post('/', requirePermission('CREATE_CHALLAN'), (req, res) => {
  const {
    challan_number,
    supplier_id,
    showroom_id,
    challan_date,
    notes,
    items // array of { product_id, variant_id, quantity, unit_cost }
  } = req.body;

  if (!challan_number || !supplier_id || !showroom_id || !challan_date || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({
      success: false,
      error: 'Challan number, supplier, showroom, date, and at least one item are required.'
    });
  }

  // Validate items
  let totalItems = 0;
  let totalCost = 0;

  for (const itm of items) {
    const qty = parseInt(itm.quantity, 10);
    const cost = parseFloat(itm.unit_cost) || 0;
    if (!itm.product_id || isNaN(qty) || qty <= 0) {
      return res.status(400).json({ success: false, error: 'Every item must have a valid product and quantity greater than 0.' });
    }
    totalItems += qty;
    totalCost += qty * cost;
  }

  try {
    const challanId = db.transaction(() => {
      // 1. Insert Challan
      const chResult = db.run(
        `INSERT INTO challans (challan_number, supplier_id, showroom_id, challan_date, total_items, total_cost, notes, status, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'RECEIVED', ?)`,
        [
          challan_number.trim().toUpperCase(),
          parseInt(supplier_id, 10),
          parseInt(showroom_id, 10),
          challan_date,
          totalItems,
          totalCost,
          notes || '',
          req.user.id
        ]
      );

      const newChallanId = chResult.lastInsertRowid;

      // 2. Process Items and update Inventory
      for (const itm of items) {
        const qty = parseInt(itm.quantity, 10);
        const unitCost = parseFloat(itm.unit_cost) || 0;
        const lineTotal = qty * unitCost;
        const variantId = itm.variant_id ? parseInt(itm.variant_id, 10) : null;
        const productId = parseInt(itm.product_id, 10);
        const shId = parseInt(showroom_id, 10);

        // Insert challan item
        db.run(
          `INSERT INTO challan_items (challan_id, product_id, variant_id, quantity, unit_cost, total_cost)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [newChallanId, productId, variantId, qty, unitCost, lineTotal]
        );

        // Fetch current stock
        let currentStockRecord;
        if (variantId) {
          currentStockRecord = db.get(
            'SELECT quantity FROM inventory WHERE showroom_id = ? AND product_id = ? AND variant_id = ?',
            [shId, productId, variantId]
          );
        } else {
          currentStockRecord = db.get(
            'SELECT quantity FROM inventory WHERE showroom_id = ? AND product_id = ? AND variant_id IS NULL',
            [shId, productId]
          );
        }

        const existingQty = currentStockRecord ? currentStockRecord.quantity : 0;
        const newQty = existingQty + qty;

        if (currentStockRecord) {
          if (variantId) {
            db.run(
              'UPDATE inventory SET quantity = ?, updated_at = CURRENT_TIMESTAMP WHERE showroom_id = ? AND product_id = ? AND variant_id = ?',
              [newQty, shId, productId, variantId]
            );
          } else {
            db.run(
              'UPDATE inventory SET quantity = ?, updated_at = CURRENT_TIMESTAMP WHERE showroom_id = ? AND product_id = ? AND variant_id IS NULL',
              [newQty, shId, productId]
            );
          }
        } else {
          db.run(
            'INSERT INTO inventory (showroom_id, product_id, variant_id, quantity) VALUES (?, ?, ?, ?)',
            [shId, productId, variantId, newQty]
          );
        }

        // 3. Create Immutable Stock Movement
        db.run(
          `INSERT INTO inventory_movements (showroom_id, product_id, variant_id, movement_type, quantity, balance_after, reference_id, notes, created_by)
           VALUES (?, ?, ?, 'RECEIVING', ?, ?, ?, ?, ?)`,
          [
            shId,
            productId,
            variantId,
            qty,
            newQty,
            challan_number.trim().toUpperCase(),
            `Factory Challan Receiving (#${challan_number})`,
            req.user.id
          ]
        );
      }

      return newChallanId;
    });

    auditMiddleware(req, {
      showroomId: parseInt(showroom_id, 10),
      module: 'CHALLANS',
      recordId: challanId,
      action: 'RECEIVE_CHALLAN',
      newValues: { challan_number, supplier_id, totalItems, totalCost }
    });

    res.status(201).json({
      success: true,
      message: `Challan ${challan_number} recorded successfully and stock updated.`,
      id: challanId
    });
  } catch (err) {
    if (err.message && err.message.includes('UNIQUE')) {
      return res.status(400).json({ success: false, error: 'A challan with this number already exists.' });
    }
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
