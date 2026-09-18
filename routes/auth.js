const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');
const { generateToken, authenticateToken } = require('../middleware/auth');
const { auditMiddleware } = require('../middleware/audit');

const router = express.Router();

// POST /api/auth/login
router.post('/login', (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ success: false, error: 'Username and password are required.' });
  }

  const user = db.get(
    `SELECT u.id, u.username, u.password_hash, u.full_name, u.email, u.phone, u.role_id, u.showroom_id, u.is_active,
            r.name as role_name, s.name as showroom_name, s.code as showroom_code
     FROM users u
     JOIN roles r ON u.role_id = r.id
     LEFT JOIN showrooms s ON u.showroom_id = s.id
     WHERE u.username = ? COLLATE NOCASE`,
    [username.trim()]
  );

  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ success: false, error: 'Invalid username or password.' });
  }

  if (!user.is_active) {
    return res.status(403).json({ success: false, error: 'Your account has been deactivated. Please contact admin.' });
  }

  // Load user permissions
  const perms = db.query(
    `SELECT p.code FROM permissions p
     JOIN role_permissions rp ON p.id = rp.permission_id
     WHERE rp.role_id = ?`,
    [user.role_id]
  );
  const permissions = perms.map((p) => p.code);

  const token = generateToken(user.id);

  // Record audit login
  auditMiddleware(req, {
    userId: user.id,
    showroomId: user.showroom_id,
    module: 'AUTH',
    recordId: user.id,
    action: 'LOGIN',
    newValues: { username: user.username, role: user.role_name }
  });

  delete user.password_hash;
  user.permissions = permissions;

  res.json({
    success: true,
    message: 'Login successful.',
    token,
    user
  });
});

// GET /api/auth/me
router.get('/me', authenticateToken, (req, res) => {
  res.json({
    success: true,
    user: req.user
  });
});

// POST /api/auth/change-password
router.post('/change-password', authenticateToken, (req, res) => {
  const { current_password, new_password } = req.body;

  if (!current_password || !new_password || new_password.length < 6) {
    return res.status(400).json({ success: false, error: 'New password must be at least 6 characters long.' });
  }

  const user = db.get('SELECT password_hash FROM users WHERE id = ?', [req.user.id]);
  if (!bcrypt.compareSync(current_password, user.password_hash)) {
    return res.status(400).json({ success: false, error: 'Incorrect current password.' });
  }

  const salt = bcrypt.genSaltSync(10);
  const hash = bcrypt.hashSync(new_password, salt);

  db.run('UPDATE users SET password_hash = ? WHERE id = ?', [hash, req.user.id]);

  auditMiddleware(req, {
    module: 'AUTH',
    recordId: req.user.id,
    action: 'PASSWORD_CHANGE',
    reason: 'User changed account password'
  });

  res.json({ success: true, message: 'Password updated successfully.' });
});

module.exports = router;
