// Sales, POS Checkout & Invoicing Module

const SalesModule = {
  customers: [],
  products: [],
  cart: [],

  async load() {
    const container = document.getElementById('sales-content');
    if (!container) return;

    container.innerHTML = `
      <div class="state-loading">
        <div class="spinner"></div>
        <div class="state-title">Loading Showroom Orders...</div>
      </div>
    `;

    try {
      const showroomId = window.AppRouter.getCurrentShowroomId();
      const [ordersRes, custRes, prodRes] = await Promise.all([
        API.get('/orders', { showroom_id: showroomId }),
        API.get('/customers'),
        API.get('/products', { showroom_id: showroomId })
      ]);

      this.customers = custRes.data || [];
      this.products = prodRes.data || [];
      this.render(ordersRes.data || [], container);
    } catch (err) {
      container.innerHTML = `
        <div class="state-error">
          <div class="state-icon">⚠️</div>
          <div class="state-title">Unable to load orders</div>
          <div class="state-desc">${err.message}</div>
        </div>
      `;
    }
  },

  render(orders, container) {
    const currency = 'PKR';
    container.innerHTML = `
      <div class="page-header">
        <div class="page-title-group">
          <h1>🛍️ Showroom Sales & Orders</h1>
          <p>Create customer sales orders, generate invoices, and dispatch 1-2 hour deliveries</p>
        </div>
        <div class="page-actions">
          <button class="btn btn-primary" onclick="SalesModule.openCheckoutModal()">
            🛒 New POS Order / Sale
          </button>
        </div>
      </div>

      <!-- Orders Table -->
      <div class="table-container">
        <div class="table-toolbar">
          <div style="font-weight: 700; font-size: 1rem;">Sales Orders Register</div>
          <input type="text" class="form-control" placeholder="Search orders, invoices, or customer..." style="max-width: 280px;" oninput="SalesModule.filterTable(this.value)" />
        </div>
        <div class="table-scroll">
          <table class="erp-table" id="sales-table">
            <thead>
              <tr>
                <th>Order #</th>
                <th>Invoice #</th>
                <th>Showroom</th>
                <th>Customer</th>
                <th>Date & Time</th>
                <th>Net Total</th>
                <th>Paid</th>
                <th>Balance</th>
                <th>Payment</th>
                <th>Delivery</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              ${orders.length === 0 ? '<tr><td colspan="11" style="text-align: center; color: var(--text-muted); padding: 2rem;">No orders found.</td></tr>' : ''}
              ${orders
                .map(
                  (o) => `
                <tr>
                  <td><strong>${o.order_number}</strong></td>
                  <td>${o.invoice_number || '-'}</td>
                  <td><span class="badge badge-info">${o.showroom_code}</span></td>
                  <td>${o.customer_name}</td>
                  <td>${new Date(o.order_date).toLocaleString()}</td>
                  <td><strong>${currency} ${Number(o.net_total).toLocaleString()}</strong></td>
                  <td style="color: var(--status-success);">${currency} ${Number(o.paid_amount).toLocaleString()}</td>
                  <td style="color: ${o.remaining_balance > 0 ? 'var(--status-danger)' : 'var(--text-muted)'}; font-weight: 600;">
                    ${currency} ${Number(o.remaining_balance).toLocaleString()}
                  </td>
                  <td>
                    <span class="badge ${o.payment_status === 'PAID' ? 'badge-success' : o.payment_status === 'PARTIAL' ? 'badge-warning' : 'badge-danger'}">
                      ${o.payment_status}
                    </span>
                  </td>
                  <td>
                    <span class="badge ${o.delivery_current_status === 'DELIVERED' ? 'badge-success' : o.delivery_current_status === 'OUT_FOR_DELIVERY' ? 'badge-warning' : 'badge-info'}">
                      ${o.delivery_current_status || 'NOT_REQUIRED'}
                    </span>
                  </td>
                  <td>
                    <button class="btn btn-secondary btn-sm" onclick="SalesModule.viewOrder(${o.id})">
                      📄 Invoice
                    </button>
                  </td>
                </tr>
              `
                )
                .join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  },

  filterTable(query) {
    const rows = document.querySelectorAll('#sales-table tbody tr');
    const term = query.toLowerCase();
    rows.forEach((row) => {
      row.style.display = row.textContent.toLowerCase().includes(term) ? '' : 'none';
    });
  },

  openCheckoutModal() {
    this.cart = [];
    const modal = document.getElementById('common-modal');
    const title = document.getElementById('common-modal-title');
    const body = document.getElementById('common-modal-body');
    const footer = document.getElementById('common-modal-footer');

    title.textContent = '🛒 Point of Sale Checkout (New Order)';
    body.innerHTML = `
      <div class="form-row">
        <div class="form-group">
          <label class="form-label required">Customer</label>
          <select id="pos-customer-id" class="form-select" onchange="SalesModule.onCustomerChange(this.value)">
            <option value="">Select Existing Customer...</option>
            ${this.customers.map((c) => `<option value="${c.id}">${c.name} (${c.phone})</option>`).join('')}
            <option value="NEW">+ Register New Customer</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label required">Showroom</label>
          <select id="pos-showroom-id" class="form-select">
            <option value="1">Main Showroom - Blue Area</option>
            <option value="2">City Branch - Saddar</option>
          </select>
        </div>
      </div>

      <!-- Quick customer register block -->
      <div id="pos-new-cust" style="display: none; background: var(--bg-app); border: 1px solid var(--border-subtle); border-radius: var(--radius-md); padding: 0.85rem; margin-bottom: 1rem;">
        <div class="form-row">
          <div class="form-group" style="margin-bottom: 0.5rem;">
            <label class="form-label required">Name</label>
            <input type="text" id="pos-new-name" class="form-control" placeholder="Customer full name" />
          </div>
          <div class="form-group" style="margin-bottom: 0.5rem;">
            <label class="form-label required">Phone</label>
            <input type="text" id="pos-new-phone" class="form-control" placeholder="0300-1234567" />
          </div>
        </div>
        <div class="form-group" style="margin-bottom: 0;">
          <label class="form-label">Address</label>
          <input type="text" id="pos-new-addr" class="form-control" placeholder="House / Street, Area, City" />
        </div>
      </div>

      <!-- Item Selector -->
      <div style="background: var(--bg-app); border: 1px solid var(--border-subtle); border-radius: var(--radius-md); padding: 1rem; margin-bottom: 1rem;">
        <div style="font-weight: 700; font-size: 0.9rem; margin-bottom: 0.5rem;">Add Product to Cart</div>
        <div style="display: grid; grid-template-columns: 2fr 1.5fr 1fr auto; gap: 0.5rem; align-items: end;">
          <div class="form-group" style="margin: 0;">
            <label class="form-label" style="font-size: 0.75rem;">Select Product</label>
            <select id="pos-prod-select" class="form-select" onchange="SalesModule.onProductSelect(this.value)">
              <option value="">Choose Product...</option>
              ${this.products.map((p) => `<option value="${p.id}">${p.name} (Stock: ${p.current_stock})</option>`).join('')}
            </select>
          </div>
          <div class="form-group" style="margin: 0;">
            <label class="form-label" style="font-size: 0.75rem;">Size / Variant</label>
            <select id="pos-var-select" class="form-select">
              <option value="">Standard</option>
            </select>
          </div>
          <div class="form-group" style="margin: 0;">
            <label class="form-label" style="font-size: 0.75rem;">Quantity</label>
            <input type="number" id="pos-qty-input" class="form-control" min="1" value="1" />
          </div>
          <button type="button" class="btn btn-primary" onclick="SalesModule.addItemToCart()">+ Add</button>
        </div>
      </div>

      <!-- Cart Table -->
      <div style="margin-bottom: 1rem;">
        <table class="erp-table" style="font-size: 0.82rem;">
          <thead>
            <tr>
              <th>Item</th>
              <th>Variant</th>
              <th>Price</th>
              <th>Qty</th>
              <th>Subtotal</th>
              <th></th>
            </tr>
          </thead>
          <tbody id="pos-cart-tbody">
            <tr><td colspan="6" style="text-align: center; color: var(--text-muted); padding: 1.5rem;">Cart is empty. Add products above.</td></tr>
          </tbody>
        </table>
      </div>

      <!-- Financial Calculation Block -->
      <div class="form-row" style="align-items: center; background: var(--bg-card-hover); padding: 1rem; border-radius: var(--radius-md); margin-bottom: 1rem;">
        <div>
          <label class="form-label">Order Discount (PKR)</label>
          <input type="number" id="pos-discount" class="form-control" min="0" value="0" oninput="SalesModule.recalcCheckout()" />
        </div>
        <div>
          <div style="font-size: 0.75rem; color: var(--text-muted); text-transform: uppercase; font-weight: 700;">Net Payable</div>
          <div style="font-size: 1.4rem; font-weight: 800; color: var(--text-primary);" id="pos-net-total">PKR 0</div>
        </div>
        <div>
          <label class="form-label">Payment Received (PKR)</label>
          <input type="number" id="pos-paid" class="form-control" min="0" value="0" oninput="SalesModule.recalcCheckout()" />
        </div>
        <div>
          <div style="font-size: 0.75rem; color: var(--text-muted); text-transform: uppercase; font-weight: 700;">Remaining Balance</div>
          <div style="font-size: 1.4rem; font-weight: 800; color: var(--status-danger);" id="pos-balance">PKR 0</div>
        </div>
      </div>

      <!-- Payment & Delivery Details -->
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Payment Channel</label>
          <select id="pos-pay-method" class="form-select">
            <option value="CASH">Cash Counter</option>
            <option value="BANK_TRANSFER">Bank Transfer / Online</option>
            <option value="COD">Cash on Delivery (Collect at Doorstep)</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Require Delivery?</label>
          <select id="pos-deliv-required" class="form-select" onchange="document.getElementById('pos-deliv-block').style.display = this.value === '1' ? 'block' : 'none';">
            <option value="1">Yes (Schedule Showroom Delivery)</option>
            <option value="0">No (Customer Carry Takeaway)</option>
          </select>
        </div>
      </div>

      <div id="pos-deliv-block" class="form-group">
        <label class="form-label">Delivery Destination Address</label>
        <input type="text" id="pos-deliv-addr" class="form-control" placeholder="House / Street, Area, City" />
      </div>
    `;

    footer.innerHTML = `
      <button class="btn btn-secondary" onclick="window.AppRouter.closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="SalesModule.submitOrder()">🧾 Confirm Order & Issue Invoice</button>
    `;

    window.AppRouter.openModal();
  },

  onCustomerChange(val) {
    const box = document.getElementById('pos-new-cust');
    if (box) box.style.display = val === 'NEW' ? 'block' : 'none';

    // Auto-fill delivery address if existing customer
    if (val && val !== 'NEW') {
      const cust = this.customers.find((c) => c.id === parseInt(val, 10));
      if (cust && cust.address) {
        const addrInput = document.getElementById('pos-deliv-addr');
        if (addrInput) addrInput.value = cust.address;
      }
    }
  },

  onProductSelect(val) {
    const varSelect = document.getElementById('pos-var-select');
    if (!varSelect) return;
    varSelect.innerHTML = '<option value="">Standard Size</option>';

    const prod = this.products.find((p) => p.id === parseInt(val, 10));
    if (prod && prod.variants) {
      for (const v of prod.variants) {
        varSelect.innerHTML += `<option value="${v.id}">${v.variant_name} (PKR ${v.selling_price})</option>`;
      }
    }
  },

  addItemToCart() {
    const prodId = parseInt(document.getElementById('pos-prod-select').value, 10);
    const varId = parseInt(document.getElementById('pos-var-select').value, 10) || null;
    const qty = parseInt(document.getElementById('pos-qty-input').value, 10) || 1;

    if (!prodId) return window.showToast('Please choose a product.', 'error');

    const prod = this.products.find((p) => p.id === prodId);
    if (!prod) return;

    let variantName = 'Standard';
    let price = prod.selling_price;

    if (varId && prod.variants) {
      const v = prod.variants.find((x) => x.id === varId);
      if (v) {
        variantName = v.variant_name;
        price = v.selling_price || prod.selling_price;
      }
    }

    this.cart.push({
      product_id: prodId,
      product_name: prod.name,
      variant_id: varId,
      variant_name: variantName,
      quantity: qty,
      unit_price: price
    });

    this.renderCart();
  },

  removeCartItem(idx) {
    this.cart.splice(idx, 1);
    this.renderCart();
  },

  renderCart() {
    const tbody = document.getElementById('pos-cart-tbody');
    if (!tbody) return;

    if (this.cart.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; color: var(--text-muted); padding: 1.5rem;">Cart is empty. Add products above.</td></tr>';
      this.recalcCheckout();
      return;
    }

    tbody.innerHTML = this.cart
      .map(
        (itm, idx) => `
      <tr>
        <td><strong>${itm.product_name}</strong></td>
        <td>${itm.variant_name}</td>
        <td>PKR ${Number(itm.unit_price).toLocaleString()}</td>
        <td>${itm.quantity}</td>
        <td><strong>PKR ${Number(itm.quantity * itm.unit_price).toLocaleString()}</strong></td>
        <td><button class="btn btn-danger btn-sm" onclick="SalesModule.removeCartItem(${idx})">✕</button></td>
      </tr>
    `
      )
      .join('');

    this.recalcCheckout();
  },

  recalcCheckout() {
    let subtotal = 0;
    for (const itm of this.cart) {
      subtotal += itm.quantity * itm.unit_price;
    }

    const discount = parseFloat(document.getElementById('pos-discount').value) || 0;
    const netTotal = Math.max(0, subtotal - discount);

    const paidInput = document.getElementById('pos-paid');
    let paid = parseFloat(paidInput.value) || 0;
    if (paid > netTotal) {
      paid = netTotal;
      paidInput.value = netTotal;
    }

    const balance = Math.max(0, netTotal - paid);

    const netEl = document.getElementById('pos-net-total');
    const balEl = document.getElementById('pos-balance');
    if (netEl) netEl.textContent = `PKR ${netTotal.toLocaleString()}`;
    if (balEl) balEl.textContent = `PKR ${balance.toLocaleString()}`;
  },

  async submitOrder() {
    if (this.cart.length === 0) {
      return window.showToast('Please add at least one product to the cart.', 'error');
    }

    const custSelect = document.getElementById('pos-customer-id').value;
    const showroomId = document.getElementById('pos-showroom-id').value;
    const discount = parseFloat(document.getElementById('pos-discount').value) || 0;
    const paidAmount = parseFloat(document.getElementById('pos-paid').value) || 0;
    const paymentMethod = document.getElementById('pos-pay-method').value;
    const deliveryRequired = parseInt(document.getElementById('pos-deliv-required').value, 10);
    const delivAddr = document.getElementById('pos-deliv-addr').value.trim();

    const payload = {
      showroom_id: showroomId,
      items: this.cart,
      discount,
      paid_amount: paidAmount,
      payment_method: paymentMethod,
      delivery_required: deliveryRequired,
      delivery_address: delivAddr
    };

    if (custSelect === 'NEW') {
      const name = document.getElementById('pos-new-name').value.trim();
      const phone = document.getElementById('pos-new-phone').value.trim();
      const address = document.getElementById('pos-new-addr').value.trim();
      if (!name || !phone) {
        return window.showToast('Customer name and phone are required.', 'error');
      }
      payload.customer_data = { name, phone, address };
      payload.delivery_address = delivAddr || address;
    } else if (custSelect) {
      payload.customer_id = custSelect;
    } else {
      return window.showToast('Please select or register a customer.', 'error');
    }

    try {
      const res = await API.post('/orders', payload);
      if (res.success) {
        window.showToast(`Order ${res.data.orderNumber} created successfully!`, 'success');
        window.AppRouter.closeModal();
        this.load();
        this.viewOrder(res.data.orderId);
      }
    } catch (err) {
      window.showToast(err.message, 'error');
    }
  },

  async viewOrder(orderId) {
    try {
      const res = await API.get(`/orders/${orderId}`);
      if (res.success) {
        const o = res.data;
        const modal = document.getElementById('common-modal');
        const title = document.getElementById('common-modal-title');
        const body = document.getElementById('common-modal-body');
        const footer = document.getElementById('common-modal-footer');

        title.textContent = `Invoice: ${o.invoice_number || o.order_number}`;
        body.innerHTML = `
          <div class="printable-invoice">
            <div class="invoice-brand" style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 1.5rem; border-bottom: 2px solid var(--border-subtle); padding-bottom: 1rem;">
              <div style="display: flex; align-items: center; gap: 0.85rem;">
                <img src="img/moltyfoam-icon.svg" alt="Master MoltyFoam" style="width: 52px; height: 52px; border-radius: 12px; box-shadow: 0 2px 8px rgba(0,0,0,0.15);" />
                <div>
                  <div style="display: flex; align-items: center; gap: 5px;">
                    <span style="color: #fff; background: #d90429; font-weight: 900; font-size: 0.72rem; padding: 2px 5px; border-radius: 3px; letter-spacing: 1px;">MASTER</span>
                    <span style="font-size: 1.35rem; font-weight: 900; color: #0056b3;">Molty<span style="color: #fdb813;">Foam</span></span>
                  </div>
                  <div style="font-size: 0.8rem; font-weight: 800; color: #10b981; margin: 2px 0;">★ AUTHORIZED DEALERSHIP & MATTRESS GALLERY</div>
                  <div style="font-size: 0.82rem; color: var(--text-secondary);">${o.showroom_name} (${o.showroom_code})</div>
                  <div style="font-size: 0.78rem; color: var(--text-muted);">${o.showroom_address} | Phone: ${o.showroom_phone}</div>
                </div>
              </div>
              <div style="text-align: right;">
                <div style="font-size: 1.25rem; font-weight: 900; color: #0056b3; letter-spacing: 0.5px;">OFFICIAL RETAIL INVOICE</div>
                <div style="font-size: 0.88rem;"><strong>Invoice #:</strong> ${o.invoice_number || '-'}</div>
                <div style="font-size: 0.88rem;"><strong>Order #:</strong> ${o.order_number}</div>
                <div style="font-size: 0.85rem;"><strong>Date:</strong> ${new Date(o.order_date).toLocaleDateString()}</div>
                <div style="margin-top: 4px;"><span class="warranty-tag">✔ Official Warranty Certified</span></div>
              </div>
            </div>

            <div class="invoice-meta-grid" style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-bottom: 1.5rem; background: var(--bg-app); padding: 1rem; border-radius: var(--radius-md);">
              <div>
                <div style="font-size: 0.75rem; text-transform: uppercase; font-weight: 700; color: var(--text-muted);">Billed To</div>
                <div style="font-size: 1rem; font-weight: 700;">${o.customer_name}</div>
                <div style="font-size: 0.88rem;">Phone: ${o.customer_phone}</div>
                <div style="font-size: 0.88rem;">${o.delivery_address || o.customer_default_address || 'Showroom Pickup'}</div>
              </div>
              <div>
                <div style="font-size: 0.75rem; text-transform: uppercase; font-weight: 700; color: var(--text-muted);">Order Information</div>
                <div style="font-size: 0.88rem;">Salesman: <strong>${o.salesman_name}</strong></div>
                <div style="font-size: 0.88rem;">Payment Status: <span class="badge ${o.payment_status === 'PAID' ? 'badge-success' : 'badge-warning'}">${o.payment_status}</span></div>
                <div style="font-size: 0.88rem;">Delivery Status: <span class="badge badge-info">${o.delivery_status}</span></div>
              </div>
            </div>

            <table class="erp-table" style="margin-bottom: 1.5rem;">
              <thead>
                <tr>
                  <th>Product Description</th>
                  <th>Variant / Size</th>
                  <th>Unit Price</th>
                  <th>Qty</th>
                  <th>Subtotal</th>
                </tr>
              </thead>
              <tbody>
                ${(o.items || [])
                  .map(
                    (itm) => `
                  <tr>
                    <td><strong>${itm.product_name}</strong> (${itm.product_sku})</td>
                    <td>${itm.variant_name || 'Standard'}</td>
                    <td>PKR ${Number(itm.unit_price).toLocaleString()}</td>
                    <td>${itm.quantity}</td>
                    <td><strong>PKR ${Number(itm.subtotal).toLocaleString()}</strong></td>
                  </tr>
                `
                  )
                  .join('')}
              </tbody>
            </table>

            <div style="display: flex; justify-content: flex-end;">
              <table class="invoice-summary-table" style="width: 320px; font-size: 0.95rem;">
                <tr>
                  <td>Subtotal:</td>
                  <td style="text-align: right;"><strong>PKR ${Number(o.subtotal).toLocaleString()}</strong></td>
                </tr>
                <tr>
                  <td>Discount:</td>
                  <td style="text-align: right; color: var(--status-danger);">-PKR ${Number(o.discount).toLocaleString()}</td>
                </tr>
                <tr class="total-row" style="border-top: 2px solid var(--border-strong); font-size: 1.15rem;">
                  <td>Net Total:</td>
                  <td style="text-align: right;"><strong>PKR ${Number(o.net_total).toLocaleString()}</strong></td>
                </tr>
                <tr>
                  <td>Paid Amount:</td>
                  <td style="text-align: right; color: var(--status-success);">PKR ${Number(o.paid_amount).toLocaleString()}</td>
                </tr>
                <tr style="font-weight: 700;">
                  <td>Remaining Balance:</td>
                  <td style="text-align: right; color: ${o.remaining_balance > 0 ? 'var(--status-danger)' : 'var(--text-muted)'};">PKR ${Number(o.remaining_balance).toLocaleString()}</td>
                </tr>
              </table>
            </div>

            <div class="invoice-signatures" style="display: flex; justify-content: space-between; margin-top: 3rem; padding-top: 1rem;">
              <div class="sign-line">Customer Signature</div>
              <div class="sign-line">Authorized Cashier Stamp</div>
            </div>
          </div>
        `;

        footer.innerHTML = `
          <button class="btn btn-secondary" onclick="window.print()">🖨️ Print Invoice (A4 / Thermal)</button>
          <button class="btn btn-primary" onclick="window.AppRouter.closeModal()">Close</button>
        `;

        window.AppRouter.openModal();
      }
    } catch (err) {
      window.showToast(err.message, 'error');
    }
  }
};

window.SalesModule = SalesModule;
