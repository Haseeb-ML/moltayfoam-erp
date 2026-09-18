const express = require('express');
const db = require('../db');
const { authenticateToken } = require('../middleware/auth');
const { requirePermission, getEffectiveShowroomId } = require('../middleware/rbac');
const { auditMiddleware } = require('../middleware/audit');

const router = express.Router();
router.use(authenticateToken);

// GET /api/products/categories/all
router.get('/categories/all', (req, res) => {
  const cats = db.query('SELECT * FROM categories ORDER BY name ASC');
  res.json({ success: true, data: cats });
});

// POST /api/products/categories
router.post('/categories', requirePermission('MANAGE_PRODUCTS'), (req, res) => {
  const { name, description } = req.body;
  if (!name) {
    return res.status(400).json({ success: false, error: 'Category name is required.' });
  }

  try {
    const result = db.run('INSERT INTO categories (name, description) VALUES (?, ?)', [name.trim(), description || '']);
    res.status(201).json({ success: true, id: result.lastInsertRowid, message: 'Category created.' });
  } catch (err) {
    res.status(400).json({ success: false, error: 'Category name already exists.' });
  }
});

// GET /api/products
router.get('/', requirePermission('VIEW_PRODUCTS'), (req, res) => {
  const showroomId = getEffectiveShowroomId(req);
  const { search, category_id, is_active } = req.query;

  let query = `
    SELECT p.*, c.name as category_name,
      (SELECT COUNT(*) FROM product_variants pv WHERE pv.product_id = p.id AND pv.is_active = 1) as variant_count,
      (
        SELECT COALESCE(SUM(i.quantity), 0)
        FROM inventory i
        WHERE i.product_id = p.id
        ${showroomId ? 'AND i.showroom_id = ' + parseInt(showroomId, 10) : ''}
      ) as current_stock
    FROM products p
    LEFT JOIN categories c ON p.category_id = c.id
    WHERE 1=1
  `;

  const params = [];

  if (search) {
    query += ` AND (p.name LIKE ? OR p.sku LIKE ? OR p.brand LIKE ?)`;
    const s = `%${search.trim()}%`;
    params.push(s, s, s);
  }

  if (category_id) {
    query += ` AND p.category_id = ?`;
    params.push(parseInt(category_id, 10));
  }

  if (is_active !== undefined) {
    query += ` AND p.is_active = ?`;
    params.push(parseInt(is_active, 10));
  }

  query += ` ORDER BY p.id DESC`;

  const products = db.query(query, params);

  // Attach variants
  const allVariants = db.query('SELECT * FROM product_variants WHERE is_active = 1');
  const variantMap = {};
  for (const v of allVariants) {
    if (!variantMap[v.product_id]) variantMap[v.product_id] = [];
    variantMap[v.product_id].push(v);
  }

  const result = products.map((p) => ({
    ...p,
    variants: variantMap[p.id] || []
  }));

  res.json({ success: true, data: result });
});

// GET /api/products/:id
router.get('/:id', requirePermission('VIEW_PRODUCTS'), (req, res) => {
  const product = db.get(
    `SELECT p.*, c.name as category_name
     FROM products p
     LEFT JOIN categories c ON p.category_id = c.id
     WHERE p.id = ?`,
    [req.params.id]
  );

  if (!product) {
    return res.status(404).json({ success: false, error: 'Product not found.' });
  }

  const variants = db.query('SELECT * FROM product_variants WHERE product_id = ? AND is_active = 1', [product.id]);

  // Stock per showroom
  const stockByShowroom = db.query(
    `SELECT s.id as showroom_id, s.name as showroom_name, s.code as showroom_code,
            COALESCE(SUM(i.quantity), 0) as total_quantity
     FROM showrooms s
     LEFT JOIN inventory i ON s.id = i.showroom_id AND i.product_id = ?
     GROUP BY s.id`,
    [product.id]
  );

  // Variant stock
  const variantStock = db.query(
    `SELECT i.showroom_id, s.name as showroom_name, i.variant_id, pv.variant_name, i.quantity
     FROM inventory i
     JOIN showrooms s ON i.showroom_id = s.id
     JOIN product_variants pv ON i.variant_id = pv.id
     WHERE i.product_id = ?`,
    [product.id]
  );

  res.json({
    success: true,
    data: {
      ...product,
      variants,
      stockByShowroom,
      variantStock
    }
  });
});

