-- PRODUCTION DATABASE SCHEMA FOR RETAIL ERP

-- 1. SHOWROOMS
CREATE TABLE IF NOT EXISTS showrooms (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    code TEXT UNIQUE NOT NULL,
    address TEXT NOT NULL,
    phone TEXT NOT NULL,
    is_active INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 2. ROLES & PERMISSIONS
CREATE TABLE IF NOT EXISTS roles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL,
    description TEXT,
    is_system INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS permissions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT UNIQUE NOT NULL,
    module TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT
);

CREATE TABLE IF NOT EXISTS role_permissions (
    role_id INTEGER NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    permission_id INTEGER NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
    PRIMARY KEY (role_id, permission_id)
);

-- 3. USERS & EMPLOYEES
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    full_name TEXT NOT NULL,
    email TEXT,
    phone TEXT,
    role_id INTEGER NOT NULL REFERENCES roles(id),
    showroom_id INTEGER REFERENCES showrooms(id), -- NULL = All showrooms (Super Admin)
    is_active INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS employees (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER REFERENCES users(id),
    showroom_id INTEGER NOT NULL REFERENCES showrooms(id),
    emp_code TEXT UNIQUE NOT NULL,
    full_name TEXT NOT NULL,
    role_title TEXT NOT NULL,
    phone TEXT NOT NULL,
    address TEXT,
    joining_date DATE NOT NULL,
    status TEXT DEFAULT 'ACTIVE', -- ACTIVE, INACTIVE, TERMINATED
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 4. PRODUCT CATALOG & VARIANTS
CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL,
    description TEXT
);

CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sku TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    category_id INTEGER REFERENCES categories(id),
    brand TEXT,
    unit TEXT DEFAULT 'PCS',
    purchase_cost REAL NOT NULL DEFAULT 0.0,
    selling_price REAL NOT NULL DEFAULT 0.0,
    min_stock_alert INTEGER DEFAULT 5,
    is_active INTEGER DEFAULT 1,
    description TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS product_variants (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    variant_name TEXT NOT NULL, -- e.g. 'Small', 'Medium', 'Large', 'Custom-32x32'
    sku TEXT UNIQUE NOT NULL,
    purchase_cost REAL,
    selling_price REAL,
    is_active INTEGER DEFAULT 1
);

-- 5. INVENTORY & AUDITABLE MOVEMENTS
CREATE TABLE IF NOT EXISTS inventory (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    showroom_id INTEGER NOT NULL REFERENCES showrooms(id),
    product_id INTEGER NOT NULL REFERENCES products(id),
    variant_id INTEGER REFERENCES product_variants(id),
    quantity INTEGER NOT NULL DEFAULT 0,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(showroom_id, product_id, variant_id)
);

CREATE TABLE IF NOT EXISTS inventory_movements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    showroom_id INTEGER NOT NULL REFERENCES showrooms(id),
    product_id INTEGER NOT NULL REFERENCES products(id),
    variant_id INTEGER REFERENCES product_variants(id),
    movement_type TEXT NOT NULL, -- 'RECEIVING', 'SALE', 'TRANSFER_IN', 'TRANSFER_OUT', 'ADJUSTMENT', 'RETURN'
    quantity INTEGER NOT NULL, -- signed (+ for added, - for deducted)
    balance_after INTEGER NOT NULL,
    reference_id TEXT, -- Challan No, Order No, Adjustment Ref
    notes TEXT,
    created_by INTEGER NOT NULL REFERENCES users(id),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 6. SUPPLIERS & CHALLANS (FACTORY RECEIVING)
CREATE TABLE IF NOT EXISTS suppliers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    contact_person TEXT,
    phone TEXT NOT NULL,
    address TEXT,
    is_active INTEGER DEFAULT 1
);

