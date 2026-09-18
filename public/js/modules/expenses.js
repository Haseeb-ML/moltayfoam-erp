// Daily Showroom Operational Expenses Module

const ExpensesModule = {
  categories: [],

  async load() {
    const container = document.getElementById('expenses-content');
    if (!container) return;

    container.innerHTML = `
      <div class="state-loading">
        <div class="spinner"></div>
        <div class="state-title">Loading Showroom Expenses...</div>
      </div>
    `;

    try {
      const showroomId = window.AppRouter.getCurrentShowroomId();
      const [expRes, catRes, sumRes] = await Promise.all([
        API.get('/expenses', { showroom_id: showroomId }),
        API.get('/expenses/categories'),
        API.get('/expenses/summary', { showroom_id: showroomId })
      ]);

      this.categories = catRes.data || [];
      this.render(expRes.data || [], sumRes.data || {}, container);
    } catch (err) {
      container.innerHTML = `
        <div class="state-error">
          <div class="state-icon">⚠️</div>
          <div class="state-title">Unable to load expenses</div>
          <div class="state-desc">${err.message}</div>
        </div>
      `;
    }
  },

  render(expenses, summary, container) {
    const currency = 'PKR';
    const totalExp = summary.total || 0;
    const catList = summary.byCategory || [];

    container.innerHTML = `
      <div class="page-header">
        <div class="page-title-group">
          <h1>🧾 Daily Showroom Operational Expenses</h1>
          <p>Record and categorize daily showroom expenses: meals, utilities, packaging, transport, and supplies</p>
        </div>
        <div class="page-actions">
          <button class="btn btn-primary" onclick="ExpensesModule.openCreateModal()">
            + Record Daily Expense
          </button>
        </div>
      </div>

      <!-- Expense Category Breakdown Cards -->
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem; margin-bottom: 1.5rem;">
        <div class="kpi-card" style="border-left: 4px solid var(--status-danger);">
          <div class="kpi-details">
            <div class="kpi-label">Total Expenses</div>
            <div class="kpi-value">${currency} ${Number(totalExp).toLocaleString()}</div>
            <div class="kpi-subtext">${expenses.length} Vouchers Recorded</div>
          </div>
        </div>

        ${catList.slice(0, 3).map((c) => `
          <div class="kpi-card">
            <div class="kpi-details">
              <div class="kpi-label">${c.category_name}</div>
              <div class="kpi-value">${currency} ${Number(c.total_amount).toLocaleString()}</div>
              <div class="kpi-subtext">${c.transaction_count} Entries</div>
            </div>
          </div>
        `).join('')}
      </div>

      <!-- Expenses Table -->
      <div class="table-container">
        <div class="table-toolbar">
          <input type="text" class="form-control" placeholder="Search expense description, voucher # or paid to..." style="max-width: 320px;" oninput="ExpensesModule.filterTable(this.value)" />
        </div>
        <div class="table-scroll">
          <table class="erp-table" id="expenses-table">
            <thead>
              <tr>
                <th>Voucher #</th>
                <th>Expense Date</th>
                <th>Showroom</th>
                <th>Category</th>
                <th>Amount</th>
                <th>Payment Channel</th>
                <th>Paid To / Vendor</th>
                <th>Description</th>
                <th>Recorded By</th>
              </tr>
            </thead>
            <tbody>
              ${expenses.length === 0 ? '<tr><td colspan="9" style="text-align: center; color: var(--text-muted); padding: 2rem;">No expenses recorded.</td></tr>' : ''}
              ${expenses.map((e) => `
                <tr>
                  <td><strong>${e.voucher_number}</strong></td>
                  <td>${e.expense_date}</td>
                  <td><span class="badge badge-info">${e.showroom_code}</span></td>
                  <td><span class="badge badge-purple">${e.category_name}</span></td>
                  <td><strong style="color: var(--status-danger);">${currency} ${Number(e.amount).toLocaleString()}</strong></td>
                  <td>${e.payment_method}</td>
                  <td>${e.paid_to || '-'}</td>
                  <td>${e.description}</td>
                  <td>${e.created_by_name}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  },

  filterTable(query) {
    const rows = document.querySelectorAll('#expenses-table tbody tr');
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

    title.textContent = '🧾 Record Daily Showroom Expense';
    body.innerHTML = `
      <div class="form-row">
        <div class="form-group">
          <label class="form-label required">Showroom</label>
          <select id="exp-showroom-id" class="form-select">
            <option value="1">Main Showroom - Blue Area</option>
            <option value="2">City Branch - Saddar</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label required">Expense Category</label>
          <select id="exp-category-id" class="form-select" required>
            <option value="">Select Category...</option>
            ${this.categories.map((c) => `<option value="${c.id}">${c.name}</option>`).join('')}
          </select>
        </div>
      </div>

      <div class="form-row">
        <div class="form-group">
          <label class="form-label required">Amount (PKR)</label>
          <input type="number" id="exp-amount" class="form-control" min="1" placeholder="e.g. 1500" required />
        </div>
        <div class="form-group">
          <label class="form-label required">Expense Date</label>
          <input type="date" id="exp-date" class="form-control" value="${new Date().toISOString().split('T')[0]}" required />
        </div>
      </div>

      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Payment Channel</label>
          <select id="exp-method" class="form-select">
            <option value="CASH">Showroom Petty Cash</option>
            <option value="BANK_TRANSFER">Bank Account</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Paid To / Vendor Name</label>
          <input type="text" id="exp-paid-to" class="form-control" placeholder="e.g. PSO Station / Tea Stall / Al-Madina Print" />
        </div>
      </div>

      <div class="form-group">
        <label class="form-label required">Expense Purpose / Description</label>
        <textarea id="exp-desc" class="form-control" rows="2" placeholder="e.g. Staff refreshments and tea for afternoon shift" required></textarea>
      </div>
    `;

    footer.innerHTML = `
      <button class="btn btn-secondary" onclick="window.AppRouter.closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="ExpensesModule.submitExpense()">Save Expense Voucher</button>
    `;

    window.AppRouter.openModal();
  },

  async submitExpense() {
    const showroomId = document.getElementById('exp-showroom-id').value;
    const categoryId = document.getElementById('exp-category-id').value;
    const amount = document.getElementById('exp-amount').value;
    const date = document.getElementById('exp-date').value;
    const method = document.getElementById('exp-method').value;
    const paidTo = document.getElementById('exp-paid-to').value.trim();
    const desc = document.getElementById('exp-desc').value.trim();

    if (!categoryId || !amount || !date || !desc) {
      return window.showToast('Please fill all required fields.', 'error');
    }

    try {
      const res = await API.post('/expenses', {
        showroom_id: showroomId,
        category_id: categoryId,
        amount,
        expense_date: date,
        payment_method: method,
        paid_to: paidTo,
        description: desc
      });

      if (res.success) {
        window.showToast(res.message || 'Expense recorded successfully.', 'success');
        window.AppRouter.closeModal();
        this.load();
      }
    } catch (err) {
      window.showToast(err.message, 'error');
    }
  }
};

window.ExpensesModule = ExpensesModule;
