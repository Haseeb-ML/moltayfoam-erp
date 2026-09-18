const express = require('express');
const db = require('../db');
const { authenticateToken } = require('../middleware/auth');
const { requirePermission, getEffectiveShowroomId } = require('../middleware/rbac');
const { auditMiddleware } = require('../middleware/audit');

const router = express.Router();
router.use(authenticateToken);

// GET /api/employees - Employee roster
router.get('/', requirePermission('VIEW_STAFF'), (req, res) => {
  const effectiveShowroomId = getEffectiveShowroomId(req);
  const { status, search } = req.query;

  let query = `
    SELECT e.*, s.name as showroom_name, s.code as showroom_code,
      u.username,
      (SELECT COALESCE(SUM(ea.amount), 0) FROM employee_advances ea WHERE ea.employee_id = e.id) as total_advances,
      (SELECT COALESCE(SUM(ea.amount), 0) FROM employee_advances ea WHERE ea.employee_id = e.id AND ea.is_settled = 1) as settled_advances,
      (SELECT COALESCE(SUM(ea.amount), 0) FROM employee_advances ea WHERE ea.employee_id = e.id AND ea.is_settled = 0) as outstanding_advance
    FROM employees e
    JOIN showrooms s ON e.showroom_id = s.id
    LEFT JOIN users u ON e.user_id = u.id
    WHERE 1=1
  `;

  const params = [];

  if (effectiveShowroomId) {
    query += ` AND e.showroom_id = ?`;
    params.push(effectiveShowroomId);
  }

  if (status) {
    query += ` AND e.status = ?`;
    params.push(status.toUpperCase());
  }

  if (search) {
    query += ` AND (e.full_name LIKE ? OR e.emp_code LIKE ? OR e.phone LIKE ? OR e.role_title LIKE ?)`;
    const s = `%${search.trim()}%`;
    params.push(s, s, s, s);
  }

  query += ` ORDER BY e.id ASC`;

  const employees = db.query(query, params);
  res.json({ success: true, data: employees });
});

// GET /api/employees/:id - Employee 360 profile
router.get('/:id', requirePermission('VIEW_STAFF'), (req, res) => {
  const employee = db.get(
    `SELECT e.*, s.name as showroom_name, s.code as showroom_code, u.username
     FROM employees e
     JOIN showrooms s ON e.showroom_id = s.id
     LEFT JOIN users u ON e.user_id = u.id
     WHERE e.id = ?`,
    [req.params.id]
  );

  if (!employee) {
    return res.status(404).json({ success: false, error: 'Employee not found.' });
  }

  const advances = db.query(
    `SELECT ea.*, u.full_name as given_by_name
     FROM employee_advances ea
     JOIN users u ON ea.given_by = u.id
     WHERE ea.employee_id = ?
     ORDER BY ea.id DESC`,
    [employee.id]
  );

  res.json({ success: true, data: { ...employee, advances } });
});

// POST /api/employees
router.post('/', requirePermission('MANAGE_STAFF'), (req, res) => {
  const { showroom_id, emp_code, full_name, role_title, phone, address, joining_date } = req.body;

  if (!showroom_id || !full_name || !role_title || !phone || !joining_date) {
    return res.status(400).json({
      success: false,
      error: 'Showroom, full name, role title, phone, and joining date are required.'
    });
  }

  const code = emp_code ? emp_code.trim().toUpperCase() : `EMP-${Date.now().toString().slice(-4)}`;

  try {
    const result = db.run(
      `INSERT INTO employees (showroom_id, emp_code, full_name, role_title, phone, address, joining_date, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'ACTIVE')`,
      [
        parseInt(showroom_id, 10),
        code,
        full_name.trim(),
        role_title.trim(),
        phone.trim(),
        address ? address.trim() : '',
        joining_date
      ]
    );

    auditMiddleware(req, {
      showroomId: parseInt(showroom_id, 10),
      module: 'STAFF',
      recordId: result.lastInsertRowid,
      action: 'CREATE_EMPLOYEE',
      newValues: { code, full_name, role_title, phone }
    });

    res.status(201).json({ success: true, message: 'Employee added successfully.', id: result.lastInsertRowid });
  } catch (err) {
    res.status(400).json({ success: false, error: 'Employee code already exists.' });
  }
});

