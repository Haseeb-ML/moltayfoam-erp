const express = require('express');
const db = require('../db');
const { authenticateToken } = require('../middleware/auth');
const { requirePermission, getEffectiveShowroomId } = require('../middleware/rbac');

const router = express.Router();
router.use(authenticateToken);

// Helper to convert rows to CSV format
function toCsv(rows) {
  if (!rows || rows.length === 0) return '';
  const headers = Object.keys(rows[0]);
  const csvLines = [headers.join(',')];

  for (const row of rows) {
    const values = headers.map((header) => {
      let val = row[header];
      if (val === null || val === undefined) return '""';
      val = String(val).replace(/"/g, '""');
      return `"${val}"`;
    });
    csvLines.push(values.join(','));
  }

  return csvLines.join('\r\n');
}

// GET /api/reports/:type
router.get('/:type', requirePermission('VIEW_REPORTS'), (req, res) => {
  const { type } = req.params;
  const { from_date, to_date, format } = req.query;
  const effectiveShowroomId = getEffectiveShowroomId(req);

  let rows = [];

  switch (type) {
    case 'sales': {
      let q = `
        SELECT o.order_number, o.order_date, c.name as customer_name, c.phone as customer_phone,
               s.name as showroom_name, u.full_name as salesman,
               o.subtotal, o.discount, o.net_total, o.paid_amount, o.remaining_balance,
               o.order_status, o.payment_status, o.delivery_status
        FROM orders o
        JOIN customers c ON o.customer_id = c.id
        JOIN showrooms s ON o.showroom_id = s.id
        JOIN users u ON o.salesman_id = u.id
        WHERE 1=1
      `;
      const p = [];
      if (effectiveShowroomId) { q += ' AND o.showroom_id = ?'; p.push(effectiveShowroomId); }
      if (from_date) { q += ' AND DATE(o.order_date) >= ?'; p.push(from_date); }
      if (to_date) { q += ' AND DATE(o.order_date) <= ?'; p.push(to_date); }
      q += ' ORDER BY o.id DESC';
      rows = db.query(q, p);
      break;
    }

    case 'inventory': {
      let q = `
        SELECT s.name as showroom_name, p.sku as product_sku, p.name as product_name,
               COALESCE(pv.variant_name, 'Standard') as variant,
               c.name as category, i.quantity, p.unit,
               p.purchase_cost, p.selling_price,
               (i.quantity * p.purchase_cost) as total_cost_value,
               (i.quantity * p.selling_price) as total_retail_value,
               CASE WHEN i.quantity <= p.min_stock_alert THEN 'LOW_STOCK' ELSE 'HEALTHY' END as stock_status
        FROM inventory i
        JOIN showrooms s ON i.showroom_id = s.id
        JOIN products p ON i.product_id = p.id
        LEFT JOIN categories c ON p.category_id = c.id
        LEFT JOIN product_variants pv ON i.variant_id = pv.id
        WHERE 1=1
      `;
      const p = [];
      if (effectiveShowroomId) { q += ' AND i.showroom_id = ?'; p.push(effectiveShowroomId); }
      q += ' ORDER BY s.name, p.name';
      rows = db.query(q, p);
      break;
    }

    case 'stock_movements': {
      let q = `
        SELECT im.created_at, s.name as showroom_name, p.sku, p.name as product_name,
               COALESCE(pv.variant_name, 'Standard') as variant,
               im.movement_type, im.quantity as delta_quantity, im.balance_after,
               im.reference_id, im.notes, u.full_name as performed_by
        FROM inventory_movements im
        JOIN showrooms s ON im.showroom_id = s.id
        JOIN products p ON im.product_id = p.id
        LEFT JOIN product_variants pv ON im.variant_id = pv.id
        JOIN users u ON im.created_by = u.id
        WHERE 1=1
      `;
      const p = [];
      if (effectiveShowroomId) { q += ' AND im.showroom_id = ?'; p.push(effectiveShowroomId); }
      if (from_date) { q += ' AND im.created_at >= ?'; p.push(from_date); }
      if (to_date) { q += ' AND im.created_at <= ?'; p.push(to_date); }
      q += ' ORDER BY im.id DESC';
      rows = db.query(q, p);
      break;
    }

    case 'challans': {
      let q = `
        SELECT c.challan_number, c.challan_date, c.receiving_date, sup.name as supplier_name,
               s.name as showroom_name, c.total_items, c.total_cost, c.status,
               u.full_name as received_by
        FROM challans c
        JOIN suppliers sup ON c.supplier_id = sup.id
        JOIN showrooms s ON c.showroom_id = s.id
        JOIN users u ON c.created_by = u.id
        WHERE 1=1
      `;
      const p = [];
      if (effectiveShowroomId) { q += ' AND c.showroom_id = ?'; p.push(effectiveShowroomId); }
      if (from_date) { q += ' AND c.challan_date >= ?'; p.push(from_date); }
      if (to_date) { q += ' AND c.challan_date <= ?'; p.push(to_date); }
      q += ' ORDER BY c.id DESC';
      rows = db.query(q, p);
      break;
    }

    case 'deliveries': {
      let q = `
        SELECT d.delivery_number, d.status, s.name as showroom_name,
               c.name as customer_name, d.customer_phone, d.delivery_address,
               COALESCE(e.full_name, 'Unassigned') as courier,
               d.delivery_date, d.delivery_time, d.cod_amount, d.collected_amount
        FROM deliveries d
        JOIN showrooms s ON d.showroom_id = s.id
        JOIN customers c ON d.customer_id = c.id
        LEFT JOIN employees e ON d.assigned_staff_id = e.id
        WHERE 1=1
      `;
      const p = [];
      if (effectiveShowroomId) { q += ' AND d.showroom_id = ?'; p.push(effectiveShowroomId); }
      if (from_date) { q += ' AND d.delivery_date >= ?'; p.push(from_date); }
      if (to_date) { q += ' AND d.delivery_date <= ?'; p.push(to_date); }
      q += ' ORDER BY d.id DESC';
      rows = db.query(q, p);
      break;
    }

    case 'expenses': {
      let q = `
        SELECT e.voucher_number, e.expense_date, s.name as showroom_name,
               ec.name as category, e.amount, e.payment_method, e.paid_to,
               e.description, u.full_name as recorded_by
        FROM expenses e
        JOIN showrooms s ON e.showroom_id = s.id
        JOIN expense_categories ec ON e.category_id = ec.id
        JOIN users u ON e.created_by = u.id
        WHERE 1=1
      `;
      const p = [];
      if (effectiveShowroomId) { q += ' AND e.showroom_id = ?'; p.push(effectiveShowroomId); }
      if (from_date) { q += ' AND e.expense_date >= ?'; p.push(from_date); }
      if (to_date) { q += ' AND e.expense_date <= ?'; p.push(to_date); }
      q += ' ORDER BY e.id DESC';
      rows = db.query(q, p);
      break;
    }

    case 'advances': {
      let q = `
        SELECT ea.voucher_number, ea.advance_date, s.name as showroom_name,
               e.emp_code, e.full_name as employee_name, e.role_title,
               ea.amount, ea.reason, ea.payment_method,
               CASE WHEN ea.is_settled = 1 THEN 'SETTLED' ELSE 'OUTSTANDING' END as status,
               u.full_name as issued_by
        FROM employee_advances ea
        JOIN employees e ON ea.employee_id = e.id
        JOIN showrooms s ON ea.showroom_id = s.id
        JOIN users u ON ea.given_by = u.id
        WHERE 1=1
      `;
      const p = [];
      if (effectiveShowroomId) { q += ' AND ea.showroom_id = ?'; p.push(effectiveShowroomId); }
      if (from_date) { q += ' AND ea.advance_date >= ?'; p.push(from_date); }
      if (to_date) { q += ' AND ea.advance_date <= ?'; p.push(to_date); }
      q += ' ORDER BY ea.id DESC';
      rows = db.query(q, p);
      break;
    }

    case 'custom_orders': {
      let q = `
        SELECT co.custom_order_number, co.created_at, s.name as showroom_name,
               c.name as customer_name, c.phone as customer_phone,
               co.item_description, co.size_specification, co.quantity,
               co.manufacturing_cost, co.selling_price, co.total_cost, co.total_sale,
               co.gross_profit, co.profit_margin_pct, co.paid_amount, co.remaining_balance,
               co.status
        FROM custom_orders co
        JOIN showrooms s ON co.showroom_id = s.id
        JOIN customers c ON co.customer_id = c.id
        WHERE 1=1
      `;
      const p = [];
      if (effectiveShowroomId) { q += ' AND co.showroom_id = ?'; p.push(effectiveShowroomId); }
      if (from_date) { q += ' AND DATE(co.created_at) >= ?'; p.push(from_date); }
      if (to_date) { q += ' AND DATE(co.created_at) <= ?'; p.push(to_date); }
      q += ' ORDER BY co.id DESC';
      rows = db.query(q, p);
      break;
    }

    default:
      return res.status(400).json({ success: false, error: `Unknown report type: ${type}` });
  }

  if (format === 'csv') {
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="erp-report-${type}-${Date.now()}.csv"`);
    return res.send(toCsv(rows));
  }

  res.json({ success: true, data: rows });
});

module.exports = router;
