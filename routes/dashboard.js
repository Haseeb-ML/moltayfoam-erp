const express = require('express');
const db = require('../db');
const { authenticateToken } = require('../middleware/auth');
const { requirePermission, getEffectiveShowroomId } = require('../middleware/rbac');

const router = express.Router();
router.use(authenticateToken);

// GET /api/dashboard/stats - High performance aggregated metrics
router.get('/stats', requirePermission('VIEW_DASHBOARD'), (req, res) => {
  const effectiveShowroomId = getEffectiveShowroomId(req);
  const { period = 'today' } = req.query;

  // Date filtering logic
  let dateConditionOrders = '';
  let dateConditionExpenses = '';

  const todayStr = new Date().toISOString().split('T')[0];

  if (period === 'today') {
    dateConditionOrders = ` AND DATE(o.order_date) = '${todayStr}'`;
    dateConditionExpenses = ` AND e.expense_date = '${todayStr}'`;
  } else if (period === 'this_month') {
    const monthPrefix = todayStr.substring(0, 7);
    dateConditionOrders = ` AND strftime('%Y-%m', o.order_date) = '${monthPrefix}'`;
    dateConditionExpenses = ` AND strftime('%Y-%m', e.expense_date) = '${monthPrefix}'`;
  }

  const shOrderFilter = effectiveShowroomId ? ` AND o.showroom_id = ${effectiveShowroomId}` : '';
  const shInvFilter = effectiveShowroomId ? ` AND i.showroom_id = ${effectiveShowroomId}` : '';
  const shExpFilter = effectiveShowroomId ? ` AND e.showroom_id = ${effectiveShowroomId}` : '';
  const shDelFilter = effectiveShowroomId ? ` AND d.showroom_id = ${effectiveShowroomId}` : '';
  const shCustFilter = effectiveShowroomId ? ` AND co.showroom_id = ${effectiveShowroomId}` : '';

  // 1. Sales & Orders
  const salesStats = db.get(`
    SELECT 
      COALESCE(SUM(o.net_total), 0) as total_sales,
      COALESCE(SUM(o.paid_amount), 0) as total_collected,
      COALESCE(SUM(o.remaining_balance), 0) as total_receivable_orders,
      COUNT(o.id) as total_order_count
    FROM orders o
    WHERE 1=1 ${shOrderFilter} ${dateConditionOrders}
  `);

  // 2. Deliveries
  const deliveryStats = db.get(`
    SELECT
      COUNT(CASE WHEN d.status = 'DELIVERED' THEN 1 END) as delivered_count,
      COUNT(CASE WHEN d.status IN ('ORDERED', 'CONFIRMED', 'PREPARING', 'READY', 'ASSIGNED', 'OUT_FOR_DELIVERY') THEN 1 END) as pending_delivery_count,
      COUNT(CASE WHEN d.status = 'OUT_FOR_DELIVERY' THEN 1 END) as out_for_delivery_count,
      COALESCE(SUM(CASE WHEN d.status != 'DELIVERED' THEN d.cod_amount ELSE 0 END), 0) as cod_pending_amount
    FROM deliveries d
    WHERE 1=1 ${shDelFilter}
  `);

  // 3. Inventory Valuation & Low Stock Alerts
  const inventoryStats = db.get(`
    SELECT
      COALESCE(SUM(i.quantity), 0) as total_units_in_stock,
      COALESCE(SUM(i.quantity * p.purchase_cost), 0) as total_inventory_cost_value,
      COALESCE(SUM(i.quantity * p.selling_price), 0) as total_inventory_retail_value,
      COUNT(DISTINCT CASE WHEN i.quantity <= p.min_stock_alert THEN p.id END) as low_stock_product_count
    FROM inventory i
    JOIN products p ON i.product_id = p.id
    WHERE 1=1 ${shInvFilter}
  `);

  // 4. Expenses & Staff Advances
  const expenseStats = db.get(`
    SELECT COALESCE(SUM(e.amount), 0) as total_expenses
    FROM expenses e
    WHERE 1=1 ${shExpFilter} ${dateConditionExpenses}
  `);

  const advanceStats = db.get(`
    SELECT COALESCE(SUM(ea.amount), 0) as total_advances_outstanding
    FROM employee_advances ea
    WHERE ea.is_settled = 0
    ${effectiveShowroomId ? ` AND ea.showroom_id = ${effectiveShowroomId}` : ''}
  `);

  // 5. Total Customer Receivables across system
  const customerReceivables = db.get(`
    SELECT COALESCE(SUM(c.outstanding_balance), 0) as total_customer_receivables
    FROM customers c
  `);

  // 6. Make-to-Order Profitability
  const customOrderStats = db.get(`
    SELECT
      COUNT(co.id) as total_custom_orders,
      COALESCE(SUM(co.total_sale), 0) as total_custom_sales,
      COALESCE(SUM(co.total_cost), 0) as total_custom_cost,
      COALESCE(SUM(co.gross_profit), 0) as total_custom_profit
    FROM custom_orders co
    WHERE 1=1 ${shCustFilter}
  `);

  // 7. Showroom Comparison (If user has multi-showroom visibility)
  const showroomComparison = db.query(`
    SELECT s.id, s.name, s.code,
      COALESCE((SELECT SUM(o.net_total) FROM orders o WHERE o.showroom_id = s.id), 0) as total_sales,
      COALESCE((SELECT SUM(i.quantity) FROM inventory i WHERE i.showroom_id = s.id), 0) as total_stock,
      COALESCE((SELECT SUM(e.amount) FROM expenses e WHERE e.showroom_id = s.id), 0) as total_expenses
    FROM showrooms s
    WHERE s.is_active = 1
    ORDER BY s.id ASC
  `);

  // 8. Payment Method Distribution
  const paymentDistribution = db.query(`
    SELECT p.payment_method, COALESCE(SUM(p.amount), 0) as total_amount, COUNT(p.id) as count
    FROM payments p
    WHERE 1=1 ${effectiveShowroomId ? ` AND p.showroom_id = ${effectiveShowroomId}` : ''}
    GROUP BY p.payment_method
  `);

  // 9. Recent Transactions
  const recentOrders = db.query(`
    SELECT o.id, o.order_number, o.net_total, o.paid_amount, o.remaining_balance, o.order_status, o.payment_status,
           c.name as customer_name, s.code as showroom_code, o.order_date
    FROM orders o
    JOIN customers c ON o.customer_id = c.id
    JOIN showrooms s ON o.showroom_id = s.id
    WHERE 1=1 ${shOrderFilter}
    ORDER BY o.id DESC LIMIT 8
  `);

  res.json({
    success: true,
    data: {
      sales: salesStats,
      deliveries: deliveryStats,
      inventory: inventoryStats,
      expenses: expenseStats.total_expenses,
      advances: advanceStats.total_advances_outstanding,
      receivables: customerReceivables.total_customer_receivables,
      customOrders: customOrderStats,
      showroomComparison,
      paymentDistribution,
      recentOrders
    }
  });
});

module.exports = router;
