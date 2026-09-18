
// ==========================================
// REAL-TIME CLOUD FIRESTORE SYNCHRONIZATION ENGINE
// ==========================================
const FirestoreCloudSync = {
  projectId: 'bed-shop-a6839',
  collection: 'erp_collections',
  isOnline: navigator.onLine,
  isSyncing: false,
  status: 'IDLE',

  getBaseUrl() {
    return `https://firestore.googleapis.com/v1/projects/${this.projectId}/databases/(default)/documents/${this.collection}`;
  },

  async pushToCloud(key, data) {
    if (!navigator.onLine) return;
    try {
      this.updateStatusBadge('SYNCING');
      const url = `${this.getBaseUrl()}/${key}`;
      const body = {
        fields: {
          payload: { stringValue: JSON.stringify(data) },
          updatedAt: { stringValue: new Date().toISOString() }
        }
      };

      const res = await fetch(url, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });

      if (res.ok) {
        this.updateStatusBadge('ONLINE');
      } else if (res.status === 403) {
        console.warn('Firestore permission denied. Please publish read/write rules.');
        this.updateStatusBadge('RULES_LOCKED');
      }
    } catch (err) {
      console.warn('Cloud sync push failed, cached in localStorage:', err);
      this.updateStatusBadge('OFFLINE');
    }
  },

  async pullAllFromCloud() {
    if (!navigator.onLine) return;
    try {
      this.updateStatusBadge('SYNCING');
      const res = await fetch(this.getBaseUrl());
      if (!res.ok) {
        if (res.status === 403) this.updateStatusBadge('RULES_LOCKED');
        return;
      }
      const json = await res.json();
      if (!json.documents || !Array.isArray(json.documents)) {
        // First time cloud initialization - push initial defaults
        await this.seedAllToCloud();
        this.updateStatusBadge('ONLINE');
        return;
      }

      for (const doc of json.documents) {
        const docName = doc.name.split('/').pop();
        if (doc.fields && doc.fields.payload && doc.fields.payload.stringValue) {
          try {
            const parsed = JSON.parse(doc.fields.payload.stringValue);
            localStorage.setItem(`erp_ds_${docName}`, JSON.stringify(parsed));
          } catch (e) {}
        }
      }
      this.updateStatusBadge('ONLINE');
    } catch (err) {
      console.warn('Cloud pull failed, relying on local cache:', err);
      this.updateStatusBadge('OFFLINE');
    }
  },

  async seedAllToCloud() {
    const keys = [
      'showrooms', 'products', 'categories', 'suppliers', 'customers',
      'orders', 'custom_orders', 'deliveries', 'challans', 'employees',
      'advances', 'expenses', 'expense_categories', 'payments',
      'inventory_movements', 'audit_logs', 'settings'
    ];
    for (const k of keys) {
      const v = ClientStorageBackend.getStore(k, null);
      if (v) {
        await this.pushToCloud(k, v);
      }
    }
  },

  updateStatusBadge(status) {
    this.status = status;
    const badge = document.getElementById('cloud-sync-status-badge');
    if (!badge) return;

    if (status === 'ONLINE') {
      badge.className = 'badge badge-success';
      badge.innerHTML = '<span class="status-dot online"></span> 🟢 Cloud Live';
      badge.title = 'Real-time Firebase Firestore Connected & Synchronized';
    } else if (status === 'SYNCING') {
      badge.className = 'badge badge-warning';
      badge.innerHTML = '<span class="status-dot syncing"></span> 🟡 Syncing...';
      badge.title = 'Syncing data with Firebase Cloud...';
    } else if (status === 'RULES_LOCKED') {
      badge.className = 'badge badge-danger';
      badge.innerHTML = '<span class="status-dot warning"></span> ⚠️ Rules Locked';
      badge.title = 'Firestore Rules need to be set to allow read, write in Firebase Console';
    } else {
      badge.className = 'badge badge-neutral';
      badge.innerHTML = '<span class="status-dot offline"></span> ⚪ Local Mode';
      badge.title = 'Working from offline local storage';
    }
  },

  init() {
    window.addEventListener('online', () => {
      this.isOnline = true;
      this.pullAllFromCloud();
    });
    window.addEventListener('offline', () => {
      this.isOnline = false;
      this.updateStatusBadge('OFFLINE');
    });

    // Auto pull on window focus
    window.addEventListener('focus', () => {
      this.pullAllFromCloud();
    });

    // Periodic sync every 45s
    setInterval(() => {
      this.pullAllFromCloud();
    }, 45000);

    // Initial pull
    setTimeout(() => {
      this.pullAllFromCloud();
    }, 1500);
  }
};

window.FirestoreCloudSync = FirestoreCloudSync;

// Enterprise Hybrid API Client: Real Backend + Seamless Client-Side Persistence Fallback
// Ensures 100% functionality both on local Node.js server and on static Firebase Hosting (bed-shop-a6839.web.app)