CREATE TABLE IF NOT EXISTS challans (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    challan_number TEXT UNIQUE NOT NULL,
    supplier_id INTEGER NOT NULL REFERENCES suppliers(id),
    showroom_id INTEGER NOT NULL REFERENCES showrooms(id),
    challan_date DATE NOT NULL,
    receiving_date DATETIME DEFAULT CURRENT_TIMESTAMP,
    total_items INTEGER NOT NULL DEFAULT 0,
    total_cost REAL NOT NULL DEFAULT 0.0,
    notes TEXT,
    status TEXT DEFAULT 'RECEIVED', -- 'RECEIVED', 'CANCELLED'
    created_by INTEGER NOT NULL REFERENCES users(id),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS challan_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    challan_id INTEGER NOT NULL REFERENCES challans(id) ON DELETE CASCADE,
    product_id INTEGER NOT NULL REFERENCES products(id),
    variant_id INTEGER REFERENCES product_variants(id),
    quantity INTEGER NOT NULL,
    unit_cost REAL NOT NULL DEFAULT 0.0,
    total_cost REAL NOT NULL DEFAULT 0.0
);

-- 7. CUSTOMERS
CREATE TABLE IF NOT EXISTS customers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    phone TEXT UNIQUE NOT NULL,
    address TEXT,
    notes TEXT,
    total_orders INTEGER DEFAULT 0,
    total_spent REAL DEFAULT 0.0,
    outstanding_balance REAL DEFAULT 0.0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 8. ORDERS & INVOICES
CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_number TEXT UNIQUE NOT NULL,
    customer_id INTEGER NOT NULL REFERENCES customers(id),
    showroom_id INTEGER NOT NULL REFERENCES showrooms(id),
    salesman_id INTEGER NOT NULL REFERENCES users(id),
    order_date DATETIME DEFAULT CURRENT_TIMESTAMP,
    subtotal REAL NOT NULL DEFAULT 0.0,
    discount REAL NOT NULL DEFAULT 0.0,
    net_total REAL NOT NULL DEFAULT 0.0,
    paid_amount REAL NOT NULL DEFAULT 0.0,
    remaining_balance REAL NOT NULL DEFAULT 0.0,
    order_status TEXT NOT NULL DEFAULT 'CONFIRMED', -- 'DRAFT', 'CONFIRMED', 'DELIVERING', 'COMPLETED', 'CANCELLED'
    payment_status TEXT NOT NULL DEFAULT 'PENDING', -- 'PENDING', 'PARTIAL', 'PAID'
    delivery_required INTEGER DEFAULT 1,
    delivery_address TEXT,
    delivery_status TEXT DEFAULT 'ORDERED',
    notes TEXT
);

CREATE TABLE IF NOT EXISTS order_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    product_id INTEGER NOT NULL REFERENCES products(id),
    variant_id INTEGER REFERENCES product_variants(id),
    quantity INTEGER NOT NULL,
    unit_price REAL NOT NULL,
    subtotal REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS invoices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    invoice_number TEXT UNIQUE NOT NULL,
    order_id INTEGER REFERENCES orders(id),
    custom_order_id INTEGER REFERENCES custom_orders(id),
    customer_id INTEGER NOT NULL REFERENCES customers(id),
    showroom_id INTEGER NOT NULL REFERENCES showrooms(id),
    invoice_date DATETIME DEFAULT CURRENT_TIMESTAMP,
    net_total REAL NOT NULL,
    paid_amount REAL NOT NULL,
    balance REAL NOT NULL
);

-- 9. PAYMENTS & TRANSACTIONS
CREATE TABLE IF NOT EXISTS payments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    receipt_number TEXT UNIQUE NOT NULL,
    order_id INTEGER REFERENCES orders(id),
    custom_order_id INTEGER REFERENCES custom_orders(id),
    customer_id INTEGER NOT NULL REFERENCES customers(id),
    showroom_id INTEGER NOT NULL REFERENCES showrooms(id),
    amount REAL NOT NULL,
    payment_method TEXT NOT NULL, -- 'CASH', 'BANK_TRANSFER', 'COD', 'CHEQUE'
    reference_number TEXT,
    notes TEXT,
    received_by INTEGER NOT NULL REFERENCES users(id),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 10. DELIVERIES
