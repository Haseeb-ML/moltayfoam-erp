// Showrooms Management Module

const ShowroomsModule = {
  showrooms: [],

  async load() {
    const container = document.getElementById('showrooms-content');
    if (!container) return;

    container.innerHTML = `
      <div class="state-loading">
        <div class="spinner"></div>
        <div class="state-title">Loading Showroom Infrastructure...</div>
      </div>
    `;

    try {
      const res = await API.get('/showrooms');
      this.showrooms = res.data || [];
      this.render(this.showrooms, container);
    } catch (err) {
      container.innerHTML = `
        <div class="state-error">
          <div class="state-icon">⚠️</div>
          <div class="state-title">Unable to load showrooms</div>
          <div class="state-desc">${err.message}</div>
        </div>
      `;
    }
  },

  render(showrooms, container) {
    container.innerHTML = `
      <div class="page-header">
        <div class="page-title-group">
          <h1>🏢 Multi-Showroom Infrastructure</h1>
          <p>Branch operations, assigned inventory tracking, staff deployment, and branch metrics</p>
        </div>
        <div class="page-actions">
          ${Auth.hasPermission('MANAGE_SHOWROOMS') ? '<button class="btn btn-primary" onclick="ShowroomsModule.openCreateModal()">+ Add Showroom</button>' : ''}
        </div>
      </div>

      <!-- Showrooms Cards Grid -->
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 1.5rem; margin-bottom: 2rem;">
        ${showrooms
          .map(
            (s) => `
          <div class="card" style="border-top: 4px solid var(--brand-primary);">
            <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 1rem;">
              <div>
                <span class="badge badge-info" style="margin-bottom: 0.35rem;">${s.code}</span>
                <h3 style="font-size: 1.15rem; font-weight: 700; color: var(--text-primary);">${s.name}</h3>
              </div>
              <span class="badge ${s.is_active ? 'badge-success' : 'badge-danger'}">
                ${s.is_active ? 'ACTIVE' : 'INACTIVE'}
              </span>
            </div>

            <div style="font-size: 0.85rem; color: var(--text-secondary); margin-bottom: 1rem; line-height: 1.5;">
              <div>📍 ${s.address}</div>
              <div>📞 ${s.phone}</div>
            </div>

            <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 0.5rem; background: var(--bg-app); border-radius: var(--radius-md); padding: 0.85rem; text-align: center; margin-bottom: 1rem;">
              <div>
                <div style="font-size: 0.72rem; color: var(--text-muted); text-transform: uppercase;">Stock Units</div>
                <div style="font-weight: 800; font-size: 1.1rem; color: var(--brand-primary);">${Number(s.total_stock_items || 0).toLocaleString()}</div>
              </div>
              <div>
                <div style="font-size: 0.72rem; color: var(--text-muted); text-transform: uppercase;">Staff</div>
                <div style="font-weight: 800; font-size: 1.1rem;">${s.staff_count || 0}</div>
              </div>
              <div>
                <div style="font-size: 0.72rem; color: var(--text-muted); text-transform: uppercase;">Orders</div>
                <div style="font-weight: 800; font-size: 1.1rem;">${s.order_count || 0}</div>
              </div>
            </div>

            <div style="display: flex; gap: 0.5rem;">
              <button class="btn btn-secondary btn-sm" style="flex: 1;" onclick="ShowroomsModule.filterByThisShowroom(${s.id})">
                👁️ View Branch Data
              </button>
              ${Auth.hasPermission('MANAGE_SHOWROOMS') ? `<button class="btn btn-outline btn-sm" onclick="ShowroomsModule.openEditModal(${s.id})">Edit</button>` : ''}
            </div>
          </div>
        `
          )
          .join('')}
      </div>
    `;
  },

  filterByThisShowroom(id) {
    const select = document.getElementById('global-showroom-select');
    if (select) {
      select.value = String(id);
      window.AppRouter.onShowroomChange(String(id));
      window.AppRouter.switchTab('dashboard');
    }
  },

  openCreateModal() {
    const modal = document.getElementById('common-modal');
    const title = document.getElementById('common-modal-title');
    const body = document.getElementById('common-modal-body');
    const footer = document.getElementById('common-modal-footer');

    title.textContent = '🏢 Add Showroom Branch';
    body.innerHTML = `
      <div class="form-row">
        <div class="form-group">
          <label class="form-label required">Showroom Name</label>
          <input type="text" id="sh-name" class="form-control" placeholder="e.g. F-10 Commercial Showroom" required />
        </div>
        <div class="form-group">
          <label class="form-label required">Branch Code</label>
          <input type="text" id="sh-code" class="form-control" placeholder="e.g. SH-03" required />
        </div>
      </div>

      <div class="form-group">
        <label class="form-label required">Physical Address</label>
        <input type="text" id="sh-address" class="form-control" placeholder="Plot / Shop #, Plaza, Sector, City" required />
      </div>

      <div class="form-group">
        <label class="form-label required">Contact Phone</label>
        <input type="text" id="sh-phone" class="form-control" placeholder="+92 51 1234567" required />
      </div>
    `;

    footer.innerHTML = `
      <button class="btn btn-secondary" onclick="window.AppRouter.closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="ShowroomsModule.submitCreate()">Create Showroom</button>
    `;

    window.AppRouter.openModal();
  },

  async submitCreate() {
    const name = document.getElementById('sh-name').value.trim();
    const code = document.getElementById('sh-code').value.trim();
    const address = document.getElementById('sh-address').value.trim();
    const phone = document.getElementById('sh-phone').value.trim();

    if (!name || !code || !address || !phone) {
      return window.showToast('Please fill all required fields.', 'error');
    }

    try {
      const res = await API.post('/showrooms', { name, code, address, phone });
      if (res.success) {
        window.showToast(res.message || 'Showroom created successfully.', 'success');
        window.AppRouter.closeModal();
        window.AppRouter.populateShowroomsDropdown();
        this.load();
      }
    } catch (err) {
      window.showToast(err.message, 'error');
    }
  },

  openEditModal(id) {
    const s = this.showrooms.find((x) => x.id === id);
    if (!s) return;

    const modal = document.getElementById('common-modal');
    const title = document.getElementById('common-modal-title');
    const body = document.getElementById('common-modal-body');
    const footer = document.getElementById('common-modal-footer');

    title.textContent = `🏢 Edit Showroom: ${s.name}`;
    body.innerHTML = `
      <div class="form-row">
        <div class="form-group">
          <label class="form-label required">Showroom Name</label>
          <input type="text" id="sh-edit-name" class="form-control" value="${s.name}" required />
        </div>
        <div class="form-group">
          <label class="form-label required">Branch Code</label>
          <input type="text" id="sh-edit-code" class="form-control" value="${s.code}" required />
        </div>
      </div>

      <div class="form-group">
        <label class="form-label required">Physical Address</label>
        <input type="text" id="sh-edit-address" class="form-control" value="${s.address}" required />
      </div>

      <div class="form-row">
        <div class="form-group">
          <label class="form-label required">Contact Phone</label>
          <input type="text" id="sh-edit-phone" class="form-control" value="${s.phone}" required />
        </div>
        <div class="form-group">
          <label class="form-label">Status</label>
          <select id="sh-edit-active" class="form-select">
            <option value="1" ${s.is_active ? 'selected' : ''}>Active</option>
            <option value="0" ${!s.is_active ? 'selected' : ''}>Inactive</option>
          </select>
        </div>
      </div>
    `;

    footer.innerHTML = `
      <button class="btn btn-secondary" onclick="window.AppRouter.closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="ShowroomsModule.submitEdit(${id})">Save Changes</button>
    `;

    window.AppRouter.openModal();
  },

  async submitEdit(id) {
    const name = document.getElementById('sh-edit-name').value.trim();
    const code = document.getElementById('sh-edit-code').value.trim();
    const address = document.getElementById('sh-edit-address').value.trim();
    const phone = document.getElementById('sh-edit-phone').value.trim();
    const is_active = parseInt(document.getElementById('sh-edit-active').value, 10);

    try {
      const res = await API.put(`/showrooms/${id}`, { name, code, address, phone, is_active });
      if (res.success) {
        window.showToast(res.message || 'Showroom updated successfully.', 'success');
        window.AppRouter.closeModal();
        window.AppRouter.populateShowroomsDropdown();
        this.load();
      }
    } catch (err) {
      window.showToast(err.message, 'error');
    }
  }
};

window.ShowroomsModule = ShowroomsModule;
