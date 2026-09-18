const jwt = require('jsonwebtoken');
const db = require('../db');

const JWT_SECRET = process.env.JWT_SECRET || 'bed-sheet-shop-erp-secret-key-2026-secure';

function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ success: false, error: 'Access token required. Please login.' });
  }

  jwt.verify(token, JWT_SECRET, (err, decoded) => {
    if (err) {
      return res.status(403).json({ success: false, error: 'Invalid or expired authentication session.' });
    }

    // Refresh user info and permissions from DB
    const user = db.get(
      `SELECT u.id, u.username, u.full_name, u.email, u.phone, u.role_id, u.showroom_id, u.is_active,
              r.name as role_name, r.is_system as role_is_system,
              s.name as showroom_name, s.code as showroom_code
       FROM users u
       JOIN roles r ON u.role_id = r.id
       LEFT JOIN showrooms s ON u.showroom_id = s.id
       WHERE u.id = ?`,
      [decoded.userId]
    );

    if (!user || !user.is_active) {
      return res.status(403).json({ success: false, error: 'User account is deactivated or no longer exists.' });
    }

    // Load user's permissions
    const perms = db.query(
      `SELECT p.code FROM permissions p
       JOIN role_permissions rp ON p.id = rp.permission_id
       WHERE rp.role_id = ?`,
      [user.role_id]
    );

    user.permissions = perms.map((p) => p.code);
    req.user = user;
    next();
  });
}

function generateToken(userId) {
  return jwt.sign({ userId }, JWT_SECRET, { expiresIn: '24h' });
}

module.exports = {
  authenticateToken,
  generateToken,
  JWT_SECRET
};
