// Delivery Management & Multi-Stage Courier Workflow Module

const DeliveriesModule = {
  staffList: [],

  async load() {
    const container = document.getElementById('deliveries-content');
    if (!container) return;

    container.innerHTML = `
      <div class="state-loading">
        <div class="spinner"></div>
        <div class="state-title">Loading Deliveries Board...</div>
      </div>
    `;

    try {
      const showroomId = window.AppRouter.getCurrentShowroomId();
      const [delRes, staffRes] = await Promise.all([
        API.get('/deliveries', { showroom_id: showroomId }),
        API.get('/employees', { showroom_id: showroomId })
      ]);

      this.staffList = staffRes.data || [];
      this.render(delRes.data || [], container);
    } catch (err) {
      container.innerHTML = `
        <div class="state-error">
          <div class="state-icon">⚠️</div>
          <div class="state-title">Unable to load deliveries</div>
          <div class="state-desc">${err.message}</div>
        </div>
      `;
    }
  },

  render(deliveries, container) {
    const currency = 'PKR';
    container.innerHTML = `
      <div class="page-header">
        <div class="page-title-group">
          <h1>🚚 Showroom Deliveries & COD Dispatch</h1>
          <p>Multi-stage delivery pipeline, assigned courier tracking, and doorstep COD collection</p>
        </div>
      </div>

      <!-- Deliveries Grid / Table -->
      <div class="table-container">
        <div class="table-toolbar">
          <input type="text" class="form-control" placeholder="Search by Delivery #, Order #, or Customer..." style="max-width: 320px;" oninput="DeliveriesModule.filterTable(this.value)" />
        </div>
        <div class="table-scroll">
          <table class="erp-table" id="deliveries-table">
            <thead>
              <tr>
                <th>Delivery #</th>
                <th>Order #</th>
                <th>Showroom</th>
                <th>Customer</th>
                <th>Contact</th>
                <th>Destination Address</th>
                <th>Assigned Courier</th>
                <th>COD Amount</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              ${deliveries.length === 0 ? '<tr><td colspan="10" style="text-align: center; color: var(--text-muted); padding: 2rem;">No delivery dispatches found.</td></tr>' : ''}
              ${deliveries
                .map((d) => {
                  const statusColors = {
                    ORDERED: 'badge-info',
                    CONFIRMED: 'badge-info',
                    PREPARING: 'badge-warning',
                    READY: 'badge-warning',
                    ASSIGNED: 'badge-purple',
                    OUT_FOR_DELIVERY: 'badge-warning',
                    DELIVERED: 'badge-success',
                    FAILED: 'badge-danger',
                    CANCELLED: 'badge-danger',
                    RETURNED: 'badge-danger'
                  };

                  return `
                <tr>
                  <td><strong>${d.delivery_number}</strong></td>
                  <td>${d.order_number || d.custom_order_number || '-'}</td>
                  <td><span class="badge badge-info">${d.showroom_code}</span></td>
                  <td><strong>${d.customer_name}</strong></td>
                  <td><a href="tel:${d.customer_mobile}" style="color: var(--brand-primary); text-decoration: none;">📞 ${d.customer_mobile}</a></td>
                  <td style="max-width: 220px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${d.delivery_address}">
                    ${d.delivery_address}
                  </td>
                  <td>${d.delivery_staff_name || '<em style="color: var(--text-muted);">Unassigned</em>'}</td>
                  <td>
                    <strong style="color: ${d.cod_amount > 0 ? 'var(--status-danger)' : 'var(--status-success)'};">
                      ${currency} ${Number(d.cod_amount || 0).toLocaleString()}
                    </strong>
                  </td>
                  <td>
                    <span class="badge ${statusColors[d.status] || 'badge-info'}">
                      ${d.status}
                    </span>
                  </td>
                  <td>
                    <div style="display: flex; gap: 0.35rem;">
                      <button class="btn btn-primary btn-sm" onclick="DeliveriesModule.openStatusModal(${d.id}, '${d.status}', ${d.cod_amount || 0})">
                        🔄 Update
                      </button>
                      <button class="btn btn-secondary btn-sm" onclick="DeliveriesModule.openAssignModal(${d.id})">
                        👤 Assign
                      </button>
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
    const rows = document.querySelectorAll('#deliveries-table tbody tr');
    const term = query.toLowerCase();
    rows.forEach((row) => {
      row.style.display = row.textContent.toLowerCase().includes(term) ? '' : 'none';
    });
  },

  openAssignModal(deliveryId) {
    const modal = document.getElementById('common-modal');
    const title = document.getElementById('common-modal-title');
    const body = document.getElementById('common-modal-body');
    const footer = document.getElementById('common-modal-footer');

    title.textContent = '👤 Assign Delivery Staff Courier';
    body.innerHTML = `
      <div class="form-group">
        <label class="form-label required">Select Courier / Staff</label>
        <select id="deliv-staff-id" class="form-select">
          <option value="">Choose Staff...</option>
          ${this.staffList.map((s) => `<option value="${s.id}">${s.full_name} (${s.role_title} - ${s.phone})</option>`).join('')}
        </select>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Delivery Date</label>
          <input type="date" id="deliv-date" class="form-control" value="${new Date().toISOString().split('T')[0]}" />
        </div>
        <div class="form-group">
          <label class="form-label">Scheduled Time Window</label>
          <input type="text" id="deliv-time" class="form-control" placeholder="e.g. 17:00 - 18:30" />
        </div>
      </div>
    `;

    footer.innerHTML = `
      <button class="btn btn-secondary" onclick="window.AppRouter.closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="DeliveriesModule.submitAssign(${deliveryId})">Assign Courier</button>
    `;

    window.AppRouter.openModal();
  },

  async submitAssign(deliveryId) {
    const staffId = document.getElementById('deliv-staff-id').value;
    const date = document.getElementById('deliv-date').value;
    const time = document.getElementById('deliv-time').value.trim();

    if (!staffId) return window.showToast('Please select courier staff.', 'error');

    try {
      const res = await API.patch(`/deliveries/${deliveryId}/assign`, {
        assigned_staff_id: staffId,
        delivery_date: date,
        delivery_time: time
      });

      if (res.success) {
        window.showToast(res.message || 'Delivery assigned successfully.', 'success');
        window.AppRouter.closeModal();
        this.load();
      }
    } catch (err) {
      window.showToast(err.message, 'error');
    }
  },

  openStatusModal(deliveryId, currentStatus, codAmount) {
    const modal = document.getElementById('common-modal');
    const title = document.getElementById('common-modal-title');
    const body = document.getElementById('common-modal-body');
    const footer = document.getElementById('common-modal-footer');

    const statuses = [
      'ORDERED', 'CONFIRMED', 'PREPARING', 'READY', 'ASSIGNED',
      'OUT_FOR_DELIVERY', 'DELIVERED', 'FAILED', 'CANCELLED', 'RETURNED'
    ];

    title.textContent = '🔄 Update Delivery Stage & Status';
    body.innerHTML = `
      <div class="form-group">
        <label class="form-label required">Delivery Status</label>
        <select id="deliv-status-select" class="form-select" onchange="DeliveriesModule.onStatusChange(this.value)">
          ${statuses.map((s) => `<option value="${s}" ${s === currentStatus ? 'selected' : ''}>${s}</option>`).join('')}
        </select>
      </div>

      <!-- Doorstep COD Collection Field (Shows if DELIVERED and COD exists) -->
      <div id="cod-collection-block" style="${currentStatus === 'DELIVERED' || codAmount > 0 ? 'display: block;' : 'display: none;'} background: var(--bg-app); border: 1px solid var(--border-subtle); border-radius: var(--radius-md); padding: 1rem; margin-bottom: 1rem;">
        <div style="font-size: 0.85rem; color: var(--text-muted); margin-bottom: 0.25rem;">Pending COD Amount: <strong>PKR ${Number(codAmount).toLocaleString()}</strong></div>
        <div class="form-group" style="margin-bottom: 0;">
          <label class="form-label">Cash Collected from Customer at Doorstep (PKR)</label>
          <input type="number" id="deliv-collected-amt" class="form-control" min="0" max="${codAmount}" value="${codAmount}" />
        </div>
      </div>

      <div class="form-group">
        <label class="form-label">Delivery Note / Feedback</label>
        <input type="text" id="deliv-notes" class="form-control" placeholder="e.g. Handed over to customer, signed slip received" />
      </div>
    `;

    footer.innerHTML = `
      <button class="btn btn-secondary" onclick="window.AppRouter.closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="DeliveriesModule.submitStatus(${deliveryId})">Save Status</button>
    `;

    window.AppRouter.openModal();
  },

  onStatusChange(val) {
    const codBox = document.getElementById('cod-collection-block');
    if (codBox) {
      codBox.style.display = val === 'DELIVERED' ? 'block' : 'none';
    }
  },

  async submitStatus(deliveryId) {
    const status = document.getElementById('deliv-status-select').value;
    const collected = parseFloat(document.getElementById('deliv-collected-amt')?.value) || 0;
    const notes = document.getElementById('deliv-notes').value.trim();

    try {
      const res = await API.patch(`/deliveries/${deliveryId}/status`, {
        status,
        collected_amount: collected,
        notes
      });

      if (res.success) {
        window.showToast(res.message || 'Delivery status updated successfully.', 'success');
        window.AppRouter.closeModal();
        this.load();
      }
    } catch (err) {
      window.showToast(err.message, 'error');
    }
  }
};

window.DeliveriesModule = DeliveriesModule;
