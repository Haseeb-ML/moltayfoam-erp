const express = require('express');
const cors = require('cors');
const path = require('node:path');

// Initialize database schema
require('./db');

const app = express();
const PORT = process.env.PORT || 4000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static frontend assets
app.use(express.static(path.join(__dirname, 'public')));

// API Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/showrooms', require('./routes/showrooms'));
app.use('/api/products', require('./routes/products'));
app.use('/api/challans', require('./routes/challans'));
app.use('/api/inventory', require('./routes/inventory'));
app.use('/api/customers', require('./routes/customers'));
app.use('/api/orders', require('./routes/orders'));
app.use('/api/custom-orders', require('./routes/customOrders'));
app.use('/api/payments', require('./routes/payments'));
app.use('/api/deliveries', require('./routes/deliveries'));
app.use('/api/employees', require('./routes/employees'));
app.use('/api/expenses', require('./routes/expenses'));
app.use('/api/dashboard', require('./routes/dashboard'));
app.use('/api/reports', require('./routes/reports'));
app.use('/api/audit-logs', require('./routes/auditLogs'));
app.use('/api/settings', require('./routes/settings'));

// Single Page Application Fallback
app.get('*', (req, res) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ success: false, error: 'API endpoint not found.' });
  }
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Centralized error handling middleware
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({
    success: false,
    error: 'Internal server error. Please contact administrator.'
  });
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`====================================================`);
    console.log(`🚀 Retail Dealership ERP Web Application Live`);
    console.log(`📡 URL: http://localhost:${PORT}`);
    console.log(`🏢 Multi-Showroom Architecture (2 Showrooms + Combined)`);
    console.log(`🔒 Dynamic RBAC & Immutability Active`);
    console.log(`📱 Mobile Challan Entry Ready`);
    console.log(`💼 Cashier Make-To-Order Engine Ready`);
    console.log(`====================================================`);
  });
}

module.exports = app;
