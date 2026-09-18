const express = require('express');
const db = require('../db');
const { authenticateToken } = require('../middleware/auth');
const { requirePermission, getEffectiveShowroomId } = require('../middleware/rbac');
const { auditMiddleware } = require('../middleware/audit');

const router = express.Router();
router.use(authenticateToken);

// GET /api/expenses/categories
router.get('/categories', (req, res) => {
  const cats = db.query('SELECT * FROM expense_categories ORDER BY name ASC');
  res.json({ success: true, data: cats });
});

// POST /api/expenses/categories
router.post('/categories', requirePermission('CREATE_EXPENSE'), (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ success: false, error: 'Category name required.' });

  try {
    const result = db.run('INSERT INTO expense_categories (name) VALUES (?)', [name.trim()]);
    res.status(201).json({ success: true, id: result.lastInsertRowid, message: 'Category created.' });
  } catch (err) {
    res.status(400).json({ success: false, error: 'Category already exists.' });
  }
});

// GET /api/expenses - List showroom expenses
router.get('/', requirePermission('VIEW_EXPENSES'), (req, res) => {
  const effectiveShowroomId = getEffectiveShowroomId(req);
  const { category_id, from_date, to_date, search } = req.query;

  let query = `
    SELECT e.*, ec.name as category_name,
           s.name as showroom_name, s.code as showroom_code,
           u.full_name as created_by_name
    FROM expenses e
    JOIN expense_categories ec ON e.category_id = ec.id
    JOIN showrooms s ON e.showroom_id = s.id
    JOIN users u ON e.created_by = u.id
    WHERE 1=1
  `;

  const params = [];

  if (effectiveShowroomId) {
    query += ` AND e.showroom_id = ?`;
    params.push(effectiveShowroomId);
  }

  if (category_id) {
    query += ` AND e.category_id = ?`;
    params.push(parseInt(category_id, 10));
  }

  if (from_date) {
    query += ` AND e.expense_date >= ?`;
    params.push(from_date);
  }

  if (to_date) {
    query += ` AND e.expense_date <= ?`;
    params.push(to_date);
  }

  if (search) {
    query += ` AND (e.voucher_number LIKE ? OR e.description LIKE ? OR e.paid_to LIKE ?)`;
    const s = `%${search.trim()}%`;
    params.push(s, s, s);
  }

  query += ` ORDER BY e.id DESC`;

  const expenses = db.query(query, params);
  res.json({ success: true, data: expenses });
});

// POST /api/expenses - Record daily operational expense
router.post('/', requirePermission('CREATE_EXPENSE'), (req, res) => {
  const { showroom_id, category_id, amount, expense_date, payment_method = 'CASH', paid_to, description } = req.body;

  const targetShowroomId = showroom_id ? parseInt(showroom_id, 10) : req.user.showroom_id;
  const parsedAmount = parseFloat(amount);

  if (!targetShowroomId || !category_id || isNaN(parsedAmount) || parsedAmount <= 0 || !expense_date || !description) {
    return res.status(400).json({
      success: false,
      error: 'Showroom, category, valid amount, date, and description are required.'
    });
  }

  const voucherNumber = `EXP-${Date.now().toString().slice(-6)}`;

  try {
    const result = db.run(
      `INSERT INTO expenses (voucher_number, showroom_id, category_id, amount, expense_date, payment_method, paid_to, description, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        voucherNumber,
        targetShowroomId,
        parseInt(category_id, 10),
        parsedAmount,
        expense_date,
        payment_method.toUpperCase(),
        paid_to ? paid_to.trim() : '',
        description.trim(),
        req.user.id
      ]
    );

    auditMiddleware(req, {
      showroomId: targetShowroomId,
      module: 'EXPENSES',
      recordId: result.lastInsertRowid,
      action: 'RECORD_EXPENSE',
      newValues: { voucherNumber, amount: parsedAmount, description }
    });

    res.status(201).json({
      success: true,
      message: `Expense voucher ${voucherNumber} recorded.`,
      id: result.lastInsertRowid
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/expenses/summary - Aggregated expenses
router.get('/summary', requirePermission('VIEW_EXPENSES'), (req, res) => {
  const effectiveShowroomId = getEffectiveShowroomId(req);
  const { from_date, to_date } = req.query;

  let filter = ' WHERE 1=1';
  const params = [];

  if (effectiveShowroomId) {
    filter += ' AND e.showroom_id = ?';
    params.push(effectiveShowroomId);
  }
  if (from_date) {
    filter += ' AND e.expense_date >= ?';
    params.push(from_date);
  }
  if (to_date) {
    filter += ' AND e.expense_date <= ?';
    params.push(to_date);
  }

  const byCategory = db.query(
    `SELECT ec.name as category_name, COALESCE(SUM(e.amount), 0) as total_amount, COUNT(e.id) as transaction_count
     FROM expense_categories ec
     LEFT JOIN expenses e ON ec.id = e.category_id ${filter.replace('WHERE 1=1', '')}
     GROUP BY ec.id
     ORDER BY total_amount DESC`,
    params
  );

  const total = db.get(
    `SELECT COALESCE(SUM(e.amount), 0) as total_expense FROM expenses e ${filter}`,
    params
  );

  res.json({ success: true, data: { total: total ? total.total_expense : 0, byCategory } });
});

module.exports = router;
