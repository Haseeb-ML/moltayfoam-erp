// Payment Transactions & Financial Ledger Module

const PaymentsModule = {
  async load() {
    const container = document.getElementById('payments-content');
    if (!container) return;

    container.innerHTML = `
      <div class="state-loading">
        <div class="spinner"></div>
        <div class="state-title">Loading Payment Ledger...</div>
      </div>
    `;

    try {
      const showroomId = window.AppRouter.getCurrentShowroomId();
      const res = await API.get('/payments', { showroom_id: showroomId });
      this.render(res.data || [], container);
    } catch (err) {
      container.innerHTML = `
        <div class="state-error">
          <div class="state-icon">⚠️</div>
          <div class="state-title">Unable to load payments</div>
          <div class="state-desc">${err.message}</div>
        </div>
      `;
    }
  },

  render(payments, container) {
    const currency = 'PKR';
    container.innerHTML = `
      <div class="page-header">
        <div class="page-title-group">
          <h1>💳 Payment Transactions & Ledger</h1>
          <p>Auditable financial transaction history: counter advances, bank deposits, and courier COD collections</p>
        </div>
      </div>

      <div class="table-container">
        <div class="table-toolbar">
          <input type="text" class="form-control" placeholder="Search receipt #, customer, or reference..." style="max-width: 320px;" oninput="PaymentsModule.filterTable(this.value)" />
        </div>
        <div class="table-scroll">
          <table class="erp-table" id="payments-table">
            <thead>
              <tr>
                <th>Receipt #</th>
                <th>Showroom</th>
                <th>Customer</th>
                <th>Order / Reference</th>
                <th>Channel</th>
                <th>Amount</th>
                <th>Received By</th>
                <th>Date & Time</th>
                <th>Notes</th>
              </tr>
            </thead>
            <tbody>
              ${payments.length === 0 ? '<tr><td colspan="9" style="text-align: center; color: var(--text-muted); padding: 2rem;">No payment transactions recorded.</td></tr>' : ''}
              ${payments
                .map(
                  (p) => `
                <tr>
                  <td><strong>${p.receipt_number}</strong></td>
                  <td><span class="badge badge-info">${p.showroom_code}</span></td>
                  <td><strong>${p.customer_name}</strong> (${p.customer_phone})</td>
                  <td>${p.order_number ? `Order: ${p.order_number}` : p.custom_order_number ? `Custom: ${p.custom_order_number}` : 'Balance Credit'}</td>
                  <td>
                    <span class="badge ${p.payment_method === 'CASH' ? 'badge-success' : p.payment_method === 'COD' ? 'badge-warning' : 'badge-info'}">
                      ${p.payment_method}
                    </span>
                  </td>
                  <td><strong style="color: var(--status-success); font-size: 0.95rem;">${currency} ${Number(p.amount).toLocaleString()}</strong></td>
                  <td>${p.received_by_name}</td>
                  <td>${new Date(p.created_at).toLocaleString()}</td>
                  <td style="color: var(--text-secondary); font-size: 0.8rem;">${p.notes || '-'}</td>
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
    const rows = document.querySelectorAll('#payments-table tbody tr');
    const term = query.toLowerCase();
    rows.forEach((row) => {
      row.style.display = row.textContent.toLowerCase().includes(term) ? '' : 'none';
    });
  }
};

window.PaymentsModule = PaymentsModule;
