// Customer Directory & 360-Degree Ledger Module

const CustomersModule = {
  async load() {
    const container = document.getElementById('customers-content');
    if (!container) return;

    container.innerHTML = `
      <div class="state-loading">
        <div class="spinner"></div>
        <div class="state-title">Loading Customer Directory...</div>
      </div>
    `;

    try {
      const res = await API.get('/customers');
      this.render(res.data || [], container);
    } catch (err) {
      container.innerHTML = `
        <div class="state-error">
          <div class="state-icon">⚠️</div>
          <div class="state-title">Unable to load customers</div>
          <div class="state-desc">${err.message}</div>
        </div>
      `;
    }
  },

  render(customers, container) {
    const currency = 'PKR';
    container.innerHTML = `
      <div class="page-header">
        <div class="page-title-group">
          <h1>👥 Customer Master & Ledgers</h1>
          <p>Complete customer profiles, lifetime purchases, and live outstanding receivables</p>
        </div>
        <div class="page-actions">
          <button class="btn btn-primary" onclick="CustomersModule.openCreateModal()">
            + Register Customer
          </button>
        </div>
      </div>

      <!-- Customers Table -->
      <div class="table-container">
        <div class="table-toolbar">
          <input type="text" class="form-control" placeholder="Search by name, phone or customer ID..." style="max-width: 320px;" oninput="CustomersModule.filterTable(this.value)" />
        </div>
        <div class="table-scroll">
          <table class="erp-table" id="customers-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Customer Name</th>
                <th>Mobile Phone</th>
                <th>Address</th>
                <th>Total Orders</th>
                <th>Lifetime Spent</th>
                <th>Outstanding Balance</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              ${customers.length === 0 ? '<tr><td colspan="8" style="text-align: center; color: var(--text-muted); padding: 2rem;">No customer records found.</td></tr>' : ''}
              ${customers
                .map((c) => {
                  const hasBal = c.outstanding_balance > 0;
                  return `
                <tr>
                  <td>#${c.id}</td>
                  <td><strong>${c.name}</strong></td>
                  <td>${c.phone}</td>
                  <td style="color: var(--text-secondary); max-width: 220px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                    ${c.address || '-'}
                  </td>
                  <td>${c.order_count + (c.custom_order_count || 0)}</td>
                  <td>${currency} ${Number(c.total_spent).toLocaleString()}</td>
                  <td>
                    <strong style="color: ${hasBal ? 'var(--status-danger)' : 'var(--text-muted)'};">
                      ${currency} ${Number(c.outstanding_balance).toLocaleString()}
                    </strong>
                  </td>
                  <td>
                    <div style="display: flex; gap: 0.35rem;">
                      <button class="btn btn-secondary btn-sm" onclick="CustomersModule.viewLedger(${c.id})">
                        🔍 360 Ledger
                      </button>
                      ${hasBal ? `<button class="btn btn-success btn-sm" onclick="CustomersModule.openPayModal(${c.id}, '${c.name.replace(/'/g, "\\'")}', ${c.outstanding_balance})">💵 Receive</button>` : ''}
                    </div>
                  </td>
                </tr>
              `;
                })
                .join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  },

  filterTable(query) {
    const rows = document.querySelectorAll('#customers-table tbody tr');
    const term = query.toLowerCase();
    rows.forEach((row) => {
      row.style.display = row.textContent.toLowerCase().includes(term) ? '' : 'none';
    });
  },

  openCreateModal() {
    const modal = document.getElementById('common-modal');
    const title = document.getElementById('common-modal-title');
    const body = document.getElementById('common-modal-body');
    const footer = document.getElementById('common-modal-footer');

    title.textContent = '👥 Register New Customer';
    body.innerHTML = `
      <div class="form-group">
        <label class="form-label required">Customer Full Name</label>
        <input type="text" id="cust-name" class="form-control" placeholder="e.g. Tariq Mehmood" required />
      </div>
      <div class="form-group">
        <label class="form-label required">Mobile Phone Number</label>
        <input type="text" id="cust-phone" class="form-control" placeholder="0300-1234567" required />
      </div>
      <div class="form-group">
        <label class="form-label">Delivery Address</label>
        <input type="text" id="cust-addr" class="form-control" placeholder="House #, Street #, Sector/Area, City" />
      </div>
      <div class="form-group">
        <label class="form-label">Customer Profile Notes</label>
        <input type="text" id="cust-notes" class="form-control" placeholder="e.g. VIP client, preferred courier delivery" />
      </div>
    `;

    footer.innerHTML = `
      <button class="btn btn-secondary" onclick="window.AppRouter.closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="CustomersModule.submitCustomer()">Save Customer</button>
    `;

    window.AppRouter.openModal();
  },

  async submitCustomer() {
    const name = document.getElementById('cust-name').value.trim();
    const phone = document.getElementById('cust-phone').value.trim();
    const address = document.getElementById('cust-addr').value.trim();
    const notes = document.getElementById('cust-notes').value.trim();

    if (!name || !phone) {
      return window.showToast('Customer name and phone number are required.', 'error');
    }

    try {
      const res = await API.post('/customers', { name, phone, address, notes });
      if (res.success) {
        window.showToast(res.message || 'Customer registered successfully.', 'success');
        window.AppRouter.closeModal();
        this.load();
      }
    } catch (err) {
      window.showToast(err.message, 'error');
    }
  },

  async viewLedger(customerId) {
    try {
      const res = await API.get(`/customers/${customerId}`);
      if (res.success) {
        const d = res.data;
        const c = d.customer;
        const modal = document.getElementById('common-modal');
        const title = document.getElementById('common-modal-title');
        const body = document.getElementById('common-modal-body');
        const footer = document.getElementById('common-modal-footer');

        title.textContent = `Customer 360 Ledger: ${c.name}`;
        body.innerHTML = `
          <!-- Customer Profile Summary -->
          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 1rem; background: var(--bg-app); border-radius: var(--radius-md); padding: 1rem; margin-bottom: 1.5rem;">
            <div>
              <span style="font-size: 0.75rem; color: var(--text-muted); text-transform: uppercase; font-weight: 700;">Customer Info</span>
              <div style="font-weight: 700;">${c.name}</div>
              <div style="font-size: 0.85rem;">📞 ${c.phone}</div>
              <div style="font-size: 0.8rem; color: var(--text-secondary);">${c.address || 'No address on file'}</div>
            </div>
            <div>
              <span style="font-size: 0.75rem; color: var(--text-muted); text-transform: uppercase; font-weight: 700;">Lifetime Spent</span>
              <div style="font-size: 1.25rem; font-weight: 800; color: var(--text-primary);">PKR ${Number(c.total_spent).toLocaleString()}</div>
              <div style="font-size: 0.8rem;">${d.orders.length} Orders (${d.customOrders.length} Custom)</div>
            </div>
            <div>
              <span style="font-size: 0.75rem; color: var(--text-muted); text-transform: uppercase; font-weight: 700;">Outstanding Balance</span>
              <div style="font-size: 1.35rem; font-weight: 800; color: ${c.outstanding_balance > 0 ? 'var(--status-danger)' : 'var(--status-success)'};">
                PKR ${Number(c.outstanding_balance).toLocaleString()}
              </div>
              <div style="font-size: 0.8rem; color: var(--text-muted);">${c.outstanding_balance > 0 ? 'Payment Pending' : 'Account Cleared'}</div>
            </div>
          </div>

          <!-- Orders History -->
          <div style="margin-bottom: 1.5rem;">
            <div style="font-weight: 700; font-size: 0.95rem; margin-bottom: 0.5rem;">🛍️ Sales Orders History</div>
            <table class="erp-table" style="font-size: 0.8rem;">
              <thead>
                <tr>
                  <th>Order #</th>
                  <th>Showroom</th>
                  <th>Date</th>
                  <th>Net Total</th>
                  <th>Paid</th>
                  <th>Balance</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                ${d.orders.length === 0 ? '<tr><td colspan="7" style="text-align: center; color: var(--text-muted);">No sales orders recorded.</td></tr>' : ''}
                ${d.orders
                  .map(
                    (o) => `
                  <tr>
                    <td><strong>${o.order_number}</strong></td>
                    <td>${o.showroom_code}</td>
                    <td>${new Date(o.order_date).toLocaleDateString()}</td>
                    <td>PKR ${Number(o.net_total).toLocaleString()}</td>
                    <td style="color: var(--status-success);">PKR ${Number(o.paid_amount).toLocaleString()}</td>
                    <td style="color: ${o.remaining_balance > 0 ? 'var(--status-danger)' : 'var(--text-muted)'};">PKR ${Number(o.remaining_balance).toLocaleString()}</td>
                    <td><span class="badge badge-info">${o.order_status}</span></td>
                  </tr>
                `
                  )
                  .join('')}
              </tbody>
            </table>
          </div>

          <!-- Custom Orders History -->
          <div style="margin-bottom: 1.5rem;">
            <div style="font-weight: 700; font-size: 0.95rem; margin-bottom: 0.5rem;">✨ Make-To-Order Custom Items</div>
            <table class="erp-table" style="font-size: 0.8rem;">
              <thead>
                <tr>
                  <th>Custom Order #</th>
                  <th>Item</th>
                  <th>Specification</th>
                  <th>Sale Value</th>
                  <th>Paid</th>
                  <th>Balance</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                ${d.customOrders.length === 0 ? '<tr><td colspan="7" style="text-align: center; color: var(--text-muted);">No custom orders recorded.</td></tr>' : ''}
                ${d.customOrders
                  .map(
                    (co) => `
                  <tr>
                    <td><strong>${co.custom_order_number}</strong></td>
                    <td>${co.item_description}</td>
                    <td>${co.size_specification}</td>
                    <td>PKR ${Number(co.total_sale).toLocaleString()}</td>
                    <td style="color: var(--status-success);">PKR ${Number(co.paid_amount).toLocaleString()}</td>
                    <td style="color: ${co.remaining_balance > 0 ? 'var(--status-danger)' : 'var(--text-muted)'};">PKR ${Number(co.remaining_balance).toLocaleString()}</td>
                    <td><span class="badge badge-purple">${co.status}</span></td>
                  </tr>
                `
                  )
                  .join('')}
              </tbody>
            </table>
          </div>

          <!-- Payment History -->
          <div>
            <div style="font-weight: 700; font-size: 0.95rem; margin-bottom: 0.5rem;">💵 Payment Receipts History</div>
            <table class="erp-table" style="font-size: 0.8rem;">
              <thead>
                <tr>
                  <th>Receipt #</th>
                  <th>Date & Time</th>
                  <th>Channel</th>
                  <th>Amount</th>
                  <th>Received By</th>
                </tr>
              </thead>
              <tbody>
                ${d.payments.length === 0 ? '<tr><td colspan="5" style="text-align: center; color: var(--text-muted);">No payments recorded yet.</td></tr>' : ''}
                ${d.payments
                  .map(
                    (p) => `
                  <tr>
                    <td><strong>${p.receipt_number}</strong></td>
                    <td>${new Date(p.created_at).toLocaleString()}</td>
                    <td><span class="badge badge-success">${p.payment_method}</span></td>
                    <td><strong>PKR ${Number(p.amount).toLocaleString()}</strong></td>
                    <td>${p.received_by_name}</td>
                  </tr>
                `
                  )
                  .join('')}
              </tbody>
            </table>
          </div>
        `;

        footer.innerHTML = `
          <button class="btn btn-secondary" onclick="window.print()">🖨️ Print Customer Statement</button>
          <button class="btn btn-primary" onclick="window.AppRouter.closeModal()">Close</button>
        `;

        window.AppRouter.openModal();
      }
    } catch (err) {
      window.showToast(err.message, 'error');
    }
  },

  openPayModal(customerId, customerName, currentBalance) {
    const modal = document.getElementById('common-modal');
    const title = document.getElementById('common-modal-title');
    const body = document.getElementById('common-modal-body');
    const footer = document.getElementById('common-modal-footer');

    title.textContent = `💵 Receive Payment from ${customerName}`;
    body.innerHTML = `
      <div style="background: var(--bg-app); border-radius: var(--radius-md); padding: 1rem; margin-bottom: 1rem;">
        <div style="font-size: 0.85rem; color: var(--text-muted);">Current Outstanding Balance</div>
        <div style="font-size: 1.5rem; font-weight: 800; color: var(--status-danger);">PKR ${Number(currentBalance).toLocaleString()}</div>
      </div>

      <div class="form-group">
        <label class="form-label required">Payment Amount (PKR)</label>
        <input type="number" id="pay-amount" class="form-control" min="1" max="${currentBalance}" value="${currentBalance}" required />
      </div>

      <div class="form-group">
        <label class="form-label required">Payment Channel</label>
        <select id="pay-method" class="form-select">
          <option value="CASH">Cash Counter</option>
          <option value="BANK_TRANSFER">Bank Transfer / Online</option>
          <option value="CHEQUE">Cheque</option>
        </select>
      </div>

      <div class="form-group">
        <label class="form-label">Reference / Slip Number</label>
        <input type="text" id="pay-ref" class="form-control" placeholder="e.g. Cash Voucher # 99 or Bank Trans ID" />
      </div>
    `;

    footer.innerHTML = `
      <button class="btn btn-secondary" onclick="window.AppRouter.closeModal()">Cancel</button>
      <button class="btn btn-success" onclick="CustomersModule.submitPayment(${customerId})">Post Payment Receipt</button>
    `;

    window.AppRouter.openModal();
  },

  async submitPayment(customerId) {
    const amount = parseFloat(document.getElementById('pay-amount').value);
    const method = document.getElementById('pay-method').value;
    const ref = document.getElementById('pay-ref').value.trim();

    if (!amount || amount <= 0) {
      return window.showToast('Please enter a valid payment amount.', 'error');
    }

    try {
      const res = await API.post('/payments', {
        customer_id: customerId,
        amount,
        payment_method: method,
        reference_number: ref
      });

      if (res.success) {
        window.showToast(res.message || 'Payment recorded successfully.', 'success');
        window.AppRouter.closeModal();
        this.load();
      }
    } catch (err) {
      window.showToast(err.message, 'error');
    }
  }
};

window.CustomersModule = CustomersModule;
