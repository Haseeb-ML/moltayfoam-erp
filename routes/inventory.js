const express = require('express');
const db = require('../db');
const { authenticateToken } = require('../middleware/auth');
const { requirePermission, getEffectiveShowroomId } = require('../middleware/rbac');
const { auditMiddleware } = require('../middleware/audit');

const router = express.Router();
router.use(authenticateToken);

// GET /api/inventory - Stock matrix
router.get('/', requirePermission('VIEW_INVENTORY'), (req, res) => {
  const effectiveShowroomId = getEffectiveShowroomId(req);
  const { low_stock, search, category_id } = req.query;

  let query = `
    SELECT i.id as inventory_id, i.showroom_id, i.product_id, i.variant_id, i.quantity, i.updated_at,
           s.name as showroom_name, s.code as showroom_code,
           p.sku as product_sku, p.name as product_name, p.unit, p.selling_price, p.purchase_cost,
           p.min_stock_alert, c.name as category_name,
           pv.variant_name, pv.sku as variant_sku
    FROM inventory i
    JOIN showrooms s ON i.showroom_id = s.id
    JOIN products p ON i.product_id = p.id
    LEFT JOIN categories c ON p.category_id = c.id
    LEFT JOIN product_variants pv ON i.variant_id = pv.id
    WHERE 1=1
  `;

  const params = [];

  if (effectiveShowroomId) {
    query += ` AND i.showroom_id = ?`;
    params.push(effectiveShowroomId);
  }

  if (low_stock === 'true' || low_stock === '1') {
    query += ` AND i.quantity <= p.min_stock_alert`;
  }

  if (category_id) {
    query += ` AND p.category_id = ?`;
    params.push(parseInt(category_id, 10));
  }

  if (search) {
    query += ` AND (p.name LIKE ? OR p.sku LIKE ? OR pv.variant_name LIKE ?)`;
    const s = `%${search.trim()}%`;
    params.push(s, s, s);
  }

  query += ` ORDER BY s.id ASC, p.name ASC, pv.variant_name ASC`;

  const inventory = db.query(query, params);
  res.json({ success: true, data: inventory });
});

// GET /api/inventory/movements - Auditable movement history
router.get('/movements', requirePermission('VIEW_INVENTORY'), (req, res) => {
  const effectiveShowroomId = getEffectiveShowroomId(req);
  const { product_id, movement_type, from_date, to_date, limit = 50 } = req.query;

  let query = `
    SELECT im.*, s.name as showroom_name, s.code as showroom_code,
           p.name as product_name, p.sku as product_sku,
           pv.variant_name, pv.sku as variant_sku,
           u.full_name as created_by_name
    FROM inventory_movements im
    JOIN showrooms s ON im.showroom_id = s.id
    JOIN products p ON im.product_id = p.id
    LEFT JOIN product_variants pv ON im.variant_id = pv.id
    JOIN users u ON im.created_by = u.id
    WHERE 1=1
  `;

  const params = [];

  if (effectiveShowroomId) {
    query += ` AND im.showroom_id = ?`;
    params.push(effectiveShowroomId);
  }

  if (product_id) {
    query += ` AND im.product_id = ?`;
    params.push(parseInt(product_id, 10));
  }

  if (movement_type) {
    query += ` AND im.movement_type = ?`;
    params.push(movement_type.toUpperCase());
  }

  if (from_date) {
    query += ` AND im.created_at >= ?`;
    params.push(from_date);
  }

  if (to_date) {
    query += ` AND im.created_at <= ?`;
    params.push(to_date);
  }

  query += ` ORDER BY im.id DESC LIMIT ?`;
  params.push(parseInt(limit, 10) || 50);

  const movements = db.query(query, params);
  res.json({ success: true, data: movements });
});