// GET /api/employees/advances/all - Advance loan records
router.get('/advances/all', requirePermission('VIEW_ADVANCES'), (req, res) => {
  const effectiveShowroomId = getEffectiveShowroomId(req);
  const { employee_id, is_settled, from_date, to_date } = req.query;

  let query = `
    SELECT ea.*, e.full_name as employee_name, e.emp_code, e.role_title,
           s.name as showroom_name, s.code as showroom_code,
           u.full_name as given_by_name
    FROM employee_advances ea
    JOIN employees e ON ea.employee_id = e.id
    JOIN showrooms s ON ea.showroom_id = s.id
    JOIN users u ON ea.given_by = u.id
    WHERE 1=1
  `;

  const params = [];

  if (effectiveShowroomId) {
    query += ` AND ea.showroom_id = ?`;
    params.push(effectiveShowroomId);
  }

  if (employee_id) {
    query += ` AND ea.employee_id = ?`;
    params.push(parseInt(employee_id, 10));
  }

  if (is_settled !== undefined) {
    query += ` AND ea.is_settled = ?`;
    params.push(parseInt(is_settled, 10));
  }

  if (from_date) {
    query += ` AND ea.advance_date >= ?`;
    params.push(from_date);
  }

  if (to_date) {
    query += ` AND ea.advance_date <= ?`;
    params.push(to_date);
  }

  query += ` ORDER BY ea.id DESC`;

  const advances = db.query(query, params);
  res.json({ success: true, data: advances });
});

// POST /api/employees/advances - Issue employee advance
router.post('/advances', requirePermission('CREATE_ADVANCE'), (req, res) => {
  const { employee_id, amount, advance_date, reason, payment_method = 'CASH', notes = '' } = req.body;

  const parsedAmount = parseFloat(amount);
  if (!employee_id || isNaN(parsedAmount) || parsedAmount <= 0 || !advance_date || !reason) {
    return res.status(400).json({
      success: false,
      error: 'Employee, valid amount, advance date, and clear reason are required.'
    });
  }

  const emp = db.get('SELECT * FROM employees WHERE id = ?', [parseInt(employee_id, 10)]);
  if (!emp) {
    return res.status(404).json({ success: false, error: 'Employee not found.' });
  }

  const voucherNumber = `ADV-${Date.now().toString().slice(-6)}`;

  try {
    const result = db.run(
      `INSERT INTO employee_advances (voucher_number, employee_id, showroom_id, amount, advance_date, reason, payment_method, given_by, is_settled, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`,
      [
        voucherNumber,
        emp.id,
        emp.showroom_id,
        parsedAmount,
        advance_date,
        reason.trim(),
        payment_method.toUpperCase(),
        req.user.id,
        notes || ''
      ]
    );

    auditMiddleware(req, {
      showroomId: emp.showroom_id,
      module: 'STAFF_ADVANCES',
      recordId: result.lastInsertRowid,
      action: 'ISSUE_ADVANCE',
      newValues: { voucherNumber, employee: emp.full_name, amount: parsedAmount, reason }
    });

    res.status(201).json({
      success: true,
      message: `Advance voucher ${voucherNumber} issued to ${emp.full_name} for amount ${parsedAmount}.`,
      id: result.lastInsertRowid
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// PATCH /api/employees/advances/:id/settle
router.patch('/advances/:id/settle', requirePermission('CREATE_ADVANCE'), (req, res) => {
  const advance = db.get('SELECT * FROM employee_advances WHERE id = ?', [req.params.id]);
  if (!advance) {
    return res.status(404).json({ success: false, error: 'Advance voucher not found.' });
  }

  db.run('UPDATE employee_advances SET is_settled = 1 WHERE id = ?', [advance.id]);

  auditMiddleware(req, {
    showroomId: advance.showroom_id,
    module: 'STAFF_ADVANCES',
    recordId: advance.id,
    action: 'SETTLE_ADVANCE',
    reason: 'Settled against payroll'
  });

  res.json({ success: true, message: 'Advance marked as settled.' });
});

module.exports = router;
