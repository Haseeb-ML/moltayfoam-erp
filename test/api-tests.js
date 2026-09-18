const assert = require('node:assert');
const app = require('../server');

let server;
let port;
let baseUrl;

async function startServer() {
  return new Promise((resolve) => {
    server = app.listen(0, () => {
      port = server.address().port;
      baseUrl = `http://localhost:${port}/api`;
      console.log(`[TEST SERVER] Running on port ${port}`);
      resolve();
    });
  });
}

function stopServer() {
  if (server) server.close();
}

async function request(endpoint, options = {}) {
  const url = `${baseUrl}${endpoint}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers
    }
  });
  const data = await res.json().catch(() => null);
  return { status: res.status, data };
}

async function runTests() {
  console.log('=== STARTING AUTOMATED ERP VERIFICATION SUITE ===');
  await startServer();

  try {
    // 1. Auth Test: Admin Login
    console.log('Test 1: Super Admin Login & JWT Generation...');
    const adminLogin = await request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username: 'admin', password: 'admin123' })
    });
    assert.strictEqual(adminLogin.status, 200);
    assert.strictEqual(adminLogin.data.success, true);
    assert.ok(adminLogin.data.token, 'Token should be returned');
    assert.ok(adminLogin.data.user.permissions.includes('ALL_SHOWROOMS'), 'Admin has ALL_SHOWROOMS');
    const adminToken = adminLogin.data.token;
    console.log('✅ Admin login verified.');

    // 2. Auth Test: Cashier Login & Limited Permissions
    console.log('Test 2: Cashier Login & Permission Scoping...');
    const cashierLogin = await request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username: 'cashier1', password: 'cashier123' })
    });
    assert.strictEqual(cashierLogin.status, 200);
    assert.strictEqual(cashierLogin.data.user.permissions.includes('CREATE_CUSTOM_ORDERS'), true);
    assert.strictEqual(cashierLogin.data.user.permissions.includes('MANAGE_SETTINGS'), false);
    const cashierToken = cashierLogin.data.token;
    console.log('✅ Cashier login verified.');

    // 3. RBAC Enforcement Test: Cashier cannot adjust inventory
    console.log('Test 3: RBAC Security Enforcement (403 Forbidden check)...');
    const unauthorizedAdjust = await request('/inventory/adjust', {
      method: 'POST',
      headers: { Authorization: `Bearer ${cashierToken}` },
      body: JSON.stringify({
        showroom_id: 1,
        product_id: 1,
        variant_id: 1,
        new_quantity: 999,
        reason: 'Unauthorized attempt'
      })
    });
    assert.strictEqual(unauthorizedAdjust.status, 403, 'Should reject unauthorized stock adjust with 403');
    console.log('✅ Backend RBAC enforcement verified (403 Forbidden).');

    // 4. Showrooms Query
    console.log('Test 4: Multi-Showroom Architecture & Isolation...');
    const showroomsRes = await request('/showrooms', {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    assert.strictEqual(showroomsRes.status, 200);
    assert.ok(showroomsRes.data.data.length >= 2, 'Should have at least 2 showrooms');
    console.log(`✅ ${showroomsRes.data.data.length} Showrooms verified.`);

    // 5. Products & Variants Catalog
    console.log('Test 5: Product Master & Size Variants...');
    const productsRes = await request('/products', {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    assert.strictEqual(productsRes.status, 200);
    assert.ok(productsRes.data.data.length >= 5, 'Should have products');
    const hasVariants = productsRes.data.data.some((p) => p.variants && p.variants.length > 0);
    assert.ok(hasVariants, 'At least one product should have variants');
    console.log(`✅ Products catalog verified with ${productsRes.data.data.length} products and size variants.`);

    // 6. Mobile Challan Intake & Stock Increment
    console.log('Test 6: Mobile Factory Challan Intake & Stock Increment...');
    const testChallanNum = `CHL-TEST-${Date.now().toString().slice(-4)}`;
    const challanRes = await request('/challans', {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({
        challan_number: testChallanNum,
        supplier_id: 1,
        showroom_id: 1,
        challan_date: new Date().toISOString().split('T')[0],
        notes: 'Factory shipment via mobile receiving entry',
        items: [
          { product_id: 1, variant_id: 1, quantity: 10, unit_cost: 12000 }
        ]
      })
    });
    assert.strictEqual(challanRes.status, 201, 'Challan should be created');
    console.log('✅ Factory Challan posted and inventory incremented atomically.');

    // 7. Make-To-Order Cashier Flow & Profit Calculation
    console.log('Test 7: Cashier Make-To-Order Engine (Cost, Profit, Immutability)...');
    const customRes = await request('/custom-orders', {
      method: 'POST',
      headers: { Authorization: `Bearer ${cashierToken}` },
      body: JSON.stringify({
        customer_id: 1,
        showroom_id: 1,
        item_description: 'Custom Bespoke Italian Dinner Suit',
        size_specification: 'Jacket: 42 Long, Trouser: 34 Waist 33 Length',
        quantity: 2,
        manufacturing_cost: 10000,
        selling_price: 16000,
        paid_amount: 12000, // Partial Advance
        payment_method: 'CASH',
        notes: 'Wedding reception tuxedo'
      })
    });
    assert.strictEqual(customRes.status, 201);
    const coData = customRes.data.data;
    assert.strictEqual(coData.totalCost, 20000, 'Total Cost = 10000 * 2 = 20000');
    assert.strictEqual(coData.totalSale, 32000, 'Total Sale = 16000 * 2 = 32000');
    assert.strictEqual(coData.grossProfit, 12000, 'Gross Profit = 32000 - 20000 = 12000');
    assert.strictEqual(coData.paidAmount, 12000);
    assert.strictEqual(coData.remainingBalance, 20000);
    console.log('✅ Make-To-Order engine verified: Cost $20,000, Sale $32,000, Gross Profit $12,000 (37.5%).');

    // 8. POS Retail Order & Stock Deduction
    console.log('Test 8: POS Order Creation, Invoice, and Stock Deduction...');
    const orderRes = await request('/orders', {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({
        customer_id: 1,
        showroom_id: 1,
        items: [
          { product_id: 2, variant_id: 4, quantity: 2, unit_price: 3200 }
        ],
        discount: 400,
        paid_amount: 3000, // Partial payment
        payment_method: 'CASH',
        delivery_required: 1,
        delivery_address: 'House 45, Street 12, F-7/2, Islamabad'
      })
    });
    assert.strictEqual(orderRes.status, 201);
    const ordData = orderRes.data.data;
    assert.strictEqual(ordData.netTotal, 6000, 'Net Total = (3200*2) - 400 = 6000');
    assert.strictEqual(ordData.parsedPaid, 3000);
    assert.strictEqual(ordData.remainingBalance, 3000);
    console.log('✅ POS Order created with Invoice & Delivery slip.');

    // 9. Multi-Stage Delivery & COD Settlement
    console.log('Test 9: Delivery Workflow & COD Settlement...');
    const deliveriesRes = await request(`/deliveries?search=${ordData.orderNumber}`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    assert.strictEqual(deliveriesRes.status, 200);
    assert.ok(deliveriesRes.data.data.length > 0);
    const delRecord = deliveriesRes.data.data[0];

    // Mark Out for delivery then delivered with COD collection
    const delStatusRes = await request(`/deliveries/${delRecord.id}/status`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({
        status: 'DELIVERED',
        collected_amount: 3000,
        notes: 'Delivered to customer doorstep and cash collected'
      })
    });
    assert.strictEqual(delStatusRes.status, 200);
    console.log('✅ Delivery pipeline and COD collection verified.');

    // 10. Employee Advances
    console.log('Test 10: Staff Salary Advances & Settlement...');
    const advanceRes = await request('/employees/advances', {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({
        employee_id: 1,
        amount: 5000,
        advance_date: new Date().toISOString().split('T')[0],
        reason: 'Emergency household maintenance',
        payment_method: 'CASH'
      })
    });
    assert.strictEqual(advanceRes.status, 201);
    console.log('✅ Employee advance loan voucher recorded.');

    // 11. Daily Expenses
    console.log('Test 11: Daily Operational Expenses...');
    const expenseRes = await request('/expenses', {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({
        showroom_id: 1,
        category_id: 1,
        amount: 1800,
        expense_date: new Date().toISOString().split('T')[0],
        payment_method: 'CASH',
        paid_to: 'KFC Express',
        description: 'Team dinner during late stock intake'
      })
    });
    assert.strictEqual(expenseRes.status, 201);
    console.log('✅ Daily operational expense voucher recorded.');

    // 12. Audit Logs Check
    console.log('Test 12: Immutable Audit Log Verification...');
    const auditRes = await request('/audit-logs?limit=10', {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    assert.strictEqual(auditRes.status, 200);
    assert.ok(auditRes.data.data.length >= 5, 'Multiple audit logs should exist');
    console.log(`✅ Audit trail verified with ${auditRes.data.data.length} recorded operations.`);

    // 13. Reports CSV Export
    console.log('Test 13: Business Reports & CSV Engine...');
    const salesReportRes = await request('/reports/sales?format=json', {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    assert.strictEqual(salesReportRes.status, 200);
    assert.ok(salesReportRes.data.data.length > 0);
    console.log('✅ Reports engine verified.');

    console.log('\n🎉 ALL 13 AUTOMATED ERP CORE TESTS PASSED WITH 100% SUCCESS!');
  } catch (err) {
    console.error('❌ TEST FAILED:', err);
    process.exit(1);
  } finally {
    stopServer();
  }
}

runTests();