CREATE TABLE IF NOT EXISTS deliveries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    delivery_number TEXT UNIQUE NOT NULL,
    order_id INTEGER REFERENCES orders(id),
    custom_order_id INTEGER REFERENCES custom_orders(id),
    customer_id INTEGER NOT NULL REFERENCES customers(id),
    showroom_id INTEGER NOT NULL REFERENCES showrooms(id),
    assigned_staff_id INTEGER REFERENCES employees(id),
    delivery_address TEXT NOT NULL,
    customer_phone TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'ORDERED', -- 'ORDERED', 'CONFIRMED', 'PREPARING', 'READY', 'ASSIGNED', 'OUT_FOR_DELIVERY', 'DELIVERED', 'FAILED', 'CANCELLED', 'RETURNED'
    cod_amount REAL DEFAULT 0.0,
    collected_amount REAL DEFAULT 0.0,
    delivery_date DATE,
    delivery_time TEXT,
    notes TEXT,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 11. MAKE-TO-ORDER / CUSTOM ORDERS (CASHIER ENGINE)
CREATE TABLE IF NOT EXISTS custom_orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    custom_order_number TEXT UNIQUE NOT NULL,
    customer_id INTEGER NOT NULL REFERENCES customers(id),
    showroom_id INTEGER NOT NULL REFERENCES showrooms(id),
    cashier_id INTEGER NOT NULL REFERENCES users(id),
    item_description TEXT NOT NULL,
    size_specification TEXT NOT NULL,
    quantity INTEGER NOT NULL DEFAULT 1,
    manufacturing_cost REAL NOT NULL DEFAULT 0.0,
    selling_price REAL NOT NULL DEFAULT 0.0,
    total_cost REAL NOT NULL DEFAULT 0.0,
    total_sale REAL NOT NULL DEFAULT 0.0,
    gross_profit REAL NOT NULL DEFAULT 0.0,
    profit_margin_pct REAL NOT NULL DEFAULT 0.0,
    paid_amount REAL NOT NULL DEFAULT 0.0,
    remaining_balance REAL NOT NULL DEFAULT 0.0,
    status TEXT DEFAULT 'RECEIVED', -- 'RECEIVED', 'IN_PRODUCTION', 'READY', 'DELIVERED', 'COMPLETED', 'CANCELLED'
    delivery_address TEXT,
    is_locked INTEGER DEFAULT 1,
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 12. EMPLOYEE ADVANCES
CREATE TABLE IF NOT EXISTS employee_advances (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    voucher_number TEXT UNIQUE NOT NULL,
    employee_id INTEGER NOT NULL REFERENCES employees(id),
    showroom_id INTEGER NOT NULL REFERENCES showrooms(id),
    amount REAL NOT NULL,
    advance_date DATE NOT NULL,
    reason TEXT NOT NULL,
    payment_method TEXT DEFAULT 'CASH',
    given_by INTEGER NOT NULL REFERENCES users(id),
    is_settled INTEGER DEFAULT 0,
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 13. DAILY EXPENSES
CREATE TABLE IF NOT EXISTS expense_categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL
);

CREATE TABLE IF NOT EXISTS expenses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    voucher_number TEXT UNIQUE NOT NULL,
    showroom_id INTEGER NOT NULL REFERENCES showrooms(id),
    category_id INTEGER NOT NULL REFERENCES expense_categories(id),
    amount REAL NOT NULL,
    expense_date DATE NOT NULL,
    payment_method TEXT DEFAULT 'CASH',
    paid_to TEXT,
    description TEXT NOT NULL,
    created_by INTEGER NOT NULL REFERENCES users(id),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 14. IMMUTABLE AUDIT LOGS
CREATE TABLE IF NOT EXISTS audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER REFERENCES users(id),
    showroom_id INTEGER REFERENCES showrooms(id),
    module TEXT NOT NULL,
    record_id TEXT NOT NULL,
    action TEXT NOT NULL, -- 'CREATE', 'UPDATE', 'DELETE', 'STATUS_CHANGE', 'PAYMENT', 'REVERSAL', 'PERMISSION_CHANGE'
    old_values TEXT,
    new_values TEXT,
    reason TEXT,
    ip_address TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 15. SYSTEM SETTINGS
CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    category TEXT DEFAULT 'GENERAL'
);