// POST /api/products
router.post('/', requirePermission('MANAGE_PRODUCTS'), (req, res) => {
  const { sku, name, category_id, brand, unit, purchase_cost, selling_price, min_stock_alert, description, variants } = req.body;

  if (!name || purchase_cost === undefined || selling_price === undefined) {
    return res.status(400).json({ success: false, error: 'Name, purchase cost, and selling price are required.' });
  }

  const generatedSku = sku ? sku.trim().toUpperCase() : `PRD-${Date.now().toString().slice(-6)}`;

  try {
    const result = db.transaction(() => {
      const prodResult = db.run(
        `INSERT INTO products (sku, name, category_id, brand, unit, purchase_cost, selling_price, min_stock_alert, is_active, description)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`,
        [
          generatedSku,
          name.trim(),
          category_id || null,
          brand || '',
          unit || 'PCS',
          parseFloat(purchase_cost) || 0,
          parseFloat(selling_price) || 0,
          parseInt(min_stock_alert, 10) || 5,
          description || ''
        ]
      );

      const productId = prodResult.lastInsertRowid;

      // Add variants if provided
      if (Array.isArray(variants) && variants.length > 0) {
        for (let i = 0; i < variants.length; i++) {
          const v = variants[i];
          const vSku = v.sku ? v.sku.trim().toUpperCase() : `${generatedSku}-V${i + 1}`;
          db.run(
            `INSERT INTO product_variants (product_id, variant_name, sku, purchase_cost, selling_price, is_active)
             VALUES (?, ?, ?, ?, ?, 1)`,
            [
              productId,
              v.variant_name.trim(),
              vSku,
              v.purchase_cost !== undefined ? parseFloat(v.purchase_cost) : parseFloat(purchase_cost),
              v.selling_price !== undefined ? parseFloat(v.selling_price) : parseFloat(selling_price)
            ]
          );
        }
      }

      return productId;
    });

    auditMiddleware(req, {
      module: 'PRODUCTS',
      recordId: result,
      action: 'CREATE',
      newValues: { sku: generatedSku, name, selling_price }
    });

    res.status(201).json({ success: true, message: 'Product created successfully.', id: result, sku: generatedSku });
  } catch (err) {
    if (err.message && err.message.includes('UNIQUE')) {
      return res.status(400).json({ success: false, error: 'A product with this SKU already exists.' });
    }
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/products/:id/variants
router.post('/:id/variants', requirePermission('MANAGE_PRODUCTS'), (req, res) => {
  const { variant_name, sku, purchase_cost, selling_price } = req.body;
  const productId = req.params.id;

  const product = db.get('SELECT * FROM products WHERE id = ?', [productId]);
  if (!product) {
    return res.status(404).json({ success: false, error: 'Product not found.' });
  }

  if (!variant_name) {
    return res.status(400).json({ success: false, error: 'Variant name (e.g. Size: Large) is required.' });
  }

  const vSku = sku ? sku.trim().toUpperCase() : `${product.sku}-V${Date.now().toString().slice(-4)}`;

  try {
    const result = db.run(
      `INSERT INTO product_variants (product_id, variant_name, sku, purchase_cost, selling_price, is_active)
       VALUES (?, ?, ?, ?, ?, 1)`,
      [
        productId,
        variant_name.trim(),
        vSku,
        purchase_cost !== undefined ? parseFloat(purchase_cost) : product.purchase_cost,
        selling_price !== undefined ? parseFloat(selling_price) : product.selling_price
      ]
    );

    auditMiddleware(req, {
      module: 'PRODUCTS',
      recordId: productId,
      action: 'ADD_VARIANT',
      newValues: { variantId: result.lastInsertRowid, variant_name, sku: vSku }
    });

    res.status(201).json({ success: true, message: 'Variant added successfully.', id: result.lastInsertRowid });
  } catch (err) {
    res.status(400).json({ success: false, error: 'Variant SKU must be unique.' });
  }
});

module.exports = router;