// POST /api/inventory/adjust - Controlled stock adjustment with audit trail
router.post('/adjust', requirePermission('ADJUST_INVENTORY'), (req, res) => {
  const { showroom_id, product_id, variant_id, new_quantity, reason } = req.body;

  if (!showroom_id || !product_id || new_quantity === undefined || !reason) {
    return res.status(400).json({
      success: false,
      error: 'Showroom, product, new quantity, and adjustment reason are required.'
    });
  }

  const shId = parseInt(showroom_id, 10);
  const prdId = parseInt(product_id, 10);
  const varId = variant_id ? parseInt(variant_id, 10) : null;
  const targetQty = parseInt(new_quantity, 10);

  if (targetQty < 0) {
    return res.status(400).json({ success: false, error: 'Negative stock is not permitted.' });
  }

  try {
    db.transaction(() => {
      let current;
      if (varId) {
        current = db.get(
          'SELECT * FROM inventory WHERE showroom_id = ? AND product_id = ? AND variant_id = ?',
          [shId, prdId, varId]
        );
      } else {
        current = db.get(
          'SELECT * FROM inventory WHERE showroom_id = ? AND product_id = ? AND variant_id IS NULL',
          [shId, prdId]
        );
      }

      const oldQty = current ? current.quantity : 0;
      const delta = targetQty - oldQty;

      if (delta === 0) {
        throw new Error('New quantity is the same as existing stock.');
      }

      if (current) {
        if (varId) {
          db.run(
            'UPDATE inventory SET quantity = ?, updated_at = CURRENT_TIMESTAMP WHERE showroom_id = ? AND product_id = ? AND variant_id = ?',
            [targetQty, shId, prdId, varId]
          );
        } else {
          db.run(
            'UPDATE inventory SET quantity = ?, updated_at = CURRENT_TIMESTAMP WHERE showroom_id = ? AND product_id = ? AND variant_id IS NULL',
            [targetQty, shId, prdId]
          );
        }
      } else {
        db.run(
          'INSERT INTO inventory (showroom_id, product_id, variant_id, quantity) VALUES (?, ?, ?, ?)',
          [shId, prdId, varId, targetQty]
        );
      }

      // Record movement
      db.run(
        `INSERT INTO inventory_movements (showroom_id, product_id, variant_id, movement_type, quantity, balance_after, reference_id, notes, created_by)
         VALUES (?, ?, ?, 'ADJUSTMENT', ?, ?, 'MANUAL-ADJ', ?, ?)`,
        [shId, prdId, varId, delta, targetQty, reason.trim(), req.user.id]
      );
    });

    auditMiddleware(req, {
      showroomId: shId,
      module: 'INVENTORY',
      recordId: `${shId}-${prdId}-${varId || 0}`,
      action: 'STOCK_ADJUSTMENT',
      reason: reason.trim()
    });

    res.json({ success: true, message: 'Stock adjusted successfully.' });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// POST /api/inventory/transfer - Transfer between showrooms
router.post('/transfer', requirePermission('TRANSFER_INVENTORY'), (req, res) => {
  const { from_showroom_id, to_showroom_id, product_id, variant_id, quantity, notes } = req.body;

  const fromShId = parseInt(from_showroom_id, 10);
  const toShId = parseInt(to_showroom_id, 10);
  const prdId = parseInt(product_id, 10);
  const varId = variant_id ? parseInt(variant_id, 10) : null;
  const transferQty = parseInt(quantity, 10);

  if (!fromShId || !toShId || !prdId || !transferQty || transferQty <= 0) {
    return res.status(400).json({ success: false, error: 'Valid source, destination, product and positive quantity required.' });
  }

  if (fromShId === toShId) {
    return res.status(400).json({ success: false, error: 'Source and destination showroom must be different.' });
  }

  try {
    db.transaction(() => {
      // 1. Check source stock
      let sourceStock;
      if (varId) {
        sourceStock = db.get('SELECT quantity FROM inventory WHERE showroom_id = ? AND product_id = ? AND variant_id = ?', [fromShId, prdId, varId]);
      } else {
        sourceStock = db.get('SELECT quantity FROM inventory WHERE showroom_id = ? AND product_id = ? AND variant_id IS NULL', [fromShId, prdId]);
      }

      if (!sourceStock || sourceStock.quantity < transferQty) {
        throw new Error(`Insufficient stock in source showroom. Current available: ${sourceStock ? sourceStock.quantity : 0}`);
      }

      const sourceNewQty = sourceStock.quantity - transferQty;
      // Deduct from source
      if (varId) {
        db.run('UPDATE inventory SET quantity = ?, updated_at = CURRENT_TIMESTAMP WHERE showroom_id = ? AND product_id = ? AND variant_id = ?', [sourceNewQty, fromShId, prdId, varId]);
      } else {
        db.run('UPDATE inventory SET quantity = ?, updated_at = CURRENT_TIMESTAMP WHERE showroom_id = ? AND product_id = ? AND variant_id IS NULL', [sourceNewQty, fromShId, prdId]);
      }

      // Add to destination
      let destStock;
      if (varId) {
        destStock = db.get('SELECT quantity FROM inventory WHERE showroom_id = ? AND product_id = ? AND variant_id = ?', [toShId, prdId, varId]);
      } else {
        destStock = db.get('SELECT quantity FROM inventory WHERE showroom_id = ? AND product_id = ? AND variant_id IS NULL', [toShId, prdId]);
      }

      const destNewQty = (destStock ? destStock.quantity : 0) + transferQty;
      if (destStock) {
        if (varId) {
          db.run('UPDATE inventory SET quantity = ?, updated_at = CURRENT_TIMESTAMP WHERE showroom_id = ? AND product_id = ? AND variant_id = ?', [destNewQty, toShId, prdId, varId]);
        } else {
          db.run('UPDATE inventory SET quantity = ?, updated_at = CURRENT_TIMESTAMP WHERE showroom_id = ? AND product_id = ? AND variant_id IS NULL', [destNewQty, toShId, prdId]);
        }
      } else {
        db.run('INSERT INTO inventory (showroom_id, product_id, variant_id, quantity) VALUES (?, ?, ?, ?)', [toShId, prdId, varId, destNewQty]);
      }

      const transferRef = `TRF-${Date.now().toString().slice(-6)}`;

      // Movements
      db.run(
        `INSERT INTO inventory_movements (showroom_id, product_id, variant_id, movement_type, quantity, balance_after, reference_id, notes, created_by)
         VALUES (?, ?, ?, 'TRANSFER_OUT', ?, ?, ?, ?, ?)`,
        [fromShId, prdId, varId, -transferQty, sourceNewQty, transferRef, `Transfer Out to Showroom #${toShId}. Notes: ${notes || ''}`, req.user.id]
      );

      db.run(
        `INSERT INTO inventory_movements (showroom_id, product_id, variant_id, movement_type, quantity, balance_after, reference_id, notes, created_by)
         VALUES (?, ?, ?, 'TRANSFER_IN', ?, ?, ?, ?, ?)`,
        [toShId, prdId, varId, transferQty, destNewQty, transferRef, `Transfer In from Showroom #${fromShId}. Notes: ${notes || ''}`, req.user.id]
      );
    });

    auditMiddleware(req, {
      module: 'INVENTORY',
      recordId: `${fromShId}->${toShId}`,
      action: 'STOCK_TRANSFER',
      newValues: { fromShId, toShId, product_id, quantity: transferQty }
    });

    res.json({ success: true, message: `Successfully transferred ${transferQty} units between showrooms.` });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

module.exports = router;