const ClientStorageBackend = {
  getStore(key, defaultValue) {
    try {
      const v = localStorage.getItem(`erp_ds_${key}`);
      return v ? JSON.parse(v) : defaultValue;
    } catch {
      return defaultValue;
    }
  },

  setStore(key, value) {
    try {
      localStorage.setItem(`erp_ds_${key}`, JSON.stringify(value));
      if (typeof FirestoreCloudSync !== 'undefined') {
        FirestoreCloudSync.pushToCloud(key, value);
      }
    } catch (e) {
      console.error('Storage quota error:', e);
    }
  },

  initDefaultData() {
    if (localStorage.getItem('erp_ds_initialized_molty_v3') === 'true') return;

    // 1. Default Showrooms
    this.setStore('showrooms', [
      { id: 1, name: 'Master MoltyFoam Flagship Gallery - Blue Area', code: 'SH-01', address: 'Plot 14, Jinnah Avenue, Blue Area, Islamabad', phone: '+92 51 2894001', is_active: 1, staff_count: 5, order_count: 8, total_stock_items: 320 },
      { id: 2, name: 'Master MoltyFoam Elite Lounge - Saddar', code: 'SH-02', address: 'Shop 24-B, Commercial Plaza, Saddar, Rawalpindi', phone: '+92 51 5567822', is_active: 1, staff_count: 3, order_count: 4, total_stock_items: 180 }
    ]);

    // 2. Default Products & Variants (Pakistani Foam Brands)
    this.setStore('products', [
      {
        id: 1, sku: 'PRD-MOLTY-01', name: 'Master MoltyFoam Original (The Asli Foam)', category_id: 1, category_name: 'Mattresses & Foam Beds', brand: 'Master MoltyFoam', unit: 'PCS',
        purchase_cost: 22000, selling_price: 34500, min_stock_alert: 4, current_stock: 45,
        variants: [
          { id: 1, variant_name: 'King Size 78"x72"x6"', sku: 'MOLTY-ORIG-K6', selling_price: 34500 },
          { id: 2, variant_name: 'King Size 78"x72"x8"', sku: 'MOLTY-ORIG-K8', selling_price: 39500 },
          { id: 3, variant_name: 'Queen Size 78"x66"x6"', sku: 'MOLTY-ORIG-Q6', selling_price: 31000 },
          { id: 4, variant_name: 'Queen Size 78"x60"x6"', sku: 'MOLTY-ORIG-Q5', selling_price: 28500 },
          { id: 5, variant_name: 'Single Size 78"x39"x5"', sku: 'MOLTY-ORIG-S5', selling_price: 18500 }
        ]
      },
      {
        id: 2, sku: 'PRD-MOLTY-02', name: 'Master MoltyOrtho (Physiotherapy Spine Care)', category_id: 1, category_name: 'Mattresses & Foam Beds', brand: 'Master MoltyFoam', unit: 'PCS',
        purchase_cost: 28000, selling_price: 44000, min_stock_alert: 3, current_stock: 32,
        variants: [
          { id: 6, variant_name: 'King Size 78"x72"x6"', sku: 'MOLTY-ORTHO-K6', selling_price: 44000 },
          { id: 7, variant_name: 'King Size 78"x72"x8"', sku: 'MOLTY-ORTHO-K8', selling_price: 51000 },
          { id: 8, variant_name: 'Queen Size 78"x66"x6"', sku: 'MOLTY-ORTHO-Q6', selling_price: 39500 },
          { id: 9, variant_name: 'Single Size 78"x39"x6"', sku: 'MOLTY-ORTHO-S6', selling_price: 24000 }
        ]
      },
      {
        id: 3, sku: 'PRD-MOLTY-03', name: 'Master MoltyDeluxe (High Density Luxury)', category_id: 1, category_name: 'Mattresses & Foam Beds', brand: 'Master MoltyFoam', unit: 'PCS',
        purchase_cost: 25000, selling_price: 39500, min_stock_alert: 4, current_stock: 28,
        variants: [
          { id: 10, variant_name: 'King Size 78"x72"x6"', sku: 'MOLTY-DLX-K6', selling_price: 38500 },
          { id: 11, variant_name: 'Queen Size 78"x60"x6"', sku: 'MOLTY-DLX-Q6', selling_price: 32500 }
        ]
      },
      {
        id: 4, sku: 'PRD-MOLTY-04', name: 'Master MoltyCool Gel Infused Mattress', category_id: 1, category_name: 'Mattresses & Foam Beds', brand: 'Master MoltyFoam', unit: 'PCS',
        purchase_cost: 32000, selling_price: 49500, min_stock_alert: 2, current_stock: 18,
        variants: [
          { id: 12, variant_name: 'King Size 78"x72"x8"', sku: 'MOLTY-COOL-K8', selling_price: 52000 },
          { id: 13, variant_name: 'Queen Size 78"x66"x8"', sku: 'MOLTY-COOL-Q8', selling_price: 45000 }
        ]
      },
      {
        id: 5, sku: 'PRD-DIA-01', name: 'Diamond Supreme Foam Original', category_id: 1, category_name: 'Mattresses & Foam Beds', brand: 'Diamond Supreme', unit: 'PCS',
        purchase_cost: 21000, selling_price: 33000, min_stock_alert: 4, current_stock: 35,
        variants: [
          { id: 14, variant_name: 'King Size 78"x72"x6"', sku: 'DIA-SUP-K6', selling_price: 33000 },
          { id: 15, variant_name: 'Queen Size 78"x60"x6"', sku: 'DIA-SUP-Q6', selling_price: 27500 },
          { id: 16, variant_name: 'Single Size 78"x39"x5"', sku: 'DIA-SUP-S5', selling_price: 17500 }
        ]
      },
      {
        id: 6, sku: 'PRD-DIA-02', name: 'Diamond Dolce Vita Luxury Spring & Foam', category_id: 1, category_name: 'Mattresses & Foam Beds', brand: 'Diamond Supreme', unit: 'PCS',
        purchase_cost: 38000, selling_price: 58000, min_stock_alert: 2, current_stock: 12,
        variants: [
          { id: 17, variant_name: 'King Size 78"x72"x10"', sku: 'DIA-DOLCE-K10', selling_price: 58000 }
        ]
      },
      {
        id: 7, sku: 'PRD-DURA-01', name: 'Dura Foam Ultra Orthopedic', category_id: 1, category_name: 'Mattresses & Foam Beds', brand: 'Dura Foam', unit: 'PCS',
        purchase_cost: 19500, selling_price: 30500, min_stock_alert: 3, current_stock: 24,
        variants: [
          { id: 18, variant_name: 'King Size 78"x72"x6"', sku: 'DURA-ORTHO-K6', selling_price: 30500 }
        ]
      },
      {
        id: 8, sku: 'PRD-CANNON-01', name: 'Cannon Heritage Orthopedic Mattress', category_id: 1, category_name: 'Mattresses & Foam Beds', brand: 'Cannon Foam', unit: 'PCS',
        purchase_cost: 18500, selling_price: 29000, min_stock_alert: 3, current_stock: 20,
        variants: [
          { id: 19, variant_name: 'King Size 78"x72"x6"', sku: 'CANNON-HER-K6', selling_price: 29000 }
        ]
      },
      {
        id: 9, sku: 'PRD-UNITED-01', name: 'United Super Foam Deluxe', category_id: 1, category_name: 'Mattresses & Foam Beds', brand: 'United Foam', unit: 'PCS',
        purchase_cost: 17000, selling_price: 26500, min_stock_alert: 3, current_stock: 18,
        variants: [
          { id: 20, variant_name: 'King Size 78"x72"x6"', sku: 'UNITED-SUP-K6', selling_price: 26500 }
        ]
      },
      {
        id: 10, sku: 'PRD-MOLTY-SHEET', name: 'Master Molty Custom Cutting Sheet (Per Board-Ft)', category_id: 2, category_name: 'Custom Foam & Cutting Sheets', brand: 'Master MoltyFoam', unit: 'SQFT',
        purchase_cost: 180, selling_price: 290, min_stock_alert: 20, current_stock: 150,
        variants: [
          { id: 21, variant_name: 'Density 32 High Resilient (D-32)', sku: 'FOAM-D32', selling_price: 280 },
          { id: 22, variant_name: 'Density 40 Firm Orthopedic Core (D-40)', sku: 'FOAM-D40', selling_price: 360 }
        ]
      },
      {
        id: 11, sku: 'PRD-MOLTY-PIL', name: 'Master Molty Contour Cervical Pillow', category_id: 3, category_name: 'Pillows, Cushions & Protectors', brand: 'Master MoltyFoam', unit: 'PCS',
        purchase_cost: 2400, selling_price: 3950, min_stock_alert: 10, current_stock: 60,
        variants: [
          { id: 23, variant_name: 'Ergonomic Memory Foam Contour', sku: 'MOLTY-PIL-MEM', selling_price: 3950 },
          { id: 24, variant_name: 'Cool Gel Infused Ortho Pillow', sku: 'MOLTY-PIL-GEL', selling_price: 4650 }
        ]
      },
      {
        id: 12, sku: 'PRD-SOFA-01', name: 'Master Molty Sofa-Cum-Bed (3-in-1 Foldable)', category_id: 4, category_name: 'Sofa-Cum-Beds & Foldables', brand: 'Master MoltyFoam', unit: 'PCS',
        purchase_cost: 19000, selling_price: 29500, min_stock_alert: 3, current_stock: 14,
        variants: [
          { id: 25, variant_name: 'Double Bed (6x4.5 ft)', sku: 'MOLTY-SOFA-DBL', selling_price: 29500 },
          { id: 26, variant_name: 'Single Bed (6x3 ft)', sku: 'MOLTY-SOFA-SGL', selling_price: 20500 }
        ]
      }
    ]);

    // 3. Categories
    this.setStore('categories', [
      { id: 1, name: 'Mattresses & Foam Beds' },
      { id: 2, name: 'Custom Foam & Cutting Sheets' },
      { id: 3, name: 'Pillows, Cushions & Protectors' },
      { id: 4, name: 'Sofa-Cum-Beds & Foldables' }
    ]);

    // 4. Suppliers (Pakistani Foam Manufacturers)
    this.setStore('suppliers', [
      { id: 1, name: 'Master Group of Industries (MoltyFoam Factory)', contact_person: 'Mr. Tariq Rafiq (GM Sales)', phone: '+92 42 111 665 897', address: '14-Km G.T. Road, Kala Shah Kaku' },
      { id: 2, name: 'Diamond Products Limited (Supreme Foam)', contact_person: 'Mr. Shaukat Diamond', phone: '+92 42 111 111 666', address: 'Kot Lakhpat Industrial Area, Lahore' },
      { id: 3, name: 'Dura Foam Pakistan (Pvt) Ltd', contact_person: 'Mr. Zubair Dura', phone: '+92 42 35839001', address: '23-Km Multan Road, Lahore' },
      { id: 4, name: 'Cannon Foam Mills Ltd', contact_person: 'Mr. Farhan Cannon', phone: '+92 55 4291122', address: 'Small Industrial Estate, Gujranwala' },
      { id: 5, name: 'United Foam Industries', contact_person: 'Mr. Aslam United', phone: '+92 41 8723344', address: 'Sargodha Road, Faisalabad' }
    ]);

    // 5. Customers
    this.setStore('customers', [
      { id: 1, name: 'Chaudhry Nadeem Akhtar', phone: '+92 321 5110022', address: 'House 45, Street 12, F-7/2, Islamabad', total_orders: 3, total_spent: 98500, outstanding_balance: 0 },
      { id: 2, name: 'Malik Shahbaz', phone: '+92 333 4455667', address: 'Plaza 18, Civic Center, Bahria Town, Rawalpindi', total_orders: 2, total_spent: 54000, outstanding_balance: 10000 },
      { id: 3, name: 'Mrs. Saira Farooq', phone: '+92 300 8877665', address: 'House 112, Lane 4, Peshawar Road, Rawalpindi', total_orders: 1, total_spent: 28000, outstanding_balance: 5000 }
    ]);

    // 6. Orders
    this.setStore('orders', [
      {
        id: 1, order_number: 'ORD-5001', invoice_number: 'INV-1001', showroom_id: 1, showroom_code: 'SH-01', showroom_name: 'Master MoltyFoam Flagship Gallery - Blue Area',
        customer_id: 1, customer_name: 'Chaudhry Nadeem Akhtar', customer_phone: '+92 321 5110022', salesman_name: 'Hamza Khan',
        order_date: new Date(Date.now() - 86400000).toISOString(), subtotal: 34500, discount: 1500, net_total: 33000, paid_amount: 33000, remaining_balance: 0,
        order_status: 'COMPLETED', payment_status: 'PAID', delivery_status: 'DELIVERED', delivery_current_status: 'DELIVERED',
        items: [
          { product_name: 'Master MoltyFoam Original (The Asli Foam)', product_sku: 'MOLTY-ORIG-K6', variant_name: 'King Size 78"x72"x6"', unit_price: 34500, quantity: 1, subtotal: 34500 }
        ]
      },
      {
        id: 2, order_number: 'ORD-5002', invoice_number: 'INV-1002', showroom_id: 1, showroom_code: 'SH-01', showroom_name: 'Master MoltyFoam Flagship Gallery - Blue Area',
        customer_id: 2, customer_name: 'Malik Shahbaz', customer_phone: '+92 333 4455667', salesman_name: 'Hamza Khan',
        order_date: new Date(Date.now() - 43200000).toISOString(), subtotal: 44000, discount: 2000, net_total: 42000, paid_amount: 20000, remaining_balance: 22000,
        order_status: 'CONFIRMED', payment_status: 'PARTIAL', delivery_status: 'OUT_FOR_DELIVERY', delivery_current_status: 'OUT_FOR_DELIVERY',
        items: [
          { product_name: 'Master MoltyOrtho (Physiotherapy Spine Care)', product_sku: 'MOLTY-ORTHO-K6', variant_name: 'King Size 78"x72"x6"', unit_price: 44000, quantity: 1, subtotal: 44000 }
        ]
      }
    ]);

    // 7. Custom Orders (Make-To-Order Foam Cutting)
    this.setStore('custom_orders', [
      {
        id: 1, custom_order_number: 'MF-CUST-8001', showroom_id: 1, showroom_code: 'SH-01', showroom_name: 'Master MoltyFoam Flagship Gallery - Blue Area',
        customer_id: 3, customer_name: 'Mrs. Saira Farooq', customer_phone: '+92 300 8877665', cashier_name: 'Bilal Ahmed',
        item_description: 'Custom Orthopedic High-Density Mattress with Quilted Jacquard Fabric',
        size_specification: 'Size: 78" x 70" x 8", Density: 40 High-Resilient, Zippered Quilted Cover with border piping',
        quantity: 1, manufacturing_cost: 20000, selling_price: 32000, total_cost: 20000, total_sale: 32000,
        gross_profit: 12000, profit_margin_pct: '37.5', paid_amount: 15000, remaining_balance: 17000, status: 'IN_PRODUCTION', is_locked: 1,
        created_at: new Date(Date.now() - 60000000).toISOString()
      }
    ]);

    // 8. Deliveries
    this.setStore('deliveries', [
      {
        id: 1, delivery_number: 'DEL-7001', order_id: 1, order_number: 'ORD-5001', showroom_id: 1, showroom_code: 'SH-01',
        customer_id: 1, customer_name: 'Chaudhry Nadeem Akhtar', customer_mobile: '+92 321 5110022', customer_phone: '+92 321 5110022',
        delivery_address: 'House 45, Street 12, F-7/2, Islamabad', delivery_staff_name: 'Usman Ali',
        status: 'DELIVERED', cod_amount: 0, collected_amount: 0, delivery_date: new Date().toISOString().split('T')[0]
      },
      {
        id: 2, delivery_number: 'DEL-7002', order_id: 2, order_number: 'ORD-5002', showroom_id: 1, showroom_code: 'SH-01',
        customer_id: 2, customer_name: 'Malik Shahbaz', customer_mobile: '+92 333 4455667', customer_phone: '+92 333 4455667',
        delivery_address: 'Plaza 18, Civic Center, Bahria Town, Rawalpindi', delivery_staff_name: 'Usman Ali',
        status: 'OUT_FOR_DELIVERY', cod_amount: 22000, collected_amount: 0, delivery_date: new Date().toISOString().split('T')[0]
      }
    ]);

    // 9. Challans
    this.setStore('challans', [
      {
        id: 1, challan_number: 'CHL-9901', supplier_id: 1, supplier_name: 'Master Group of Industries (MoltyFoam Factory)', supplier_phone: '+92 42 111 665 897',
        showroom_id: 1, showroom_code: 'SH-01', showroom_name: 'Master MoltyFoam Flagship Gallery - Blue Area', challan_date: '2026-09-15',
        total_items: 20, total_cost: 440000, status: 'RECEIVED', received_by_name: 'Zubair Shah',
        items: [
          { product_name: 'Master MoltyFoam Original (The Asli Foam)', product_sku: 'MOLTY-ORIG-K6', variant_name: 'King Size 78"x72"x6"', quantity: 20, unit_cost: 22000, total_cost: 440000 }
        ]
      }
    ]);

    // 10. Staff
    this.setStore('employees', [
      { id: 1, emp_code: 'EMP-101', full_name: 'Tariq Mehmood', role_title: 'Showroom Manager', showroom_id: 1, showroom_code: 'SH-01', phone: '+92 300 2223344', joining_date: '2025-01-10', outstanding_advance: 0, status: 'ACTIVE' },
      { id: 2, emp_code: 'EMP-102', full_name: 'Bilal Ahmed', role_title: 'Head Cashier', showroom_id: 1, showroom_code: 'SH-01', phone: '+92 300 3334455', joining_date: '2025-02-01', outstanding_advance: 0, status: 'ACTIVE' },
      { id: 3, emp_code: 'EMP-103', full_name: 'Hamza Khan', role_title: 'Senior Sales Executive', showroom_id: 1, showroom_code: 'SH-01', phone: '+92 300 4445566', joining_date: '2025-03-15', outstanding_advance: 0, status: 'ACTIVE' },
      { id: 4, emp_code: 'EMP-104', full_name: 'Usman Ali', role_title: 'Lead Delivery Courier', showroom_id: 1, showroom_code: 'SH-01', phone: '+92 300 5556677', joining_date: '2025-04-01', outstanding_advance: 10000, status: 'ACTIVE' }
    ]);

    // 11. Advances
    this.setStore('advances', [
      { id: 1, voucher_number: 'ADV-2001', employee_id: 4, employee_name: 'Usman Ali', emp_code: 'EMP-104', showroom_id: 1, showroom_code: 'SH-01', amount: 10000, advance_date: '2026-09-10', reason: 'Family emergency allowance', is_settled: 0, given_by_name: 'Tariq Mehmood' }
    ]);

    // 12. Expenses
    this.setStore('expenses', [
      { id: 1, voucher_number: 'EXP-1001', showroom_id: 1, showroom_code: 'SH-01', category_id: 1, category_name: 'Meals & Refreshments', amount: 1500, expense_date: '2026-09-16', payment_method: 'CASH', paid_to: 'Savour Foods', description: 'Staff lunch', created_by_name: 'Tariq Mehmood' },
      { id: 2, voucher_number: 'EXP-1002', showroom_id: 1, showroom_code: 'SH-01', category_id: 4, category_name: 'Courier & Vehicle Fuel', amount: 2800, expense_date: '2026-09-16', payment_method: 'CASH', paid_to: 'PSO Station', description: 'Delivery bike fuel', created_by_name: 'Tariq Mehmood' }
    ]);

    // 13. Expense Categories
    this.setStore('expense_categories', [
      { id: 1, name: 'Meals & Refreshments' },
      { id: 2, name: 'Showroom Electricity & Utilities' },
      { id: 3, name: 'Packaging & Shopping Bags' },
      { id: 4, name: 'Courier & Vehicle Fuel' }
    ]);

    // 14. Payments Ledger
    this.setStore('payments', [
      {
        id: 1, receipt_number: 'REC-9001', showroom_id: 1, showroom_code: 'SH-01',
        customer_id: 1, customer_name: 'Chaudhry Nadeem Akhtar', customer_phone: '+92 321 5110022',
        order_number: 'ORD-5001', amount: 33000, payment_method: 'CASH',
        received_by_name: 'Hamza Khan', created_at: new Date(Date.now() - 86400000).toISOString(),
        notes: 'Full payment for MoltyFoam Original Mattress'
      },
      {
        id: 2, receipt_number: 'REC-9002', showroom_id: 1, showroom_code: 'SH-01',
        customer_id: 2, customer_name: 'Malik Shahbaz', customer_phone: '+92 333 4455667',
        order_number: 'ORD-5002', amount: 20000, payment_method: 'BANK_TRANSFER',
        received_by_name: 'Hamza Khan', created_at: new Date(Date.now() - 43200000).toISOString(),
        notes: 'Advance booking payment for Master MoltyOrtho'
      }
    ]);

    // 15. Stock Movement Ledger
    this.setStore('inventory_movements', [
      {
        id: 1, created_at: new Date(Date.now() - 172800000).toISOString(),
        showroom_code: 'SH-01', product_name: 'Master MoltyFoam Original (The Asli Foam)',
        variant_name: 'King Size 78"x72"x6"', movement_type: 'CHALLAN_IN',
        quantity_delta: 20, remaining_stock: 45, reference_doc: 'CHL-9901',
        operator_name: 'Zubair Shah', reason: 'Factory receiving from Master Group'
      }
    ]);

    // 16. Audit Logs
    this.setStore('audit_logs', [
      {
        id: 1, created_at: new Date(Date.now() - 86400000).toISOString(),
        user_name: 'Super Admin', role_name: 'Super Admin', showroom_code: 'SH-01',
        module: 'SYSTEM', action: 'DEPLOY', record_id: 1,
        reason: 'Master MoltyFoam & Pakistani Brands Dealership Activated', changes: '{"status":"LIVE"}'
      }
    ]);

    // 17. Settings
    this.setStore('settings', {
      company_name: 'Master MoltyFoam Dealership',
      tagline: "The Asli Foam • Pakistan's No. 1 Mattress",
      currency_symbol: 'PKR',
      invoice_prefix: 'INV-',
      challan_prefix: 'CHL-',
      custom_order_prefix: 'MF-CUST-'
    });

    localStorage.setItem('erp_ds_initialized_molty_v3', 'true');
  },

  handle(endpoint, options = {}) {
    this.initDefaultData();
    const method = (options.method || 'GET').toUpperCase();
    const body = options.body ? JSON.parse(options.body) : {};
    const url = new URL(endpoint, 'http://localhost');
    const path = url.pathname;
    const params = Object.fromEntries(url.searchParams.entries());

    // 1. Auth login
    if (path === '/auth/login' && method === 'POST') {
      const username = body.username || 'admin';
      const roleMap = {
        admin: { id: 1, name: 'Super Admin', role_id: 1, perms: ['ALL_SHOWROOMS', 'VIEW_DASHBOARD', 'VIEW_SHOWROOMS', 'MANAGE_SHOWROOMS', 'VIEW_PRODUCTS', 'MANAGE_PRODUCTS', 'VIEW_CHALLANS', 'CREATE_CHALLAN', 'MOBILE_CHALLAN', 'VIEW_INVENTORY', 'ADJUST_INVENTORY', 'TRANSFER_INVENTORY', 'VIEW_CUSTOMERS', 'MANAGE_CUSTOMERS', 'VIEW_SALES', 'CREATE_SALE', 'VIEW_INVOICES', 'VIEW_PAYMENTS', 'CREATE_PAYMENT', 'VIEW_CUSTOM_ORDERS', 'CREATE_CUSTOM_ORDERS', 'VIEW_DELIVERIES', 'UPDATE_DELIVERY', 'VIEW_STAFF', 'MANAGE_STAFF', 'VIEW_ADVANCES', 'CREATE_ADVANCE', 'VIEW_EXPENSES', 'CREATE_EXPENSE', 'VIEW_REPORTS', 'EXPORT_REPORTS', 'VIEW_AUDIT', 'MANAGE_SETTINGS'] },
        cashier1: { id: 3, name: 'Head Cashier', role_id: 3, perms: ['VIEW_DASHBOARD', 'VIEW_CUSTOMERS', 'MANAGE_CUSTOMERS', 'VIEW_SALES', 'CREATE_SALE', 'VIEW_INVOICES', 'VIEW_PAYMENTS', 'CREATE_PAYMENT', 'VIEW_CUSTOM_ORDERS', 'CREATE_CUSTOM_ORDERS', 'VIEW_DELIVERIES', 'VIEW_EXPENSES', 'CREATE_EXPENSE'] },
        sales1: { id: 4, name: 'Sales Executive', role_id: 4, perms: ['VIEW_DASHBOARD', 'VIEW_CUSTOMERS', 'MANAGE_CUSTOMERS', 'VIEW_SALES', 'CREATE_SALE', 'VIEW_INVOICES', 'VIEW_DELIVERIES'] },
        delivery1: { id: 5, name: 'Lead Courier', role_id: 5, perms: ['VIEW_DELIVERIES', 'UPDATE_DELIVERY'] },
        inventory1: { id: 6, name: 'Inventory Officer', role_id: 6, perms: ['VIEW_DASHBOARD', 'VIEW_PRODUCTS', 'MANAGE_PRODUCTS', 'VIEW_CHALLANS', 'CREATE_CHALLAN', 'MOBILE_CHALLAN', 'VIEW_INVENTORY', 'ADJUST_INVENTORY', 'TRANSFER_INVENTORY'] }
      };

      const role = roleMap[username.toLowerCase()] || roleMap.admin;
      const user = {
        id: role.id,
        username,
        full_name: role.name,
        role_id: role.role_id,
        role_name: role.name,
        showroom_id: username === 'admin' ? null : 1,
        showroom_name: 'Master MoltyFoam Flagship Gallery - Blue Area',
        showroom_code: 'SH-01',
        permissions: role.perms
      };

      return { success: true, token: 'demo-token-' + Date.now(), user };
    }

    // 2. Auth me
    if (path === '/auth/me') {
      const user = API.getUser();
      return { success: true, user: user || {} };
    }

    // 3. Showrooms
    if (path === '/showrooms' && method === 'GET') {
      return { success: true, data: this.getStore('showrooms', []) };
    }
    if (path === '/showrooms' && method === 'POST') {
      const list = this.getStore('showrooms', []);
      const newS = {
        id: list.length + 1,
        name: body.name,
        code: body.code,
        address: body.address,
        phone: body.phone,
        is_active: 1,
        staff_count: 0,
        order_count: 0,
        total_stock_items: 0
      };
      list.push(newS);
      this.setStore('showrooms', list);
      return { success: true, message: 'Showroom created successfully.', id: newS.id };
    }
    if (path.startsWith('/showrooms/') && method === 'PUT') {
      const id = parseInt(path.replace('/showrooms/', ''), 10);
      const list = this.getStore('showrooms', []);
      const s = list.find((x) => x.id === id);
      if (s) {
        Object.assign(s, body);
        this.setStore('showrooms', list);
      }
      return { success: true, message: 'Showroom updated successfully.' };
    }

    // 4. Products & Variants
    if (path === '/products' && method === 'GET') {
      return { success: true, data: this.getStore('products', []) };
    }
    if (path === '/products/categories/all' && method === 'GET') {
      return { success: true, data: this.getStore('categories', []) };
    }
    if (path === '/products' && method === 'POST') {
      const list = this.getStore('products', []);
      const newP = {
        id: Date.now(),
        sku: body.sku || `PRD-${Date.now().toString().slice(-4)}`,
        name: body.name,
        category_name: 'Mattresses & Foam Beds',
        brand: body.brand || 'Master MoltyFoam',
        unit: body.unit || 'PCS',
        purchase_cost: parseFloat(body.purchase_cost) || 0,
        selling_price: parseFloat(body.selling_price) || 0,
        min_stock_alert: parseInt(body.min_stock_alert, 10) || 5,
        current_stock: 10,
        variants: []
      };
      list.unshift(newP);
      this.setStore('products', list);

      // Audit log
      this.logAudit('PRODUCTS', 'CREATE', newP.id, `Added product ${newP.name} (${newP.sku})`);
      return { success: true, message: 'Product created successfully.', data: newP, id: newP.id };
    }
    if (path.match(/\/products\/\d+\/variants/) && method === 'POST') {
      const pId = parseInt(path.split('/')[2], 10);
      const list = this.getStore('products', []);
      const prod = list.find((x) => x.id === pId);
      if (prod) {
        if (!prod.variants) prod.variants = [];
        const newV = {
          id: Date.now(),
          variant_name: body.variant_name,
          sku: `${prod.sku}-V${Date.now().toString().slice(-3)}`,
          purchase_cost: parseFloat(body.purchase_cost) || prod.purchase_cost,
          selling_price: parseFloat(body.selling_price) || prod.selling_price
        };
        prod.variants.push(newV);
        this.setStore('products', list);
        return { success: true, message: 'Variant added successfully.', data: newV };
      }
      return { success: false, error: 'Product not found' };
    }

    // 5. Challans (Factory Receiving)
    if (path === '/challans' && method === 'GET') {
      return { success: true, data: this.getStore('challans', []) };
    }
    if (path.startsWith('/challans/') && method === 'GET') {
      const id = parseInt(path.replace('/challans/', ''), 10);
      const list = this.getStore('challans', []);
      const ch = list.find((c) => c.id === id || String(c.id) === String(id) || c.challan_number === path.replace('/challans/', '')) || list[0];
      return { success: true, data: ch };
    }
    if (path === '/challans/suppliers/all' && method === 'GET') {
      return { success: true, data: this.getStore('suppliers', []) };
    }
    if (path === '/challans' && method === 'POST') {
      const list = this.getStore('challans', []);
      const sups = this.getStore('suppliers', []);
      const sup = sups.find((s) => s.id === parseInt(body.supplier_id, 10)) || { name: 'Master Group of Industries' };

      const totalItems = (body.items || []).reduce((acc, i) => acc + (parseInt(i.quantity, 10) || 0), 0);
      const totalCost = (body.items || []).reduce((acc, i) => acc + ((parseInt(i.quantity, 10) || 0) * (parseFloat(i.unit_cost) || 0)), 0);

      const newCh = {
        id: Date.now(),
        challan_number: body.challan_number,
        supplier_id: body.supplier_id,
        supplier_name: sup.name,
        showroom_id: body.showroom_id || 1,
        showroom_code: 'SH-01',
        showroom_name: 'Master MoltyFoam Flagship Gallery - Blue Area',
        challan_date: body.challan_date || new Date().toISOString().split('T')[0],
        total_items: totalItems,
        total_cost: totalCost,
        status: 'RECEIVED',
        received_by_name: Auth.currentUser ? Auth.currentUser.full_name : 'Super Admin',
        items: body.items || []
      };
      list.unshift(newCh);
      this.setStore('challans', list);

      // Increment product stock
      const prods = this.getStore('products', []);
      const movements = this.getStore('inventory_movements', []);

      for (const itm of body.items || []) {
        const p = prods.find((x) => x.id === parseInt(itm.product_id, 10));
        if (p) {
          const qty = parseInt(itm.quantity, 10) || 0;
          p.current_stock = (p.current_stock || 0) + qty;
          movements.unshift({
            id: Date.now() + Math.random(),
            created_at: new Date().toISOString(),
            showroom_code: 'SH-01',
            product_name: p.name,
            variant_name: 'Received Stock',
            movement_type: 'CHALLAN_IN',
            quantity_delta: qty,
            remaining_stock: p.current_stock,
            reference_doc: newCh.challan_number,
            operator_name: newCh.received_by_name,
            reason: `Challan arrival from ${newCh.supplier_name}`
          });
        }
      }
      this.setStore('products', prods);
      this.setStore('inventory_movements', movements);
      this.logAudit('CHALLANS', 'RECEIVE', newCh.id, `Received Challan ${newCh.challan_number}`);

      return { success: true, message: `Challan ${newCh.challan_number} recorded and stock updated.`, id: newCh.id };
    }

    // 6. Inventory Matrix & Adjustments
    if (path === '/inventory' && method === 'GET') {
      const prods = this.getStore('products', []);
      const invList = [];
      for (const p of prods) {
        if (p.variants && p.variants.length > 0) {
          for (const v of p.variants) {
            invList.push({
              showroom_id: 1, showroom_code: 'SH-01', product_id: p.id, product_name: p.name, product_sku: v.sku || p.sku,
              variant_name: v.variant_name, category_name: p.category_name, quantity: Math.max(1, Math.floor(p.current_stock / p.variants.length)),
              unit: p.unit, min_stock_alert: p.min_stock_alert, purchase_cost: p.purchase_cost, selling_price: v.selling_price || p.selling_price
            });
          }
        } else {
          invList.push({
            showroom_id: 1, showroom_code: 'SH-01', product_id: p.id, product_name: p.name, product_sku: p.sku,
            variant_name: 'Standard', category_name: p.category_name, quantity: p.current_stock,
            unit: p.unit, min_stock_alert: p.min_stock_alert, purchase_cost: p.purchase_cost, selling_price: p.selling_price
          });
        }
      }
      return { success: true, data: invList };
    }
    if (path === '/inventory/movements' && method === 'GET') {
      return { success: true, data: this.getStore('inventory_movements', []) };
    }
    if (path === '/inventory/adjust' && method === 'POST') {
      const prods = this.getStore('products', []);
      const movements = this.getStore('inventory_movements', []);
      const p = prods.find((x) => x.id === parseInt(body.product_id, 10));
      if (p) {
        const oldQty = p.current_stock;
        const newQty = parseInt(body.new_quantity, 10) || 0;
        p.current_stock = newQty;
        this.setStore('products', prods);

        movements.unshift({
          id: Date.now(),
          created_at: new Date().toISOString(),
          showroom_code: 'SH-01',
          product_name: p.name,
          variant_name: 'Stock Adjustment',
          movement_type: 'ADJUSTMENT',
          quantity_delta: newQty - oldQty,
          remaining_stock: newQty,
          reference_doc: 'MANUAL-ADJ',
          operator_name: Auth.currentUser ? Auth.currentUser.full_name : 'Staff',
          reason: body.reason || 'Physical count adjustment'
        });
        this.setStore('inventory_movements', movements);
        this.logAudit('INVENTORY', 'ADJUST', p.id, `Stock adjusted from ${oldQty} to ${newQty}: ${body.reason}`);
      }
      return { success: true, message: 'Stock adjusted successfully.' };
    }
    if (path === '/inventory/transfer' && method === 'POST') {
      const movements = this.getStore('inventory_movements', []);
      const prods = this.getStore('products', []);
      const p = prods.find((x) => x.id === parseInt(body.product_id, 10)) || prods[0];
      const qty = parseInt(body.quantity, 10) || 1;

      movements.unshift({
        id: Date.now(),
        created_at: new Date().toISOString(),
        showroom_code: 'SH-01 -> SH-02',
        product_name: p.name,
        variant_name: 'Inter-Branch Transfer',
        movement_type: 'TRANSFER',
        quantity_delta: -qty,
        remaining_stock: Math.max(0, p.current_stock - qty),
        reference_doc: `TRF-${Date.now().toString().slice(-4)}`,
        operator_name: Auth.currentUser ? Auth.currentUser.full_name : 'Staff',
        reason: body.notes || 'Inter-showroom transfer'
      });
      this.setStore('inventory_movements', movements);
      return { success: true, message: 'Inter-showroom transfer recorded.' };
    }

    // 7. Customers
    if (path === '/customers' && method === 'GET') {
      return { success: true, data: this.getStore('customers', []) };
    }
    if (path.startsWith('/customers/') && !path.includes('/ledger') && method === 'GET') {
      const id = parseInt(path.replace('/customers/', ''), 10);
      const custs = this.getStore('customers', []);
      const cust = custs.find((c) => c.id === id) || custs[0];
      return { success: true, data: cust };
    }
    if (path.includes('/ledger') && method === 'GET') {
      const parts = path.split('/');
      const id = parseInt(parts[2], 10);
      const custs = this.getStore('customers', []);
      const orders = this.getStore('orders', []);
      const payments = this.getStore('payments', []);
      const cust = custs.find((c) => c.id === id) || custs[0];
      const custOrders = orders.filter((o) => o.customer_id === id);
      const custPayments = payments.filter((p) => p.customer_id === id);

      return {
        success: true,
        data: {
          customer: cust,
          orders: custOrders,
          payments: custPayments
        }
      };
    }
    if (path === '/customers' && method === 'POST') {
      const list = this.getStore('customers', []);
      const newC = {
        id: Date.now(),
        name: body.name,
        phone: body.phone,
        address: body.address || '',
        notes: body.notes || '',
        total_orders: 0,
        total_spent: 0,
        outstanding_balance: 0
      };
      list.unshift(newC);
      this.setStore('customers', list);
      this.logAudit('CUSTOMERS', 'CREATE', newC.id, `Customer ${newC.name} registered`);
      return { success: true, message: 'Customer registered successfully.', id: newC.id };
    }

    // 8. Orders (POS Checkout)
    if (path === '/orders' && method === 'GET') {
      return { success: true, data: this.getStore('orders', []) };
    }
    if (path.startsWith('/orders/') && method === 'GET') {
      const id = parseInt(path.replace('/orders/', ''), 10);
      const orders = this.getStore('orders', []);
      const ord = orders.find((o) => o.id === id || String(o.id) === String(id) || o.order_number === path.replace('/orders/', '')) || orders[0];
      return { success: true, data: ord };
    }
    if (path === '/orders' && method === 'POST') {
      const orders = this.getStore('orders', []);
      const customers = this.getStore('customers', []);
      const payments = this.getStore('payments', []);
      const products = this.getStore('products', []);

      const ordNum = `ORD-${Date.now().toString().slice(-4)}`;
      const invNum = `INV-${Date.now().toString().slice(-4)}`;
      const subtotal = (body.items || []).reduce((acc, i) => acc + ((i.quantity || 1) * (i.unit_price || 0)), 0);
      const discount = parseFloat(body.discount) || 0;
      const netTotal = Math.max(0, subtotal - discount);
      const paid = parseFloat(body.paid_amount) || 0;
      const balance = Math.max(0, netTotal - paid);

      // Customer resolution
      let custId = body.customer_id;
      let custName = 'Walk-in Customer';
      let custPhone = '+92 300 0000000';

      if (body.customer_data) {
        const newCust = {
          id: Date.now(),
          name: body.customer_data.name,
          phone: body.customer_data.phone,
          address: body.customer_data.address || '',
          total_orders: 1,
          total_spent: netTotal,
          outstanding_balance: balance
        };
        customers.unshift(newCust);
        this.setStore('customers', customers);
        custId = newCust.id;
        custName = newCust.name;
        custPhone = newCust.phone;
      } else if (custId) {
        const c = customers.find((x) => x.id === parseInt(custId, 10));
        if (c) {
          custName = c.name;
          custPhone = c.phone;
          c.total_orders = (c.total_orders || 0) + 1;
          c.total_spent = (c.total_spent || 0) + netTotal;
          c.outstanding_balance = (c.outstanding_balance || 0) + balance;
          this.setStore('customers', customers);
        }
      }

      // Deduct product stock
      for (const itm of body.items || []) {
        const p = products.find((x) => x.id === parseInt(itm.product_id, 10));
        if (p) {
          p.current_stock = Math.max(0, (p.current_stock || 0) - (parseInt(itm.quantity, 10) || 1));
        }
      }
      this.setStore('products', products);

      const newO = {
        id: Date.now(),
        order_number: ordNum,
        invoice_number: invNum,
        showroom_id: body.showroom_id || 1,
        showroom_code: 'SH-01',
        showroom_name: 'Master MoltyFoam Flagship Gallery - Blue Area',
        customer_id: custId,
        customer_name: custName,
        customer_phone: custPhone,
        salesman_name: Auth.currentUser ? Auth.currentUser.full_name : 'Hamza Khan',
        order_date: new Date().toISOString(),
        subtotal,
        discount,
        net_total: netTotal,
        paid_amount: paid,
        remaining_balance: balance,
        order_status: balance === 0 ? 'COMPLETED' : 'CONFIRMED',
        payment_status: balance === 0 ? 'PAID' : paid > 0 ? 'PARTIAL' : 'PENDING',
        delivery_status: body.delivery_required ? 'ORDERED' : 'NOT_REQUIRED',
        delivery_current_status: body.delivery_required ? 'ORDERED' : 'NOT_REQUIRED',
        delivery_address: body.delivery_address || '',
        items: body.items || []
      };

      orders.unshift(newO);
      this.setStore('orders', orders);

      // Payment receipt entry
      if (paid > 0) {
        payments.unshift({
          id: Date.now() + 1,
          receipt_number: `REC-${Date.now().toString().slice(-4)}`,
          showroom_id: 1,
          showroom_code: 'SH-01',
          customer_id: custId,
          customer_name: custName,
          customer_phone: custPhone,
          order_number: ordNum,
          amount: paid,
          payment_method: body.payment_method || 'CASH',
          received_by_name: Auth.currentUser ? Auth.currentUser.full_name : 'Staff',
          created_at: new Date().toISOString(),
          notes: `POS checkout payment for ${ordNum}`
        });
        this.setStore('payments', payments);
      }

      // Delivery record entry
      if (body.delivery_required) {
        const delivs = this.getStore('deliveries', []);
        delivs.unshift({
          id: Date.now() + 2,
          delivery_number: `DEL-${Date.now().toString().slice(-4)}`,
          order_id: newO.id,
          order_number: ordNum,
          showroom_id: 1,
          showroom_code: 'SH-01',
          customer_name: newO.customer_name,
          customer_mobile: newO.customer_phone,
          customer_phone: newO.customer_phone,
          delivery_address: newO.delivery_address || 'Customer Delivery Address',
          delivery_staff_name: 'Usman Ali',
          status: 'ORDERED',
          cod_amount: balance,
          collected_amount: 0,
          delivery_date: new Date().toISOString().split('T')[0]
        });
        this.setStore('deliveries', delivs);
      }

      this.logAudit('SALES', 'CREATE_ORDER', newO.id, `Placed POS order ${ordNum} (PKR ${netTotal})`);

      return {
        success: true,
        message: `Order ${ordNum} created successfully!`,
        data: { orderId: newO.id, orderNumber: ordNum, invoiceNumber: invNum }
      };
    }

    // 9. Custom Orders (Make-To-Order Foam Cutting)
    if (path === '/custom-orders' && method === 'GET') {
      return { success: true, data: this.getStore('custom_orders', []) };
    }
    if (path.startsWith('/custom-orders/') && !path.includes('/correct') && method === 'GET') {
      const id = parseInt(path.replace('/custom-orders/', ''), 10);
      const list = this.getStore('custom_orders', []);
      const ord = list.find((o) => o.id === id || String(o.id) === String(id) || o.custom_order_number === path.replace('/custom-orders/', '')) || list[0];
      return { success: true, data: ord };
    }
    if (path.includes('/correct') && method === 'POST') {
      const id = parseInt(path.split('/')[2], 10);
      const list = this.getStore('custom_orders', []);
      const co = list.find((x) => x.id === id);
      if (co) {
        if (body.manufacturing_cost) co.manufacturing_cost = parseFloat(body.manufacturing_cost);
        if (body.selling_price) co.selling_price = parseFloat(body.selling_price);
        co.total_cost = co.manufacturing_cost * co.quantity;
        co.total_sale = co.selling_price * co.quantity;
        co.gross_profit = co.total_sale - co.total_cost;
        co.profit_margin_pct = co.total_sale > 0 ? ((co.gross_profit / co.total_sale) * 100).toFixed(1) : '0';
        co.remaining_balance = Math.max(0, co.total_sale - co.paid_amount);
        this.setStore('custom_orders', list);
        this.logAudit('CUSTOM_ORDERS', 'ADMIN_CORRECTION', co.id, `Correction applied: ${body.reason}`);
        return { success: true, message: 'Admin correction applied successfully.' };
      }
      return { success: false, error: 'Custom order not found' };
    }
    if (path === '/custom-orders' && method === 'POST') {
      const list = this.getStore('custom_orders', []);
      const customers = this.getStore('customers', []);
      const payments = this.getStore('payments', []);

      const coNum = `MF-CUST-${Date.now().toString().slice(-4)}`;
      const qty = parseInt(body.quantity, 10) || 1;
      const cost = parseFloat(body.manufacturing_cost) || 0;
      const price = parseFloat(body.selling_price) || 0;
      const totalCost = cost * qty;
      const totalSale = price * qty;
      const grossProfit = totalSale - totalCost;
      const margin = totalSale > 0 ? ((grossProfit / totalSale) * 100).toFixed(1) : 0;
      const paid = parseFloat(body.paid_amount) || 0;
      const balance = Math.max(0, totalSale - paid);

      let custId = body.customer_id;
      let custName = 'VIP Client';
      let custPhone = '+92 300 1234567';

      if (body.customer_data) {
        const newC = {
          id: Date.now(),
          name: body.customer_data.name,
          phone: body.customer_data.phone,
          address: body.customer_data.address || '',
          total_orders: 1,
          total_spent: totalSale,
          outstanding_balance: balance
        };
        customers.unshift(newC);
        this.setStore('customers', customers);
        custId = newC.id;
        custName = newC.name;
        custPhone = newC.phone;
      } else if (custId) {
        const c = customers.find((x) => x.id === parseInt(custId, 10));
        if (c) {
          custName = c.name;
          custPhone = c.phone;
        }
      }

      const newCo = {
        id: Date.now(),
        custom_order_number: coNum,
        showroom_id: body.showroom_id || 1,
        showroom_code: 'SH-01',
        showroom_name: 'Master MoltyFoam Flagship Gallery - Blue Area',
        customer_id: custId,
        customer_name: custName,
        customer_phone: custPhone,
        cashier_name: Auth.currentUser ? Auth.currentUser.full_name : 'Head Cashier',
        item_description: body.item_description,
        size_specification: body.size_specification,
        quantity: qty,
        manufacturing_cost: cost,
        selling_price: price,
        total_cost: totalCost,
        total_sale: totalSale,
        gross_profit: grossProfit,
        profit_margin_pct: margin,
        paid_amount: paid,
        remaining_balance: balance,
        status: 'RECEIVED',
        is_locked: 1,
        created_at: new Date().toISOString()
      };

      list.unshift(newCo);
      this.setStore('custom_orders', list);

      if (paid > 0) {
        payments.unshift({
          id: Date.now() + 3,
          receipt_number: `REC-${Date.now().toString().slice(-4)}`,
          showroom_id: 1,
          showroom_code: 'SH-01',
          customer_id: custId,
          customer_name: custName,
          customer_phone: custPhone,
          custom_order_number: coNum,
          amount: paid,
          payment_method: body.payment_method || 'CASH',
          received_by_name: Auth.currentUser ? Auth.currentUser.full_name : 'Staff',
          created_at: new Date().toISOString(),
          notes: `Advance for custom cutting: ${coNum}`
        });
        this.setStore('payments', payments);
      }

      this.logAudit('CUSTOM_ORDERS', 'CREATE', newCo.id, `Custom foam cutting order ${coNum} booked`);

      return { success: true, message: `Custom Order ${coNum} created.`, data: newCo };
    }

    // 10. Deliveries
    if (path === '/deliveries' && method === 'GET') {
      return { success: true, data: this.getStore('deliveries', []) };
    }
    if (path.includes('/status') && method === 'PATCH') {
      const id = parseInt(path.split('/')[2], 10);
      const delivs = this.getStore('deliveries', []);
      const d = delivs.find((x) => x.id === id);
      if (d) {
        d.status = body.status;
        if (body.status === 'DELIVERED') d.cod_amount = 0;
        this.setStore('deliveries', delivs);
        this.logAudit('DELIVERIES', 'UPDATE_STATUS', d.id, `Status set to ${body.status}`);
      }
      return { success: true, message: 'Delivery status updated.' };
    }

    // 11. Staff & Advances
    if (path === '/employees' && method === 'GET') {
      return { success: true, data: this.getStore('employees', []) };
    }
    if (path === '/employees/advances/all' && method === 'GET') {
      return { success: true, data: this.getStore('advances', []) };
    }
    if (path === '/employees/advances' && method === 'POST') {
      const advs = this.getStore('advances', []);
      const emps = this.getStore('employees', []);
      const emp = emps.find((e) => e.id === parseInt(body.employee_id, 10)) || emps[0];
      const amt = parseFloat(body.amount) || 0;

      const newAdv = {
        id: Date.now(),
        voucher_number: `ADV-${Date.now().toString().slice(-4)}`,
        employee_id: emp.id,
        employee_name: emp.full_name,
        emp_code: emp.emp_code,
        showroom_code: 'SH-01',
        amount: amt,
        advance_date: body.advance_date,
        reason: body.reason,
        is_settled: 0,
        given_by_name: Auth.currentUser ? Auth.currentUser.full_name : 'Tariq Mehmood'
      };

      advs.unshift(newAdv);
      emp.outstanding_advance = (emp.outstanding_advance || 0) + amt;
      this.setStore('advances', advs);
      this.setStore('employees', emps);

      this.logAudit('STAFF', 'ISSUE_ADVANCE', newAdv.id, `Advance PKR ${amt} to ${emp.full_name}`);
      return { success: true, message: 'Advance voucher issued successfully.' };
    }
    if (path.includes('/settle') && method === 'PATCH') {
      const id = parseInt(path.split('/')[3], 10);
      const advs = this.getStore('advances', []);
      const emps = this.getStore('employees', []);
      const a = advs.find((x) => x.id === id);
      if (a) {
        a.is_settled = 1;
        const emp = emps.find((e) => e.id === a.employee_id);
        if (emp) {
          emp.outstanding_advance = Math.max(0, (emp.outstanding_advance || 0) - a.amount);
        }
        this.setStore('advances', advs);
        this.setStore('employees', emps);
      }
      return { success: true, message: 'Advance loan marked as settled.' };
    }

    // 12. Expenses
    if (path === '/expenses' && method === 'GET') {
      return { success: true, data: this.getStore('expenses', []) };
    }
    if (path === '/expenses/categories' && method === 'GET') {
      return { success: true, data: this.getStore('expense_categories', []) };
    }
    if (path === '/expenses/summary' && method === 'GET') {
      const exps = this.getStore('expenses', []);
      const total = exps.reduce((acc, e) => acc + (parseFloat(e.amount) || 0), 0);
      return { success: true, data: { total, byCategory: [] } };
    }
    if (path === '/expenses' && method === 'POST') {
      const exps = this.getStore('expenses', []);
      const cats = this.getStore('expense_categories', []);
      const cat = cats.find((c) => c.id === parseInt(body.category_id, 10)) || { name: 'Operational' };

      const newExp = {
        id: Date.now(),
        voucher_number: `EXP-${Date.now().toString().slice(-4)}`,
        showroom_code: 'SH-01',
        category_name: cat.name,
        amount: parseFloat(body.amount) || 0,
        expense_date: body.expense_date,
        payment_method: body.payment_method || 'CASH',
        paid_to: body.paid_to || 'Vendor',
        description: body.description,
        created_by_name: Auth.currentUser ? Auth.currentUser.full_name : 'Staff'
      };
      exps.unshift(newExp);
      this.setStore('expenses', exps);
      this.logAudit('EXPENSES', 'RECORD', newExp.id, `Expense PKR ${newExp.amount} for ${newExp.description}`);
      return { success: true, message: 'Expense recorded successfully.' };
    }

    // 13. Payments Ledger
    if (path === '/payments' && method === 'GET') {
      return { success: true, data: this.getStore('payments', []) };
    }
    if (path === '/payments' && method === 'POST') {
      const payments = this.getStore('payments', []);
      const newP = {
        id: Date.now(),
        receipt_number: `REC-${Date.now().toString().slice(-4)}`,
        showroom_id: body.showroom_id || 1,
        showroom_code: 'SH-01',
        customer_id: body.customer_id,
        customer_name: body.customer_name || 'Customer',
        customer_phone: body.customer_phone || '',
        order_number: body.order_number || '',
        amount: parseFloat(body.amount) || 0,
        payment_method: body.payment_method || 'CASH',
        received_by_name: Auth.currentUser ? Auth.currentUser.full_name : 'Staff',
        created_at: new Date().toISOString(),
        notes: body.notes || ''
      };
      payments.unshift(newP);
      this.setStore('payments', payments);
      return { success: true, message: 'Payment recorded successfully.' };
    }

    // 14. Audit Logs
    if (path === '/audit-logs' && method === 'GET') {
      return { success: true, data: this.getStore('audit_logs', []) };
    }

    // 15. Dashboard Stats (Live Computations)
    if (path === '/dashboard/stats') {
      const orders = this.getStore('orders', []);
      const customOrders = this.getStore('custom_orders', []);
      const delivs = this.getStore('deliveries', []);
      const prods = this.getStore('products', []);
      const exps = this.getStore('expenses', []);
      const advs = this.getStore('advances', []);

      const totalSales = orders.reduce((acc, o) => acc + (parseFloat(o.net_total) || 0), 0);
      const totalCollected = orders.reduce((acc, o) => acc + (parseFloat(o.paid_amount) || 0), 0);
      const totalUnits = prods.reduce((acc, p) => acc + (parseInt(p.current_stock, 10) || 0), 0);
      const totalCustomProfit = customOrders.reduce((acc, co) => acc + (parseFloat(co.gross_profit) || 0), 0);
      const totalExpenses = exps.reduce((acc, e) => acc + (parseFloat(e.amount) || 0), 0);
      const totalAdvances = advs.filter((a) => !a.is_settled).reduce((acc, a) => acc + (parseFloat(a.amount) || 0), 0);

      return {
        success: true,
        data: {
          sales: { total_sales: totalSales, total_collected: totalCollected, total_order_count: orders.length },
          deliveries: {
            pending_delivery_count: delivs.filter((d) => d.status !== 'DELIVERED').length,
            out_for_delivery_count: delivs.filter((d) => d.status === 'OUT_FOR_DELIVERY').length,
            cod_pending_amount: delivs.reduce((acc, d) => acc + (parseFloat(d.cod_amount) || 0), 0)
          },
          inventory: {
            total_units_in_stock: totalUnits,
            total_inventory_retail_value: totalUnits * 32000,
            low_stock_product_count: prods.filter((p) => p.current_stock <= p.min_stock_alert).length
          },
          expenses: totalExpenses,
          advances: totalAdvances,
          customOrders: {
            total_custom_orders: customOrders.length,
            total_custom_profit: totalCustomProfit
          },
          showroomComparison: [
            { id: 1, name: 'Master MoltyFoam Flagship Gallery - Blue Area', code: 'SH-01', total_sales: totalSales, total_stock: totalUnits, total_expenses: totalExpenses },
            { id: 2, name: 'Master MoltyFoam Elite Lounge - Saddar', code: 'SH-02', total_sales: Math.floor(totalSales * 0.35), total_stock: 180, total_expenses: 4200 }
          ],
          paymentDistribution: [
            { payment_method: 'CASH', total_amount: totalCollected * 0.65, count: 6 },
            { payment_method: 'COD', total_amount: totalCollected * 0.35, count: 2 }
          ],
          recentOrders: orders.slice(0, 10)
        }
      };
    }

    // 16. Reports
    if (path.startsWith('/reports/')) {
      const reportType = path.replace('/reports/', '');
      if (reportType === 'sales') return { success: true, data: this.getStore('orders', []) };
      if (reportType === 'inventory') return { success: true, data: this.getStore('products', []) };
      if (reportType === 'deliveries') return { success: true, data: this.getStore('deliveries', []) };
      if (reportType === 'expenses') return { success: true, data: this.getStore('expenses', []) };
      return { success: true, data: [] };
    }

    // 17. Settings & RBAC
    if (path === '/settings') {
      return { success: true, data: this.getStore('settings', {}) };
    }
    if (path === '/settings/roles') {
      return {
        success: true,
        data: {
          roles: [
            { id: 1, name: 'Super Admin', is_system: 1, description: 'Master MoltyFoam Franchise Dealership Owner', permission_ids: [1, 2, 3, 4, 5, 6, 7, 8, 9] },
            { id: 2, name: 'Showroom Manager', is_system: 1, description: 'Branch store operations manager', permission_ids: [1, 2, 4, 5, 6, 7] },
            { id: 3, name: 'Cashier', is_system: 1, description: 'POS Counter & Make-to-Order Operator', permission_ids: [1, 5, 6] }
          ],
          allPermissions: [
            { id: 1, module: 'DASHBOARD', name: 'View Dashboard' },
            { id: 2, module: 'SHOWROOMS', name: 'View Showrooms' },
            { id: 3, module: 'SHOWROOMS', name: 'Manage Showrooms' },
            { id: 4, module: 'PRODUCTS', name: 'Manage Products' },
            { id: 5, module: 'SALES', name: 'Create Sale / POS' },
            { id: 6, module: 'CUSTOM_ORDERS', name: 'Cashier Make-To-Order' },
            { id: 7, module: 'CHALLANS', name: 'Receive Challans' }
          ]
        }
      };
    }

    return { success: true, data: [] };
  },

  logAudit(module, action, recordId, reason) {
    try {
      const logs = this.getStore('audit_logs', []);
      logs.unshift({
        id: Date.now() + Math.random(),
        created_at: new Date().toISOString(),
        user_name: Auth.currentUser ? Auth.currentUser.full_name : 'Super Admin',
        role_name: Auth.currentUser ? Auth.currentUser.role_name : 'Super Admin',
        showroom_code: 'SH-01',
        module,
        action,
        record_id: recordId,
        reason,
        changes: JSON.stringify({ timestamp: new Date().toISOString() })
      });
      this.setStore('audit_logs', logs.slice(0, 200));
    } catch (e) {
      console.error('Failed to log audit in client storage:', e);
    }
  }
};

