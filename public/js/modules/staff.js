// Staff & Employee Advance Loan Management Module

const StaffModule = {
  activeView: 'roster', // 'roster' or 'advances'
  employees: [],

  async load() {
    const container = document.getElementById('staff-content');
    if (!container) return;

    container.innerHTML = `
      <div class="state-loading">
        <div class="spinner"></div>
        <div class="state-title">Loading Staff Roster...</div>
      </div>
    `;

    try {
      const showroomId = window.AppRouter.getCurrentShowroomId();
      const res = await API.get('/employees', { showroom_id: showroomId });
      this.employees = res.data || [];

      if (this.activeView === 'advances') {
        await this.loadAdvances(container);
      } else {
        this.renderRoster(this.employees, container);
      }
    } catch (err) {
      container.innerHTML = `
        <div class="state-error">
          <div class="state-icon">⚠️</div>
          <div class="state-title">Unable to load staff records</div>
          <div class="state-desc">${err.message}</div>
        </div>
      `;
    }
  },

  renderRoster(staff, container) {
    const currency = 'PKR';
    container.innerHTML = `
      <div class="page-header">
        <div class="page-title-group">
          <h1>👔 Staff Roster & Employee Advances</h1>
          <p>Manage showroom staff members, role assignments, and salary advance vouchers</p>
        </div>
        <div class="page-actions">
          <div class="btn-group" style="display: flex; gap: 0.5rem;">
            <button class="btn ${this.activeView === 'roster' ? 'btn-primary' : 'btn-secondary'} btn-sm" onclick="StaffModule.switchView('roster')">
              👥 Employee Roster
            </button>
            <button class="btn ${this.activeView === 'advances' ? 'btn-primary' : 'btn-secondary'} btn-sm" onclick="StaffModule.switchView('advances')">
              💵 Advance Vouchers
            </button>
          </div>
          ${Auth.hasPermission('MANAGE_STAFF') ? '<button class="btn btn-secondary btn-sm" onclick="StaffModule.openAddStaffModal()">+ Register Employee</button>' : ''}
          ${Auth.hasPermission('CREATE_ADVANCE') ? '<button class="btn btn-primary btn-sm" onclick="StaffModule.openIssueAdvanceModal()">💸 Issue Advance</button>' : ''}
        </div>
      </div>

      <!-- Staff Table -->
      <div class="table-container">
        <div class="table-toolbar">
          <input type="text" class="form-control" placeholder="Search staff by name, code or role..." style="max-width: 320px;" oninput="StaffModule.filterTable(this.value)" />
        </div>
        <div class="table-scroll">
          <table class="erp-table" id="staff-table">
            <thead>
              <tr>
                <th>Code</th>
                <th>Full Name</th>
                <th>Role Title</th>
                <th>Showroom</th>
                <th>Phone</th>
                <th>Joining Date</th>
                <th>Outstanding Advance</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              ${staff.length === 0 ? '<tr><td colspan="8" style="text-align: center; color: var(--text-muted); padding: 2rem;">No staff records found.</td></tr>' : ''}
              ${staff
                .map((e) => {
                  const hasAdvance = e.outstanding_advance > 0;
                  return `
                <tr>
                  <td><strong>${e.emp_code}</strong></td>
                  <td><strong>${e.full_name}</strong></td>
                  <td><span class="badge badge-purple">${e.role_title}</span></td>
                  <td><span class="badge badge-info">${e.showroom_code}</span></td>
                  <td>${e.phone}</td>
                  <td>${e.joining_date}</td>
                  <td>
                    <strong style="color: ${hasAdvance ? 'var(--status-danger)' : 'var(--text-muted)'};">
                      ${currency} ${Number(e.outstanding_advance || 0).toLocaleString()}
                    </strong>
                  </td>
                  <td><span class="badge badge-success">${e.status}</span></td>
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

  async loadAdvances(container) {
    const showroomId = window.AppRouter.getCurrentShowroomId();
    const res = await API.get('/employees/advances/all', { showroom_id: showroomId });
    const advances = res.data || [];
    const currency = 'PKR';

    container.innerHTML = `
      <div class="page-header">
        <div class="page-title-group">
          <h1>💵 Employee Salary Advances</h1>
          <p>Disbursed salary advances, settlement tracking, and payroll deductions</p>
        </div>
        <div class="page-actions">
          <div class="btn-group" style="display: flex; gap: 0.5rem;">
            <button class="btn ${this.activeView === 'roster' ? 'btn-primary' : 'btn-secondary'} btn-sm" onclick="StaffModule.switchView('roster')">
              👥 Employee Roster
            </button>
            <button class="btn ${this.activeView === 'advances' ? 'btn-primary' : 'btn-secondary'} btn-sm" onclick="StaffModule.switchView('advances')">
              💵 Advance Vouchers
            </button>
          </div>
          ${Auth.hasPermission('CREATE_ADVANCE') ? '<button class="btn btn-primary btn-sm" onclick="StaffModule.openIssueAdvanceModal()">💸 Issue Advance</button>' : ''}
        </div>
      </div>

      <div class="table-container">
        <div class="table-scroll">
          <table class="erp-table">
            <thead>
              <tr>
                <th>Voucher #</th>
                <th>Date</th>
                <th>Employee</th>
                <th>Showroom</th>
                <th>Amount</th>
                <th>Reason</th>
                <th>Issued By</th>
                <th>Settlement</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              ${advances.length === 0 ? '<tr><td colspan="9" style="text-align: center; color: var(--text-muted); padding: 2rem;">No advances recorded.</td></tr>' : ''}
              ${advances
                .map(
                  (a) => `
                <tr>
                  <td><strong>${a.voucher_number}</strong></td>
                  <td>${a.advance_date}</td>
                  <td><strong>${a.employee_name}</strong> (${a.emp_code})</td>
                  <td><span class="badge badge-info">${a.showroom_code}</span></td>
                  <td><strong style="color: var(--status-danger);">${currency} ${Number(a.amount).toLocaleString()}</strong></td>
                  <td>${a.reason}</td>
                  <td>${a.given_by_name}</td>
                  <td>
                    <span class="badge ${a.is_settled ? 'badge-success' : 'badge-warning'}">
                      ${a.is_settled ? 'SETTLED' : 'OUTSTANDING'}
                    </span>
                  </td>
                  <td>
                    ${!a.is_settled ? `<button class="btn btn-success btn-sm" onclick="StaffModule.settleAdvance(${a.id})">✓ Settle</button>` : '<span style="color: var(--text-muted); font-size: 0.8rem;">Deducted</span>'}
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

  switchView(view) {
    this.activeView = view;
    this.load();
  },

  filterTable(query) {
    const rows = document.querySelectorAll('#staff-table tbody tr');
    const term = query.toLowerCase();
    rows.forEach((row) => {
      row.style.display = row.textContent.toLowerCase().includes(term) ? '' : 'none';
    });
  },

  openAddStaffModal() {
    const modal = document.getElementById('common-modal');
    const title = document.getElementById('common-modal-title');
    const body = document.getElementById('common-modal-body');
    const footer = document.getElementById('common-modal-footer');

    title.textContent = '👔 Register New Employee';
    body.innerHTML = `
      <div class="form-row">
        <div class="form-group">
          <label class="form-label required">Employee Code</label>
          <input type="text" id="stf-code" class="form-control" placeholder="e.g. EMP-106" required />
        </div>
        <div class="form-group">
          <label class="form-label required">Full Name</label>
          <input type="text" id="stf-name" class="form-control" placeholder="Full Name" required />
        </div>
      </div>

      <div class="form-row">
        <div class="form-group">
          <label class="form-label required">Role Title</label>
          <input type="text" id="stf-role" class="form-control" placeholder="e.g. Sales Executive / Cashier / Courier" required />
        </div>
        <div class="form-group">
          <label class="form-label required">Showroom Assignment</label>
          <select id="stf-showroom" class="form-select">
            <option value="1">Main Showroom - Blue Area</option>
            <option value="2">City Branch - Saddar</option>
          </select>
        </div>
      </div>

      <div class="form-row">
        <div class="form-group">
          <label class="form-label required">Mobile Phone</label>
          <input type="text" id="stf-phone" class="form-control" placeholder="0300-1234567" required />
        </div>
        <div class="form-group">
          <label class="form-label required">Joining Date</label>
          <input type="date" id="stf-join-date" class="form-control" value="${new Date().toISOString().split('T')[0]}" required />
        </div>
      </div>

      <div class="form-group">
        <label class="form-label">Home Address</label>
        <input type="text" id="stf-addr" class="form-control" placeholder="House #, Street #, City" />
      </div>
    `;

    footer.innerHTML = `
      <button class="btn btn-secondary" onclick="window.AppRouter.closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="StaffModule.submitStaff()">Save Employee</button>
    `;

    window.AppRouter.openModal();
  },

  async submitStaff() {
    const code = document.getElementById('stf-code').value.trim();
    const name = document.getElementById('stf-name').value.trim();
    const role = document.getElementById('stf-role').value.trim();
    const showroom = document.getElementById('stf-showroom').value;
    const phone = document.getElementById('stf-phone').value.trim();
    const joinDate = document.getElementById('stf-join-date').value;
    const addr = document.getElementById('stf-addr').value.trim();

    if (!code || !name || !role || !phone || !joinDate) {
      return window.showToast('Please fill all required fields.', 'error');
    }

    try {
      const res = await API.post('/employees', {
        emp_code: code,
        full_name: name,
        role_title: role,
        showroom_id: showroom,
        phone,
        joining_date: joinDate,
        address: addr
      });

      if (res.success) {
        window.showToast(res.message || 'Staff member enrolled successfully.', 'success');
        window.AppRouter.closeModal();
        this.load();
      }
    } catch (err) {
      window.showToast(err.message, 'error');
    }
  },

  openIssueAdvanceModal() {
    const modal = document.getElementById('common-modal');
    const title = document.getElementById('common-modal-title');
    const body = document.getElementById('common-modal-body');
    const footer = document.getElementById('common-modal-footer');

    title.textContent = '💸 Issue Employee Salary Advance';
    body.innerHTML = `
      <div class="form-group">
        <label class="form-label required">Employee</label>
        <select id="adv-emp-id" class="form-select">
          <option value="">Select Employee...</option>
          ${this.employees.map((e) => `<option value="${e.id}">${e.full_name} (${e.emp_code} - ${e.role_title})</option>`).join('')}
        </select>
      </div>

      <div class="form-row">
        <div class="form-group">
          <label class="form-label required">Advance Amount (PKR)</label>
          <input type="number" id="adv-amount" class="form-control" min="100" placeholder="e.g. 5000" required />
        </div>
        <div class="form-group">
          <label class="form-label required">Advance Date</label>
          <input type="date" id="adv-date" class="form-control" value="${new Date().toISOString().split('T')[0]}" required />
        </div>
      </div>

      <div class="form-group">
        <label class="form-label required">Reason for Advance</label>
        <input type="text" id="adv-reason" class="form-control" placeholder="e.g. Urgent family medical assistance" required />
      </div>

      <div class="form-group">
        <label class="form-label">Payment Channel</label>
        <select id="adv-method" class="form-select">
          <option value="CASH">Showroom Petty Cash</option>
          <option value="BANK_TRANSFER">Bank Direct Transfer</option>
        </select>
      </div>
    `;

    footer.innerHTML = `
      <button class="btn btn-secondary" onclick="window.AppRouter.closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="StaffModule.submitAdvance()">Disburse Advance</button>
    `;

    window.AppRouter.openModal();
  },

  async submitAdvance() {
    const empId = document.getElementById('adv-emp-id').value;
    const amount = document.getElementById('adv-amount').value;
    const date = document.getElementById('adv-date').value;
    const reason = document.getElementById('adv-reason').value.trim();
    const method = document.getElementById('adv-method').value;

    if (!empId || !amount || !date || !reason) {
      return window.showToast('Please fill all required fields.', 'error');
    }

    try {
      const res = await API.post('/employees/advances', {
        employee_id: empId,
        amount,
        advance_date: date,
        reason,
        payment_method: method
      });

      if (res.success) {
        window.showToast(res.message || 'Advance voucher issued successfully.', 'success');
        window.AppRouter.closeModal();
        this.load();
      }
    } catch (err) {
      window.showToast(err.message, 'error');
    }
  },

  async settleAdvance(id) {
    if (!confirm('Mark this advance loan as settled against monthly payroll?')) return;

    try {
      const res = await API.patch(`/employees/advances/${id}/settle`);
      if (res.success) {
        window.showToast(res.message || 'Advance marked as settled successfully.', 'success');
        this.load();
      }
    } catch (err) {
      window.showToast(err.message, 'error');
    }
  }
};

window.StaffModule = StaffModule;
