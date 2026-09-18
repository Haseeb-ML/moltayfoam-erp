// Immutable Audit Trail & Log Inspection Module

const AuditModule = {
  logs: [],

  async load() {
    const container = document.getElementById('audit-content');
    if (!container) return;

    container.innerHTML = `
      <div class="state-loading">
        <div class="spinner"></div>
        <div class="state-title">Loading Security Audit Trail...</div>
      </div>
    `;

    try {
      const showroomId = window.AppRouter.getCurrentShowroomId();
      const res = await API.get('/audit-logs', { showroom_id: showroomId, limit: 100 });
      this.logs = res.data || [];
      this.render(this.logs, container);
    } catch (err) {
      container.innerHTML = `
        <div class="state-error">
          <div class="state-icon">⚠️</div>
          <div class="state-title">Unable to access audit logs</div>
          <div class="state-desc">${err.message}</div>
        </div>
      `;
    }
  },

  render(logs, container) {
    container.innerHTML = `
      <div class="page-header">
        <div class="page-title-group">
          <h1>🔒 Immutable Transaction Audit Trail</h1>
          <p>Cryptographic record of every mutation: user actions, stock adjustments, financial receipts, and status shifts</p>
        </div>
      </div>

      <!-- Audit Logs Table -->
      <div class="table-container">
        <div class="table-toolbar">
          <input type="text" class="form-control" placeholder="Search by user, module, record ID, or action..." style="max-width: 320px;" oninput="AuditModule.filterTable(this.value)" />
        </div>
        <div class="table-scroll">
          <table class="erp-table" id="audit-table">
            <thead>
              <tr>
                <th>Timestamp</th>
                <th>Actor / User</th>
                <th>Role</th>
                <th>Showroom</th>
                <th>Module</th>
                <th>Action</th>
                <th>Record ID</th>
                <th>Reason / Description</th>
                <th>Changes</th>
              </tr>
            </thead>
            <tbody>
              ${logs.length === 0 ? '<tr><td colspan="9" style="text-align: center; color: var(--text-muted); padding: 2rem;">No audit logs found.</td></tr>' : ''}
              ${logs
                .map((l, idx) => {
                  const actionColors = {
                    CREATE: 'badge-success',
                    UPDATE: 'badge-warning',
                    DELETE: 'badge-danger',
                    ADMIN_CORRECTION: 'badge-danger',
                    STOCK_ADJUSTMENT: 'badge-warning',
                    RECEIVE_CHALLAN: 'badge-info',
                    CREATE_ORDER: 'badge-info',
                    CREATE_CUSTOM_ORDER: 'badge-purple'
                  };

                  return `
                <tr>
                  <td>${new Date(l.created_at).toLocaleString()}</td>
                  <td><strong>${l.actor_name || l.username || 'System'}</strong></td>
                  <td><span style="font-size: 0.78rem; color: var(--text-muted);">${l.actor_role || '-'}</span></td>
                  <td><span class="badge badge-info">${l.showroom_code || 'GLOBAL'}</span></td>
                  <td><strong>${l.module}</strong></td>
                  <td>
                    <span class="badge ${actionColors[l.action] || 'badge-secondary'}">
                      ${l.action}
                    </span>
                  </td>
                  <td><code>${l.record_id}</code></td>
                  <td style="color: var(--text-secondary); max-width: 240px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                    ${l.reason || '-'}
                  </td>
                  <td>
                    <button class="btn btn-outline btn-sm" onclick="AuditModule.inspectDiff(${idx})">
                      🔍 Inspect
                    </button>
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
    const rows = document.querySelectorAll('#audit-table tbody tr');
    const term = query.toLowerCase();
    rows.forEach((row) => {
      row.style.display = row.textContent.toLowerCase().includes(term) ? '' : 'none';
    });
  },

  inspectDiff(idx) {
    const log = this.logs[idx];
    if (!log) return;

    const modal = document.getElementById('common-modal');
    const title = document.getElementById('common-modal-title');
    const body = document.getElementById('common-modal-body');
    const footer = document.getElementById('common-modal-footer');

    let oldObj = null;
    let newObj = null;
    try { if (log.old_values) oldObj = JSON.parse(log.old_values); } catch {}
    try { if (log.new_values) newObj = JSON.parse(log.new_values); } catch {}

    title.textContent = `Audit Inspection: ${log.module} [${log.action}]`;
    body.innerHTML = `
      <div style="margin-bottom: 1rem; line-height: 1.6; background: var(--bg-app); padding: 1rem; border-radius: var(--radius-md);">
        <div><strong>Actor:</strong> ${log.actor_name} (${log.actor_role})</div>
        <div><strong>Timestamp:</strong> ${new Date(log.created_at).toLocaleString()}</div>
        <div><strong>Record Target:</strong> ${log.module} #${log.record_id}</div>
        <div><strong>Showroom:</strong> ${log.showroom_name || 'All Showrooms'}</div>
        <div><strong>Reason:</strong> ${log.reason || 'Routine operational transaction'}</div>
      </div>

      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
        <div>
          <div style="font-weight: 700; font-size: 0.85rem; color: var(--status-danger); margin-bottom: 0.35rem;">Previous State (Old)</div>
          <pre style="background: var(--bg-app); border: 1px solid var(--border-subtle); border-radius: var(--radius-md); padding: 0.75rem; font-size: 0.75rem; overflow-x: auto; max-height: 250px;">${oldObj ? JSON.stringify(oldObj, null, 2) : '(None / Created Record)'}</pre>
        </div>
        <div>
          <div style="font-weight: 700; font-size: 0.85rem; color: var(--status-success); margin-bottom: 0.35rem;">Resulting State (New)</div>
          <pre style="background: var(--bg-app); border: 1px solid var(--border-subtle); border-radius: var(--radius-md); padding: 0.75rem; font-size: 0.75rem; overflow-x: auto; max-height: 250px;">${newObj ? JSON.stringify(newObj, null, 2) : '(None / Deleted Record)'}</pre>
        </div>
      </div>
    `;

    footer.innerHTML = `
      <button class="btn btn-primary" onclick="window.AppRouter.closeModal()">Close</button>
    `;

    window.AppRouter.openModal();
  }
};

window.AuditModule = AuditModule;
