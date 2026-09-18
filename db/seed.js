const bcrypt = require('bcryptjs');
const db = require('./index');

function seedDatabase() {
  console.log('--- Starting Master MoltyFoam & Pakistani Brands Database Seeding ---');

  db.exec('PRAGMA foreign_keys = OFF;');
  db.transaction(() => {
    // 1. Settings
    const settings = [
      ['company_name', 'Master MoltyFoam Dealership', 'GENERAL'],
      ['tagline', "The Asli Foam • Pakistan's No. 1 Mattress", 'GENERAL'],
      ['currency_symbol', 'PKR', 'GENERAL'],
      ['invoice_prefix', 'INV-', 'SALES'],
      ['challan_prefix', 'CHL-', 'INVENTORY'],
      ['custom_order_prefix', 'MF-CUST-', 'SALES'],
      ['voucher_prefix', 'VCH-', 'FINANCE'],
      ['tax_percentage', '0', 'FINANCE'],
      ['enable_negative_stock', '0', 'INVENTORY']
    ];
    for (const [k, v, cat] of settings) {
      db.run('INSERT OR REPLACE INTO settings (key, value, category) VALUES (?, ?, ?)', [k, v, cat]);
    }

    // 2. Showrooms
    const showrooms = [
      [1, 'Master MoltyFoam Flagship Gallery - Blue Area', 'SH-01', 'Plot 14, Jinnah Avenue, Blue Area, Islamabad', '+92 51 2894001', 1],
      [2, 'Master MoltyFoam Elite Lounge - Saddar', 'SH-02', 'Shop 24-B, Commercial Plaza, Saddar, Rawalpindi', '+92 51 5567822', 1]
    ];
    for (const s of showrooms) {
      db.run(
        'INSERT OR REPLACE INTO showrooms (id, name, code, address, phone, is_active) VALUES (?, ?, ?, ?, ?, ?)',
        s
      );
    }

    // 3. Permissions
    const permissions = [
      ['VIEW_DASHBOARD', 'DASHBOARD', 'View Dashboard', 'Access executive dashboard KPIs'],
      ['VIEW_SHOWROOMS', 'SHOWROOMS', 'View Showrooms', 'View showroom information'],
      ['MANAGE_SHOWROOMS', 'SHOWROOMS', 'Manage Showrooms', 'Create and modify showrooms'],
      ['ALL_SHOWROOMS', 'SHOWROOMS', 'Cross-Showroom Access', 'Access data across all showrooms'],
      ['VIEW_PRODUCTS', 'PRODUCTS', 'View Products', 'View product catalog and variants'],
      ['MANAGE_PRODUCTS', 'PRODUCTS', 'Manage Products', 'Create and edit products and variants'],
      ['VIEW_CHALLANS', 'CHALLANS', 'View Challans', 'View factory receiving challans'],
      ['CREATE_CHALLAN', 'CHALLANS', 'Create Challan', 'Receive stock and post challans'],
      ['MOBILE_CHALLAN', 'CHALLANS', 'Mobile Challan Entry', 'Quick responsive challan intake'],
      ['VIEW_INVENTORY', 'INVENTORY', 'View Inventory', 'View showroom stock levels'],
      ['ADJUST_INVENTORY', 'INVENTORY', 'Adjust Inventory', 'Perform manual stock adjustments'],
      ['TRANSFER_INVENTORY', 'INVENTORY', 'Transfer Inventory', 'Transfer stock between showrooms'],
      ['VIEW_CUSTOMERS', 'CUSTOMERS', 'View Customers', 'View customer list and ledgers'],
      ['MANAGE_CUSTOMERS', 'CUSTOMERS', 'Manage Customers', 'Register and edit customer records'],
      ['VIEW_SALES', 'SALES', 'View Sales & Orders', 'View sales history and active orders'],
      ['CREATE_SALE', 'SALES', 'Create Order / Sale', 'Process POS checkout and create orders'],
      ['VIEW_INVOICES', 'SALES', 'View & Print Invoices', 'View, print and export sales invoices'],
      ['VIEW_CUSTOM_ORDERS', 'CUSTOM_ORDERS', 'View Custom Orders', 'View make-to-order list'],
      ['CREATE_CUSTOM_ORDER', 'CUSTOM_ORDERS', 'Create Custom Order', 'Cashier make-to-order entry'],
      ['VIEW_DELIVERIES', 'DELIVERIES', 'View Deliveries', 'View delivery management pipeline'],
      ['UPDATE_DELIVERY', 'DELIVERIES', 'Update Delivery Status', 'Update in-transit and delivery completion'],
      ['VIEW_STAFF', 'HR', 'View Staff & Advances', 'View employees and advance records'],
      ['MANAGE_ADVANCES', 'HR', 'Manage Advances', 'Issue staff advances and record settlements'],
      ['VIEW_EXPENSES', 'FINANCE', 'View Expenses', 'View daily expense log'],
      ['MANAGE_EXPENSES', 'FINANCE', 'Manage Expenses', 'Record and categorize daily expenses'],
      ['VIEW_REPORTS', 'REPORTS', 'View Business Reports', 'Access sales and financial reports'],
      ['EXPORT_REPORTS', 'REPORTS', 'Export Reports', 'Export business data to CSV and PDF'],
      ['VIEW_AUDIT', 'SECURITY', 'View Audit Logs', 'Access immutable system audit logs'],
      ['MANAGE_SETTINGS', 'SYSTEM', 'Manage Settings', 'System configuration and store settings']
    ];

    for (const p of permissions) {
      db.run(
        'INSERT OR REPLACE INTO permissions (code, module, name, description) VALUES (?, ?, ?, ?)',
        p
      );
    }

    // 4. Roles
    const roles = [
      [1, 'Super Admin', 'Full unrestricted enterprise access to all showrooms and modules', 1],
      [2, 'Showroom Manager', 'Operations manager for a specific showroom', 1],
      [3, 'Cashier', 'Showroom cashier managing POS sales, payments, and make-to-orders', 1],
      [4, 'Salesman', 'Showroom salesman assisting customers and placing orders', 1],
      [5, 'Delivery Staff', 'Field delivery courier handling assigned deliveries and COD collection', 1],
      [6, 'Inventory Staff', 'Warehouse receiving staff handling challans and stock', 1]
    ];

    for (const [id, name, desc, is_sys] of roles) {
      db.run('INSERT OR REPLACE INTO roles (id, name, description, is_system) VALUES (?, ?, ?, ?)', [
        id,
        name,
        desc,
        is_sys
      ]);
    }

    // Map permissions to roles
    const allPerms = db.query('SELECT id, code FROM permissions');
    const permMap = {};
    for (const p of allPerms) {
      permMap[p.code] = p.id;
    }

    function grantPerms(roleId, codes) {
      for (const code of codes) {
        if (permMap[code]) {
          db.run('INSERT OR IGNORE INTO role_permissions (role_id, permission_id) VALUES (?, ?)', [
            roleId,
            permMap[code]
          ]);
        }
      }
    }

    // Super Admin: All permissions
    grantPerms(1, Object.keys(permMap));

    // Showroom Manager: Almost all except system settings
    grantPerms(
      2,
      Object.keys(permMap).filter((c) => c !== 'MANAGE_SETTINGS')
    );

    // Cashier
    grantPerms(3, [
      'VIEW_DASHBOARD',
      'VIEW_PRODUCTS',
      'VIEW_INVENTORY',
      'VIEW_CUSTOMERS',
      'MANAGE_CUSTOMERS',
      'VIEW_SALES',
      'CREATE_SALE',
      'VIEW_INVOICES',
      'VIEW_CUSTOM_ORDERS',
      'CREATE_CUSTOM_ORDER',
      'VIEW_DELIVERIES',
      'VIEW_EXPENSES',
      'MANAGE_EXPENSES'
    ]);

    // Salesman
    grantPerms(4, [
      'VIEW_DASHBOARD',
      'VIEW_PRODUCTS',
      'VIEW_INVENTORY',
      'VIEW_CUSTOMERS',
      'MANAGE_CUSTOMERS',
      'VIEW_SALES',
      'CREATE_SALE',
      'VIEW_INVOICES',
      'VIEW_DELIVERIES'
    ]);

    // Delivery Staff
    grantPerms(5, ['VIEW_DELIVERIES', 'UPDATE_DELIVERY']);

    // Inventory Staff
    grantPerms(6, [
      'VIEW_DASHBOARD',
      'VIEW_PRODUCTS',
      'MANAGE_PRODUCTS',
      'VIEW_CHALLANS',
      'CREATE_CHALLAN',
      'MOBILE_CHALLAN',
      'VIEW_INVENTORY',
      'ADJUST_INVENTORY',
      'TRANSFER_INVENTORY'
    ]);

    // 5. Users
    const salt = bcrypt.genSaltSync(10);
    const users = [
      [1, 'admin', bcrypt.hashSync('admin123', salt), 'System Administrator', 'admin@erp.local', '+92 300 1112233', 1, null, 1],
      [2, 'manager1', bcrypt.hashSync('manager123', salt), 'Tariq Mehmood', 'tariq@erp.local', '+92 300 2223344', 2, 1, 1],
      [3, 'cashier1', bcrypt.hashSync('cashier123', salt), 'Bilal Ahmed', 'bilal@erp.local', '+92 300 3334455', 3, 1, 1],
      [4, 'sales1', bcrypt.hashSync('sales123', salt), 'Hamza Khan', 'hamza@erp.local', '+92 300 4445566', 4, 1, 1],
      [5, 'delivery1', bcrypt.hashSync('delivery123', salt), 'Usman Ali', 'usman@erp.local', '+92 300 5556677', 5, 1, 1],
      [6, 'inventory1', bcrypt.hashSync('inv123', salt), 'Zubair Shah', 'zubair@erp.local', '+92 300 6667788', 6, 1, 1]
    ];

    for (const u of users) {
      db.run(
        'INSERT OR REPLACE INTO users (id, username, password_hash, full_name, email, phone, role_id, showroom_id, is_active) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        u
      );
    }

    // 6. Employees
    const employees = [
      [1, 2, 1, 'EMP-101', 'Tariq Mehmood', 'Showroom Manager', '+92 300 2223344', 'Sector G-9/1, Islamabad', '2025-01-10', 'ACTIVE'],
      [2, 3, 1, 'EMP-102', 'Bilal Ahmed', 'Head Cashier', '+92 300 3334455', 'Satellite Town, Rawalpindi', '2025-02-01', 'ACTIVE'],
      [3, 4, 1, 'EMP-103', 'Hamza Khan', 'Senior Sales Executive', '+92 300 4445566', 'Sector F-10/2, Islamabad', '2025-03-15', 'ACTIVE'],
      [4, 5, 1, 'EMP-104', 'Usman Ali', 'Lead Delivery Courier', '+92 300 5556677', 'Commercial Market, Rawalpindi', '2025-04-01', 'ACTIVE'],
      [5, 6, 1, 'EMP-105', 'Zubair Shah', 'Warehouse & Challans Officer', '+92 300 6667788', 'I-8/4, Islamabad', '2025-02-15', 'ACTIVE']
    ];

    for (const e of employees) {
      db.run(
        'INSERT OR REPLACE INTO employees (id, user_id, showroom_id, emp_code, full_name, role_title, phone, address, joining_date, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        e
      );
    }

    // 7. Categories & Pakistani Foam Suppliers
    const categories = [
      [1, 'Mattresses & Foam Beds', 'Original Foam, Orthopedic, Spring, Dual Comfort & Luxury Mattresses'],
      [2, 'Custom Foam & Cutting Sheets', 'High-Density Raw Foam Sheets, Rebonded Core & Memory Foam Toppers'],
      [3, 'Pillows, Cushions & Protectors', 'Contour Cervical Pillows, Cool Gel, Anti-Dustmite Waterproof Protectors'],
      [4, 'Sofa-Cum-Beds & Foldables', 'Multi-functional Foldable Guest Mattresses & Sofa-Cum-Beds']
    ];
    for (const c of categories) {
      db.run('INSERT OR REPLACE INTO categories (id, name, description) VALUES (?, ?, ?)', c);
    }

    const suppliers = [
      [1, 'Master Group of Industries (MoltyFoam Factory)', 'Mr. Tariq Rafiq (GM Sales)', '+92 42 111 665 897', '14-Km G.T. Road, Kala Shah Kaku, Punjab', 1],
      [2, 'Diamond Products Limited (Supreme Foam)', 'Mr. Shaukat Diamond', '+92 42 111 111 666', 'Kot Lakhpat Industrial Area, Lahore', 1],
      [3, 'Dura Foam Pakistan (Pvt) Ltd', 'Mr. Zubair Dura', '+92 42 35839001', '23-Km Multan Road, Lahore', 1],
      [4, 'Cannon Foam Mills Ltd', 'Mr. Farhan Cannon', '+92 55 4291122', 'Small Industrial Estate, Gujranwala', 1],
      [5, 'United Foam Industries', 'Mr. Aslam United', '+92 41 8723344', 'Sargodha Road, Faisalabad', 1]
    ];
    for (const s of suppliers) {
      db.run('INSERT OR REPLACE INTO suppliers (id, name, contact_person, phone, address, is_active) VALUES (?, ?, ?, ?, ?, ?)', s);
    }

    // 8. Products (Pakistan Foam Brands Catalog)
    const products = [
      [1, 'PRD-MOLTY-01', 'Master MoltyFoam Original (The Asli Foam)', 1, 'Master MoltyFoam', 'PCS', 22000.0, 34500.0, 4, 1, 'Pakistan No. 1 flagship high-density mattress with 10-Year Official Warranty card'],
      [2, 'PRD-MOLTY-02', 'Master MoltyOrtho (Physiotherapy Spine Care)', 1, 'Master MoltyFoam', 'PCS', 28000.0, 44000.0, 3, 1, 'Recommended by orthopedic surgeons for spine alignment and back pain relief. 12-Year Warranty.'],
      [3, 'PRD-MOLTY-03', 'Master MoltyDeluxe (High Density Luxury)', 1, 'Master MoltyFoam', 'PCS', 25000.0, 39500.0, 4, 1, 'Extra deep comfort high resilience foam core with knitted quilted cover. 10-Year Warranty.'],
      [4, 'PRD-MOLTY-04', 'Master MoltyCool Gel Infused Mattress', 1, 'Master MoltyFoam', 'PCS', 32000.0, 49500.0, 2, 1, 'Advanced cooling gel beads that dissipate body heat for sweat-free sleep. 10-Year Warranty.'],
      [5, 'PRD-DIA-01', 'Diamond Supreme Foam Original', 1, 'Diamond Supreme', 'PCS', 21000.0, 33000.0, 4, 1, 'Classic high density Supreme Foam with 10-Year Warranty guarantee card'],
      [6, 'PRD-DIA-02', 'Diamond Dolce Vita Luxury Spring & Foam', 1, 'Diamond Supreme', 'PCS', 38000.0, 58000.0, 2, 1, 'Ultra luxury hybrid pocket spring mattress with Euro top quilting. 12-Year Warranty.'],
      [7, 'PRD-DURA-01', 'Dura Foam Ultra Orthopedic', 1, 'Dura Foam', 'PCS', 19500.0, 30500.0, 3, 1, 'Firm rebonded orthopedic core engineered for long-lasting spinal support. 10-Year Warranty.'],
      [8, 'PRD-CANNON-01', 'Cannon Heritage Orthopedic Mattress', 1, 'Cannon Foam', 'PCS', 18500.0, 29000.0, 3, 1, 'Heavy duty luxury foam mattress with anti-allergic jacquard fabric. 10-Year Warranty.'],
      [9, 'PRD-UNITED-01', 'United Super Foam Deluxe', 1, 'United Foam', 'PCS', 17000.0, 26500.0, 3, 1, 'Durable everyday foam mattress with 7-Year warranty coverage.'],
      [10, 'PRD-MOLTY-SHEET', 'Master Molty Custom Cutting Sheet (Per Board-Ft)', 2, 'Master MoltyFoam', 'SQFT', 180.0, 290.0, 20, 1, 'Raw high-density foam sheet for custom upholstery, sofa cushions, and bespoke cutting.'],
      [11, 'PRD-MOLTY-PIL', 'Master Molty Contour Cervical Pillow', 3, 'Master MoltyFoam', 'PCS', 2400.0, 3950.0, 10, 1, 'Ergonomic neck support memory foam pillow for cervical posture correction.'],
      [12, 'PRD-SOFA-01', 'Master Molty Sofa-Cum-Bed (3-in-1 Foldable)', 4, 'Master MoltyFoam', 'PCS', 19000.0, 29500.0, 3, 1, 'Versatile foldable 3-in-1 mattress that converts into a stylish sofa or day lounger.']
    ];

    for (const p of products) {
      db.run(
        'INSERT OR REPLACE INTO products (id, sku, name, category_id, brand, unit, purchase_cost, selling_price, min_stock_alert, is_active, description) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        p
      );
    }

    // Size Variants (Pakistan Mattress Standard Sizes)
    const variants = [
      // Product 1: Master MoltyFoam Original
      [1, 1, 'King Size 78"x72"x6"', 'MOLTY-ORIG-K6', 22000.0, 34500.0, 1],
      [2, 1, 'King Size 78"x72"x8"', 'MOLTY-ORIG-K8', 26000.0, 39500.0, 1],
      [3, 1, 'Queen Size 78"x66"x6"', 'MOLTY-ORIG-Q6', 20000.0, 31000.0, 1],
      [4, 1, 'Queen Size 78"x60"x6"', 'MOLTY-ORIG-Q5', 18500.0, 28500.0, 1],
      [5, 1, 'Single Size 78"x39"x5"', 'MOLTY-ORIG-S5', 12000.0, 18500.0, 1],

      // Product 2: Master MoltyOrtho
      [6, 2, 'King Size 78"x72"x6"', 'MOLTY-ORTHO-K6', 28000.0, 44000.0, 1],
      [7, 2, 'King Size 78"x72"x8"', 'MOLTY-ORTHO-K8', 33000.0, 51000.0, 1],
      [8, 2, 'Queen Size 78"x66"x6"', 'MOLTY-ORTHO-Q6', 25000.0, 39500.0, 1],
      [9, 2, 'Single Size 78"x39"x6"', 'MOLTY-ORTHO-S6', 15500.0, 24000.0, 1],

      // Product 3: Master MoltyDeluxe
      [10, 3, 'King Size 78"x72"x6"', 'MOLTY-DLX-K6', 25000.0, 38500.0, 1],
      [11, 3, 'Queen Size 78"x60"x6"', 'MOLTY-DLX-Q6', 21000.0, 32500.0, 1],

      // Product 4: Master MoltyCool Gel
      [12, 4, 'King Size 78"x72"x8"', 'MOLTY-COOL-K8', 34000.0, 52000.0, 1],
      [13, 4, 'Queen Size 78"x66"x8"', 'MOLTY-COOL-Q8', 29000.0, 45000.0, 1],

      // Product 5: Diamond Supreme Foam Original
      [14, 5, 'King Size 78"x72"x6"', 'DIA-SUP-K6', 21000.0, 33000.0, 1],
      [15, 5, 'Queen Size 78"x60"x6"', 'DIA-SUP-Q6', 18000.0, 27500.0, 1],
      [16, 5, 'Single Size 78"x39"x5"', 'DIA-SUP-S5', 11500.0, 17500.0, 1],

      // Product 6: Diamond Dolce Vita
      [17, 6, 'King Size 78"x72"x10"', 'DIA-DOLCE-K10', 38000.0, 58000.0, 1],

      // Product 7: Dura Foam Ultra Ortho
      [18, 7, 'King Size 78"x72"x6"', 'DURA-ORTHO-K6', 19500.0, 30500.0, 1],

      // Product 8: Cannon Heritage
      [19, 8, 'King Size 78"x72"x6"', 'CANNON-HER-K6', 18500.0, 29000.0, 1],

      // Product 9: United Super Foam
      [20, 9, 'King Size 78"x72"x6"', 'UNITED-SUP-K6', 17000.0, 26500.0, 1],

      // Product 10: Custom Cutting Sheet
      [21, 10, 'Density 32 High Resilient (D-32)', 'FOAM-D32', 180.0, 280.0, 1],
      [22, 10, 'Density 40 Firm Orthopedic Core (D-40)', 'FOAM-D40', 240.0, 360.0, 1],

      // Product 11: Pillows
      [23, 11, 'Standard Contour (Memory Foam)', 'MOLTY-PIL-MEM', 2400.0, 3950.0, 1],
      [24, 11, 'Cool Gel Infused Cervical', 'MOLTY-PIL-GEL', 2900.0, 4650.0, 1],

      // Product 12: Sofa Cum Bed
      [25, 12, 'Double Bed (6x4.5 ft)', 'MOLTY-SOFA-DBL', 19000.0, 29500.0, 1],
      [26, 12, 'Single Bed (6x3 ft)', 'MOLTY-SOFA-SGL', 13000.0, 20500.0, 1]
    ];

    for (const v of variants) {
      db.run(
        'INSERT OR REPLACE INTO product_variants (id, product_id, variant_name, sku, purchase_cost, selling_price, is_active) VALUES (?, ?, ?, ?, ?, ?, ?)',
        v
      );
    }

    // 9. Initial Inventory for Showrooms
    const initialStocks = [
      // Showroom 1 (Blue Area)
      [1, 1, 1, 12], // Molty Original King 6"
      [1, 1, 2, 8],  // Molty Original King 8"
      [1, 1, 3, 10], // Molty Original Queen 6"
      [1, 1, 4, 15], // Molty Original Queen 5"
      [1, 1, 5, 20], // Molty Original Single 5"
      [1, 2, 6, 8],  // Molty Ortho King 6"
      [1, 2, 7, 5],  // Molty Ortho King 8"
      [1, 2, 8, 6],  // Molty Ortho Queen 6"
      [1, 3, 10, 8], // Molty Deluxe King
      [1, 4, 12, 6], // Molty Cool Gel
      [1, 5, 14, 10], // Diamond Supreme King
      [1, 7, 18, 8],  // Dura Foam Ortho
      [1, 11, 23, 35], // Molty Contour Pillow
      [1, 12, 25, 6],  // Molty Sofa Cum Bed Double

      // Showroom 2 (Saddar)
      [2, 1, 1, 8],
      [2, 1, 3, 6],
      [2, 2, 6, 6],
      [2, 4, 12, 4],
      [2, 5, 14, 8],
      [2, 6, 17, 4],
      [2, 8, 19, 6],
      [2, 9, 20, 8],
      [2, 11, 23, 25],
      [2, 12, 25, 4]
    ];

    for (const [shId, prdId, varId, qty] of initialStocks) {
      db.run(
        'INSERT OR REPLACE INTO inventory (showroom_id, product_id, variant_id, quantity) VALUES (?, ?, ?, ?)',
        [shId, prdId, varId, qty]
      );
      db.run(
        'INSERT INTO inventory_movements (showroom_id, product_id, variant_id, movement_type, quantity, balance_after, reference_id, notes, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [shId, prdId, varId, 'RECEIVING', qty, qty, 'INIT-STOCK', 'Initial showroom stock opening balance', 1]
      );
    }

    // 10. Customers
    const customers = [
      [1, 'Chaudhry Nadeem Akhtar', '+92 321 5110022', 'House 45, Street 12, F-7/2, Islamabad', 'VIP Corporate / Home Furnishing Client', 3, 98500.0, 0.0],
      [2, 'Malik Shahbaz', '+92 333 4455667', 'Plaza 18, Civic Center, Bahria Town, Rawalpindi', 'Purchased Master MoltyOrtho Mattresses', 2, 54000.0, 10000.0],
      [3, 'Syed Daniyal Bukhari', '+92 345 9988771', 'Apartment 4B, Silver Oaks, F-10, Islamabad', 'Prefers COD delivery with warranty cards', 1, 34500.0, 0.0],
      [4, 'Mrs. Saira Farooq', '+92 300 8877665', 'House 112, Lane 4, Peshawar Road, Rawalpindi', 'Custom foam cutting for antique bed', 1, 28000.0, 5000.0]
    ];

    for (const c of customers) {
      db.run(
        'INSERT OR REPLACE INTO customers (id, name, phone, address, notes, total_orders, total_spent, outstanding_balance) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        c
      );
    }

    // 11. Expense Categories
    const expenseCats = [
      [1, 'Staff Tea, Meals & Refreshments'],
      [2, 'Showroom Electricity & AC Utilities'],
      [3, 'Mattress Packaging polythene & Corner Guards'],
      [4, 'Delivery Mazda Truck & Bike Fuel'],
      [5, 'Warranty Slips & Office Stationery'],
      [6, 'Showroom Maintenance & Display Lighting']
    ];
    for (const ec of expenseCats) {
      db.run('INSERT OR REPLACE INTO expense_categories (id, name) VALUES (?, ?)', ec);
    }

    // 12. Sample Expenses
    const expenses = [
      ['VCH-1001', 1, 1, 1800.0, '2026-09-15', 'CASH', 'Savour Foods', 'Staff lunch for showroom team', 1],
      ['VCH-1002', 1, 4, 3500.0, '2026-09-16', 'CASH', 'PSO Blue Area', 'Delivery truck fuel for home deliveries', 1],
      ['VCH-1003', 2, 3, 4200.0, '2026-09-15', 'CASH', 'Al-Madina Polythene', 'Heavy gauge waterproof mattress covers', 2]
    ];
    for (const exp of expenses) {
      db.run(
        'INSERT OR IGNORE INTO expenses (voucher_number, showroom_id, category_id, amount, expense_date, payment_method, paid_to, description, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        exp
      );
    }

    // 13. Sample Employee Advance
    db.run(
      'INSERT OR IGNORE INTO employee_advances (voucher_number, employee_id, showroom_id, amount, advance_date, reason, payment_method, given_by, is_settled, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      ['ADV-2001', 4, 1, 10000.0, '2026-09-10', 'Family medical urgent expense', 'CASH', 1, 0, 'To be deducted in monthly payroll']
    );

    // 14. Sample Factory Challan (from Master Factory)
    db.run(
      'INSERT OR IGNORE INTO challans (id, challan_number, supplier_id, showroom_id, challan_date, total_items, total_cost, notes, status, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [1, 'CHL-9901', 1, 1, '2026-09-14', 20, 440000.0, 'Received via Master MoltyFoam Logistics Truck # LHR-7890 with official warranty booklets', 'RECEIVED', 6]
    );
    db.run(
      'INSERT OR IGNORE INTO challan_items (id, challan_id, product_id, variant_id, quantity, unit_cost, total_cost) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [1, 1, 1, 1, 20, 22000.0, 440000.0]
    );

    // 15. Sample Make-to-Order Custom Mattress / Foam Order
    db.run(
      'INSERT OR IGNORE INTO custom_orders (id, custom_order_number, customer_id, showroom_id, cashier_id, item_description, size_specification, quantity, manufacturing_cost, selling_price, total_cost, total_sale, gross_profit, profit_margin_pct, paid_amount, remaining_balance, status, delivery_address, is_locked, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [
        1,
        'MF-CUST-8001',
        4,
        1,
        3,
        'Custom Orthopedic High-Density Mattress with Quilted Jacquard Fabric',
        'Size: 78" x 70" x 8", Density: 40 High-Resilient, Zippered Quilted Cover with border piping',
        1,
        20000.0,
        32000.0,
        20000.0,
        32000.0,
        12000.0,
        37.5,
        15000.0,
        17000.0,
        'IN_PRODUCTION',
        'House 112, Lane 4, Peshawar Road, Rawalpindi',
        1,
        'Custom bedroom size for heritage wooden bridal bed. Include 10-Year Master Warranty Card.'
      ]
    );

    // 16. Sample Orders
    db.run(
      'INSERT OR IGNORE INTO orders (id, order_number, customer_id, showroom_id, salesman_id, order_date, subtotal, discount, net_total, paid_amount, remaining_balance, order_status, payment_status, delivery_required, delivery_address, delivery_status, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [
        1,
        'ORD-5001',
        1,
        1,
        4,
        '2026-09-16 11:30:00',
        34500.0,
        1500.0,
        33000.0,
        33000.0,
        0.0,
        'COMPLETED',
        'PAID',
        1,
        'House 45, Street 12, F-7/2, Islamabad',
        'DELIVERED',
        'Master MoltyFoam Original King Size with 10-Year Warranty Card'
      ]
    );
    db.run(
      'INSERT OR IGNORE INTO order_items (id, order_id, product_id, variant_id, quantity, unit_price, subtotal) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [1, 1, 1, 1, 1, 34500.0, 34500.0]
    );

    db.run(
      'INSERT OR IGNORE INTO invoices (id, invoice_number, order_id, customer_id, showroom_id, invoice_date, net_total, paid_amount, balance) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [1, 'INV-1001', 1, 1, 1, '2026-09-16 11:30:00', 33000.0, 33000.0, 0.0]
    );

    db.run(
      'INSERT OR IGNORE INTO payments (id, receipt_number, order_id, customer_id, showroom_id, amount, payment_method, reference_number, notes, received_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [1, 'RCT-1001', 1, 1, 1, 33000.0, 'BANK_TRANSFER', 'HBL-FT-992837', 'Full payment verified via HBL Raast', 3]
    );

    db.run(
      'INSERT OR IGNORE INTO deliveries (id, delivery_number, order_id, customer_id, showroom_id, assigned_staff_id, delivery_address, customer_phone, status, cod_amount, collected_amount, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [1, 'DEL-7001', 1, 1, 1, 4, 'House 45, Street 12, F-7/2, Islamabad', '+92 321 5110022', 'DELIVERED', 0.0, 0.0, 'Delivered safely with Master Molty Warranty Book # MF-88291 handed over to customer']
    );

    // Order 2 (Partial COD Order)
    db.run(
      'INSERT OR IGNORE INTO orders (id, order_number, customer_id, showroom_id, salesman_id, order_date, subtotal, discount, net_total, paid_amount, remaining_balance, order_status, payment_status, delivery_required, delivery_address, delivery_status, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [
        2,
        'ORD-5002',
        2,
        1,
        4,
        '2026-09-16 14:15:00',
        44000.0,
        2000.0,
        42000.0,
        20000.0,
        22000.0,
        'CONFIRMED',
        'PARTIAL',
        1,
        'Plaza 18, Civic Center, Bahria Town, Rawalpindi',
        'OUT_FOR_DELIVERY',
        'Master MoltyOrtho King with 12-Year Warranty'
      ]
    );
    db.run(
      'INSERT OR IGNORE INTO order_items (id, order_id, product_id, variant_id, quantity, unit_price, subtotal) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [2, 2, 2, 6, 1, 44000.0, 44000.0]
    );

    db.run(
      'INSERT OR IGNORE INTO invoices (id, invoice_number, order_id, customer_id, showroom_id, invoice_date, net_total, paid_amount, balance) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [2, 'INV-1002', 2, 2, 1, '2026-09-16 14:15:00', 42000.0, 20000.0, 22000.0]
    );

    db.run(
      'INSERT OR IGNORE INTO payments (id, receipt_number, order_id, customer_id, showroom_id, amount, payment_method, reference_number, notes, received_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [2, 'RCT-1002', 2, 2, 1, 20000.0, 'CASH', 'CSH-0021', 'Advance token payment at showroom counter', 3]
    );

    db.run(
      'INSERT OR IGNORE INTO deliveries (id, delivery_number, order_id, customer_id, showroom_id, assigned_staff_id, delivery_address, customer_phone, status, cod_amount, collected_amount, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [2, 'DEL-7002', 2, 2, 1, 4, 'Plaza 18, Civic Center, Bahria Town, Rawalpindi', '+92 333 4455667', 'OUT_FOR_DELIVERY', 22000.0, 0.0, 'On route to Bahria Town via Delivery Mazda. Collect balance PKR 22,000 on delivery']
    );

    // 17. Seed Audit Logs
    const sampleAudits = [
      [1, 1, 'AUTH', '1', 'LOGIN', null, '{"status":"SUCCESS"}', 'Super Admin logged into Master MoltyFoam ERP', '127.0.0.1'],
      [6, 1, 'INVENTORY', 'CHL-9901', 'CREATE', null, '{"items":20}', 'Received Factory Challan CHL-9901 from Master Group', '127.0.0.1'],
      [3, 1, 'CUSTOM_ORDERS', 'MF-CUST-8001', 'CREATE', null, '{"qty":1}', 'Cashier posted custom mattress order MF-CUST-8001', '127.0.0.1'],
      [3, 1, 'SALES', 'ORD-5001', 'CREATE', null, '{"total":33000}', 'Processed POS Order ORD-5001 (Master MoltyFoam King)', '127.0.0.1'],
      [5, 1, 'DELIVERY', 'DEL-7001', 'STATUS_CHANGE', 'ASSIGNED', 'DELIVERED', 'Marked delivery as DELIVERED with warranty card', '127.0.0.1']
    ];

    for (const a of sampleAudits) {
      db.run(
        'INSERT INTO audit_logs (user_id, showroom_id, module, record_id, action, old_values, new_values, reason, ip_address) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        a
      );
    }
  });

  db.exec('PRAGMA foreign_keys = ON;');
  console.log('--- Master MoltyFoam & Pakistani Brands Seeding Completed Successfully ---');
}

if (require.main === module) {
  seedDatabase();
}

module.exports = seedDatabase;