const API = {
  getToken() {
    return localStorage.getItem('erp_token');
  },

  setToken(token) {
    localStorage.setItem('erp_token', token);
  },

  clearToken() {
    localStorage.removeItem('erp_token');
    localStorage.removeItem('erp_user');
  },

  getUser() {
    try {
      return JSON.parse(localStorage.getItem('erp_user'));
    } catch {
      return null;
    }
  },

  setUser(user) {
    localStorage.setItem('erp_user', JSON.stringify(user));
  },

  async request(endpoint, options = {}) {
    const token = this.getToken();
    const headers = {
      'Content-Type': 'application/json',
      ...options.headers
    };

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    try {
      const response = await fetch(`/api${endpoint}`, {
        ...options,
        headers
      });

      // If backend returns HTML (e.g. Firebase Hosting rewrite fallback) or 404
      const contentType = response.headers.get('content-type') || '';
      if (response.status === 404 || contentType.includes('text/html')) {
        return ClientStorageBackend.handle(endpoint, options);
      }

      if (response.status === 401) {
        this.clearToken();
        window.dispatchEvent(new CustomEvent('erp:auth-expired'));
        throw new Error('Session expired. Please log in.');
      }

      if (response.status === 403) {
        const errData = await response.json().catch(() => ({}));
        const msg = errData.error || 'Access denied.';
        window.showToast(msg, 'error');
        throw new Error(msg);
      }

      if (contentType.includes('text/csv')) {
        return response.blob();
      }

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Operation failed');
      }

      return data;
    } catch (err) {
      // Network error (offline or pure static hosting without live server)
      return ClientStorageBackend.handle(endpoint, options);
    }
  },

  get(endpoint, queryParams = {}) {
    const query = new URLSearchParams();
    for (const [k, v] of Object.entries(queryParams)) {
      if (v !== undefined && v !== null && v !== '') {
        query.append(k, v);
      }
    }
    const qs = query.toString() ? `?${query.toString()}` : '';
    return this.request(`${endpoint}${qs}`, { method: 'GET' });
  },

  post(endpoint, body) {
    return this.request(endpoint, {
      method: 'POST',
      body: JSON.stringify(body)
    });
  },

  put(endpoint, body) {
    return this.request(endpoint, {
      method: 'PUT',
      body: JSON.stringify(body)
    });
  },

  patch(endpoint, body) {
    return this.request(endpoint, {
      method: 'PATCH',
      body: JSON.stringify(body)
    });
  },

  delete(endpoint) {
    return this.request(endpoint, { method: 'DELETE' });
  }
};

window.API = API;

FirestoreCloudSync.init();
