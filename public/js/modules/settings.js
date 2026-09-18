// Admin Settings & Dynamic RBAC Configuration Module

const SettingsModule = {
  rolesData: [],
  permissionsData: [],

  async load() {
    const container = document.getElementById('settings-content');
    if (!container) return;

    container.innerHTML = `
      <div class="state-loading">
        <div class="spinner"></div>
        <div class="state-title">Loading Administrative Settings...</div>
      </div>
    `;

    try {
      const [settingsRes, rolesRes] = await Promise.all([
        API.get('/settings'),
        API.get('/settings/roles')
      ]);

      const settings = settingsRes.data || {};
      const rolesInfo = rolesRes.data || {};
      this.rolesData = rolesInfo.roles || [];
      this.permissionsData = rolesInfo.allPermissions || [];

      this.render(settings, container);
    } catch (err) {
      container.innerHTML = `
        <div class="state-error">
          <div class="state-icon">⚠️</div>
          <div class="state-title">Unable to load settings</div>
          <div class="state-desc">${err.message}</div>
        </div>
      `;
    }
  },

  render(settings, container) {
    container.innerHTML = `
      <div class="page-header">
        <div class="page-title-group">
          <h1>⚙️ System Settings & Dynamic RBAC Roles</h1>
          <p>Configure company parameters, customize dynamic role permissions, and control tab visibility</p>
        </div>
      </div>

      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 1.5rem; margin-bottom: 2rem;">
        <!-- General Business Parameters -->
        <div class="card">
          <div class="card-header">
            <div class="card-title">🏢 Enterprise Parameters</div>
          </div>
          <form onsubmit="SettingsModule.saveGeneralSettings(event)">
            <div class="form-group">
              <label class="form-label required">Company / Business Name</label>
              <input type="text" id="set-company-name" class="form-control" value="${settings.company_name || 'Master MoltyFoam Dealership'}" required />
            </div>
            <div class="form-row">
              <div class="form-group">
                <label class="form-label required">Currency Symbol</label>
                <input type="text" id="set-currency" class="form-control" value="${settings.currency_symbol || 'PKR'}" required />
              </div>
              <div class="form-group">
                <label class="form-label required">Invoice Prefix</label>
                <input type="text" id="set-inv-prefix" class="form-control" value="${settings.invoice_prefix || 'INV-'}" required />
              </div>
            </div>
            <div class="form-row">
              <div class="form-group">
                <label class="form-label required">Challan Prefix</label>
                <input type="text" id="set-chl-prefix" class="form-control" value="${settings.challan_prefix || 'CHL-'}" required />
              </div>
              <div class="form-group">
                <label class="form-label required">Custom Order Prefix</label>
                <input type="text" id="set-cust-prefix" class="form-control" value="${settings.custom_order_prefix || 'CUST-'}" required />
              </div>
            </div>
            <button type="submit" class="btn btn-primary" style="margin-top: 0.5rem;">💾 Save Parameters</button>
          </form>
        </div>

        <!-- Database & Demo Reset -->
        <div class="card">
          <div class="card-header">
            <div class="card-title">🔄 Database Seed & Recovery</div>
          </div>
          <p style="font-size: 0.88rem; color: var(--text-secondary); margin-bottom: 1rem;">
            Quickly repopulate or reset sample demo showrooms, products, users, challans, orders, and expenses.
          </p>
          <div style="background: rgba(239, 68, 68, 0.08); border: 1px solid var(--status-danger); border-radius: var(--radius-md); padding: 1rem; margin-bottom: 1.25rem;">
            <strong style="color: var(--status-danger); font-size: 0.88rem;">⚠️ Production Safeguard:</strong>
            <p style="font-size: 0.8rem; color: var(--text-secondary); margin-top: 0.25rem;">
              Resetting re-initializes clean default seed data for both showrooms.
            </p>
          </div>
          <button class="btn btn-danger" onclick="SettingsModule.resetDemoData()">
            ⚡ Reset & Re-Seed Enterprise Database
          </button>
        </div>
      </div>

      <!-- Dynamic Role-Based Access Control (RBAC) -->
      <div class="card">
        <div class="card-header">
          <div class="card-title">🛡️ Dynamic Role Permissions & Tab Visibility</div>
          <button class="btn btn-secondary btn-sm" onclick="SettingsModule.openCreateRoleModal()">+ Create Custom Role</button>
        </div>
        <p style="font-size: 0.85rem; color: var(--text-secondary); margin-bottom: 1.25rem;">
          Control exactly what modules and operational tabs each staff role can access across the ERP.
        </p>

        <div class="table-scroll">
          <table class="erp-table">
            <thead>
              <tr>
                <th>Role Name</th>
                <th>Description</th>
                <th>System Role?</th>
                <th>Granted Permissions Count</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              ${this.rolesData
                .map(
                  (r) => `
                <tr>
                  <td><strong>${r.name}</strong></td>
                  <td>${r.description}</td>
                  <td><span class="badge ${r.is_system ? 'badge-purple' : 'badge-info'}">${r.is_system ? 'System' : 'Custom'}</span></td>
                  <td><strong>${r.permission_ids ? r.permission_ids.length : 0} Permissions</strong></td>
                  <td>
                    <button class="btn btn-primary btn-sm" onclick="SettingsModule.openEditPermissionsModal(${r.id})">
                      🔑 Manage Permissions
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

  async saveGeneralSettings(e) {
    e.preventDefault();
    const company_name = document.getElementById('set-company-name').value.trim();
    const currency_symbol = document.getElementById('set-currency').value.trim();
    const invoice_prefix = document.getElementById('set-inv-prefix').value.trim();
    const challan_prefix = document.getElementById('set-chl-prefix').value.trim();
    const custom_order_prefix = document.getElementById('set-cust-prefix').value.trim();

    try {
      const res = await API.put('/settings', {
        company_name,
        currency_symbol,
        invoice_prefix,
        challan_prefix,
        custom_order_prefix
      });

      if (res.success) {
        window.showToast(res.message || 'Settings saved successfully.', 'success');
      }
    } catch (err) {
      window.showToast(err.message, 'error');
    }
  },

  openEditPermissionsModal(roleId) {
    const role = this.rolesData.find((r) => r.id === roleId);
    if (!role) return;

    const modal = document.getElementById('common-modal');
    const title = document.getElementById('common-modal-title');
    const body = document.getElementById('common-modal-body');
    const footer = document.getElementById('common-modal-footer');

    // Group permissions by module
    const groups = {};
    for (const p of this.permissionsData) {
      if (!groups[p.module]) groups[p.module] = [];
      groups[p.module].push(p);
    }

    const assignedIds = role.permission_ids || [];

    title.textContent = `🔑 Configure Permissions: ${role.name}`;
    body.innerHTML = `
      <p style="font-size: 0.85rem; color: var(--text-secondary); margin-bottom: 1rem;">
        Check or uncheck permissions below. Tabs associated with unchecked permissions will be automatically hidden from users with this role.
      </p>

      <div style="display: flex; flex-direction: column; gap: 1rem; max-height: 55vh; overflow-y: auto; padding-right: 0.5rem;">
        ${Object.keys(groups)
          .map(
            (mod) => `
          <div style="background: var(--bg-app); border: 1px solid var(--border-subtle); border-radius: var(--radius-md); padding: 0.85rem;">
            <div style="font-weight: 700; font-size: 0.85rem; text-transform: uppercase; color: var(--brand-primary); margin-bottom: 0.5rem;">
              ${mod}
            </div>
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 0.5rem;">
              ${groups[mod]
                .map(
                  (p) => `
                <label style="display: flex; align-items: center; gap: 0.5rem; font-size: 0.82rem; cursor: pointer;">
                  <input type="checkbox" class="perm-checkbox" value="${p.id}" ${assignedIds.includes(p.id) ? 'checked' : ''} />
                  <span>${p.name}</span>
                </label>
              `
                )
                .join('')}
            </div>
          </div>
        `
          )
          .join('')}
      </div>
    `;

    footer.innerHTML = `
      <button class="btn btn-secondary" onclick="window.AppRouter.closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="SettingsModule.saveRolePermissions(${roleId})">Save Role Permissions</button>
    `;

    window.AppRouter.openModal();
  },

  async saveRolePermissions(roleId) {
    const checkboxes = document.querySelectorAll('.perm-checkbox:checked');
    const permission_ids = Array.from(checkboxes).map((cb) => parseInt(cb.value, 10));

    try {
      const res = await API.put(`/settings/roles/${roleId}`, { permission_ids });
      if (res.success) {
        window.showToast(res.message || 'Role permissions updated successfully.', 'success');
        window.AppRouter.closeModal();
        this.load();
        // If current user's role was modified, update their tabs
        if (Auth.currentUser && Auth.currentUser.role_id === roleId) {
          const authMe = await API.get('/auth/me');
          if (authMe.success) {
            API.setUser(authMe.user);
            Auth.currentUser = authMe.user;
            Auth.applyDynamicTabs();
          }
        }
      }
    } catch (err) {
      window.showToast(err.message, 'error');
    }
  },

  openCreateRoleModal() {
    const modal = document.getElementById('common-modal');
    const title = document.getElementById('common-modal-title');
    const body = document.getElementById('common-modal-body');
    const footer = document.getElementById('common-modal-footer');

    title.textContent = '🛡️ Create Custom Staff Role';
    body.innerHTML = `
      <div class="form-group">
        <label class="form-label required">Role Name</label>
        <input type="text" id="role-name-input" class="form-control" placeholder="e.g. Floor Supervisor" required />
      </div>
      <div class="form-group">
        <label class="form-label">Role Description</label>
        <input type="text" id="role-desc-input" class="form-control" placeholder="e.g. Manages sales floor and assists cashiers" />
      </div>
    `;

    footer.innerHTML = `
      <button class="btn btn-secondary" onclick="window.AppRouter.closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="SettingsModule.submitCreateRole()">Create Role</button>
    `;

    window.AppRouter.openModal();
  },

  async submitCreateRole() {
    const name = document.getElementById('role-name-input').value.trim();
    const desc = document.getElementById('role-desc-input').value.trim();

    if (!name) return window.showToast('Role name is required.', 'error');

    try {
      const res = await API.post('/settings/roles', { name, description: desc, permission_ids: [] });
      if (res.success) {
        window.showToast(res.message || 'Custom role created successfully.', 'success');
        window.AppRouter.closeModal();
        this.load();
      }
    } catch (err) {
      window.showToast(err.message, 'error');
    }
  },

  async resetDemoData() {
    if (!confirm('Are you sure you want to reset and re-seed default demo data for both showrooms? All existing test records will be refreshed.')) {
      return;
    }

    try {
      const res = await API.post('/settings/seed-reset', {});
      if (res.success) {
        window.showToast('Database reset and seeded with demo data!', 'success');
        this.load();
      }
    } catch (err) {
      window.showToast(err.message, 'error');
    }
  }
};

window.SettingsModule = SettingsModule;
