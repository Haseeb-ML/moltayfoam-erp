// Inventory Management & Auditable Movement Tracking Module

const InventoryModule = {
  activeView: 'matrix', // 'matrix' or 'movements'
  inventoryData: [],
  products: [],

  async load() {
    const container = document.getElementById('inventory-content');
    if (!container) return;

    container.innerHTML = `
      <div class="state-loading">
        <div class="spinner"></div>
        <div class="state-title">Loading Showroom Inventory...</div>
      </div>
    `;

    try {
      const showroomId = window.AppRouter.getCurrentShowroomId();
      const [invRes, prodRes] = await Promise.all([
        API.get('/inventory', { showroom_id: showroomId }),
        API.get('/products', { showroom_id: showroomId })
      ]);

      this.inventoryData = invRes.data || [];
      this.products = prodRes.data || [];

      if (this.activeView === 'movements') {
        await this.loadMovements(container);
      } else {
        this.renderMatrix(this.inventoryData, container);
      }
    } catch (err) {
      container.innerHTML = `
        <div class="state-error">
          <div class="state-icon">⚠️</div>
          <div class="state-title">Unable to load inventory</div>
          <div class="state-desc">${err.message}</div>
        </div>
      `;
    }
  },

  renderMatrix(items, container) {
    const currency = 'PKR';
    container.innerHTML = `
      <div class="page-header">
        <div class="page-title-group">
          <h1>🏷️ Showroom Inventory & Stock Matrix</h1>
          <p>Real-time stock levels, low-stock alerts, and multi-showroom transfers</p>
        </div>
        <div class="page-actions">
          <div class="btn-group" style="display: flex; gap: 0.5rem;">
            <button class="btn ${this.activeView === 'matrix' ? 'btn-primary' : 'btn-secondary'} btn-sm" onclick="InventoryModule.switchView('matrix')">
              📊 Stock Matrix
            </button>
            <button class="btn ${this.activeView === 'movements' ? 'btn-primary' : 'btn-secondary'} btn-sm" onclick="InventoryModule.switchView('movements')">
              📜 Movement Logs
            </button>
          </div>
          ${Auth.hasPermission('ADJUST_INVENTORY') ? '<button class="btn btn-secondary btn-sm" onclick="InventoryModule.openAdjustModal()">⚙️ Stock Adjustment</button>' : ''}
          ${Auth.hasPermission('TRANSFER_INVENTORY') ? '<button class="btn btn-secondary btn-sm" onclick="InventoryModule.openTransferModal()">🔄 Inter-Showroom Transfer</button>' : ''}
        </div>
      </div>

      <!-- Inventory Table -->
      <div class="table-container">
        <div class="table-toolbar">
          <div style="display: flex; gap: 0.75rem; align-items: center; flex-wrap: wrap;">
            <input type="text" class="form-control" placeholder="Search product, SKU or variant..." style="max-width: 280px;" oninput="InventoryModule.filterTable(this.value)" />
            <button class="btn btn-outline btn-sm" onclick="InventoryModule.toggleLowStock(this)">
              ⚠️ Show Low Stock Only
            </button>
          </div>
        </div>
        <div class="table-scroll">
          <table class="erp-table" id="inventory-table">
            <thead>
              <tr>
                <th>Showroom</th>
                <th>SKU</th>
                <th>Product Name</th>
                <th>Variant / Size</th>
                <th>Category</th>
                <th>Available Qty</th>
                <th>Alert Threshold</th>
                <th>Cost Value</th>
                <th>Retail Value</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              ${items.length === 0 ? '<tr><td colspan="10" style="text-align: center; color: var(--text-muted); padding: 2rem;">No inventory records found.</td></tr>' : ''}
              ${items
                .map((i) => {
                  const isLow = i.quantity <= i.min_stock_alert;
                  return `
                <tr class="${isLow ? 'low-stock-row' : ''}">
                  <td><span class="badge badge-info">${i.showroom_code}</span></td>
                  <td><strong>${i.product_sku}</strong></td>
                  <td>${i.product_name}</td>
                  <td>${i.variant_name || 'Standard'}</td>
                  <td>${i.category_name || '-'}</td>
                  <td>
                    <strong style="font-size: 1.05rem; color: ${isLow ? 'var(--status-danger)' : 'var(--text-primary)'};">
                      ${i.quantity} ${i.unit}
                    </strong>
                  </td>
                  <td style="color: var(--text-muted);">${i.min_stock_alert} ${i.unit}</td>
                  <td>${currency} ${Number(i.quantity * i.purchase_cost).toLocaleString()}</td>
                  <td><strong>${currency} ${Number(i.quantity * i.selling_price).toLocaleString()}</strong></td>
                  <td>
                    <span class="badge ${isLow ? 'badge-danger' : 'badge-success'}">
                      ${isLow ? '⚠️ LOW STOCK' : 'HEALTHY'}
                    </span>
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

  async loadMovements(container) {
    const showroomId = window.AppRouter.getCurrentShowroomId();
    const res = await API.get('/inventory/movements', { showroom_id: showroomId, limit: 100 });
    const movements = res.data || [];

    container.innerHTML = `
      <div class="page-header">
        <div class="page-title-group">
          <h1>📜 Auditable Stock Movements</h1>
          <p>Complete historical ledger of every stock addition, deduction, transfer, and adjustment</p>
        </div>
        <div class="page-actions">
          <div class="btn-group" style="display: flex; gap: 0.5rem;">
            <button class="btn ${this.activeView === 'matrix' ? 'btn-primary' : 'btn-secondary'} btn-sm" onclick="InventoryModule.switchView('matrix')">
              📊 Stock Matrix
            </button>
            <button class="btn ${this.activeView === 'movements' ? 'btn-primary' : 'btn-secondary'} btn-sm" onclick="InventoryModule.switchView('movements')">
              📜 Movement Logs
            </button>
          </div>
        </div>
      </div>

      <div class="table-container">
        <div class="table-scroll">
          <table class="erp-table">
            <thead>
              <tr>
                <th>Timestamp</th>
                <th>Showroom</th>
                <th>Product</th>
                <th>Variant / Size</th>
                <th>Movement Type</th>
                <th>Quantity Delta</th>
                <th>Balance After</th>
                <th>Reference #</th>
                <th>Performed By</th>
                <th>Notes</th>
              </tr>
            </thead>
            <tbody>
              ${movements
                .map((m) => {
                  const isAdd = m.quantity > 0;
                  return `
                <tr>
                  <td>${new Date(m.created_at).toLocaleString()}</td>
                  <td><span class="badge badge-info">${m.showroom_code}</span></td>
                  <td><strong>${m.product_name}</strong> (${m.product_sku})</td>
                  <td>${m.variant_name || 'Standard'}</td>
                  <td>
                    <span class="badge ${m.movement_type === 'RECEIVING' ? 'badge-success' : m.movement_type === 'SALE' ? 'badge-info' : m.movement_type.startsWith('TRANSFER') ? 'badge-purple' : 'badge-warning'}">
                      ${m.movement_type}
                    </span>
                  </td>
                  <td style="font-weight: 700; color: ${isAdd ? 'var(--status-success)' : 'var(--status-danger)'};">
                    ${isAdd ? '+' : ''}${m.quantity}
                  </td>
                  <td><strong>${m.balance_after}</strong></td>
                  <td><code>${m.reference_id || '-'}</code></td>
                  <td>${m.created_by_name}</td>
                  <td style="color: var(--text-muted); font-size: 0.8rem;">${m.notes || '-'}</td>
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

  switchView(view) {
    this.activeView = view;
    this.load();
  },

  filterTable(query) {
    const rows = document.querySelectorAll('#inventory-table tbody tr');
    const term = query.toLowerCase();
    rows.forEach((row) => {
      row.style.display = row.textContent.toLowerCase().includes(term) ? '' : 'none';
    });
  },

  toggleLowStock(btn) {
    const rows = document.querySelectorAll('#inventory-table tbody tr');
    const filtering = btn.classList.toggle('active');
    btn.textContent = filtering ? '👁️ Show All Stock' : '⚠️ Show Low Stock Only';
    rows.forEach((row) => {
      if (filtering) {
        row.style.display = row.classList.contains('low-stock-row') ? '' : 'none';
      } else {
        row.style.display = '';
      }
    });
  },

  openAdjustModal() {
    const modal = document.getElementById('common-modal');
    const title = document.getElementById('common-modal-title');
    const body = document.getElementById('common-modal-body');
    const footer = document.getElementById('common-modal-footer');

    title.textContent = '⚙️ Manual Stock Adjustment (Strict Reason Required)';
    body.innerHTML = `
      <div class="form-row">
        <div class="form-group">
          <label class="form-label required">Showroom</label>
          <select id="adj-showroom-id" class="form-select">
            <option value="1">Main Showroom - Blue Area</option>
            <option value="2">City Branch - Saddar</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label required">Product</label>
          <select id="adj-product-id" class="form-select" onchange="InventoryModule.onAdjustProductChange(this.value)">
            <option value="">Select Product...</option>
            ${this.products.map((p) => `<option value="${p.id}">${p.name} (${p.sku})</option>`).join('')}
          </select>
        </div>
      </div>

      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Variant / Size</label>
          <select id="adj-variant-id" class="form-select">
            <option value="">Standard Size</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label required">New Verified Physical Count</label>
          <input type="number" id="adj-new-qty" class="form-control" min="0" required />
        </div>
      </div>

      <div class="form-group">
        <label class="form-label required">Reason for Adjustment</label>
        <textarea id="adj-reason" class="form-control" rows="2" placeholder="e.g. Physical inventory discrepancy reconciled during monthly audit" required></textarea>
      </div>
    `;

    footer.innerHTML = `
      <button class="btn btn-secondary" onclick="window.AppRouter.closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="InventoryModule.submitAdjustment()">Confirm Adjustment</button>
    `;

    window.AppRouter.openModal();
  },

  onAdjustProductChange(prodId) {
    const select = document.getElementById('adj-variant-id');
    if (!select) return;
    select.innerHTML = '<option value="">Standard Size</option>';
    const prod = this.products.find((p) => p.id === parseInt(prodId, 10));
    if (prod && prod.variants) {
      for (const v of prod.variants) {
        select.innerHTML += `<option value="${v.id}">${v.variant_name}</option>`;
      }
    }
  },

  async submitAdjustment() {
    const showroomId = document.getElementById('adj-showroom-id').value;
    const productId = document.getElementById('adj-product-id').value;
    const variantId = document.getElementById('adj-variant-id').value;
    const newQty = document.getElementById('adj-new-qty').value;
    const reason = document.getElementById('adj-reason').value.trim();

    if (!productId || newQty === '' || !reason) {
      return window.showToast('Please specify product, new quantity, and adjustment reason.', 'error');
    }

    try {
      const res = await API.post('/inventory/adjust', {
        showroom_id: showroomId,
        product_id: productId,
        variant_id: variantId || null,
        new_quantity: newQty,
        reason
      });

      if (res.success) {
        window.showToast(res.message || 'Stock adjusted successfully.', 'success');
        window.AppRouter.closeModal();
        this.load();
      }
    } catch (err) {
      window.showToast(err.message, 'error');
    }
  },

  openTransferModal() {
    const modal = document.getElementById('common-modal');
    const title = document.getElementById('common-modal-title');
    const body = document.getElementById('common-modal-body');
    const footer = document.getElementById('common-modal-footer');

    title.textContent = '🔄 Inter-Showroom Stock Transfer';
    body.innerHTML = `
      <div class="form-row">
        <div class="form-group">
          <label class="form-label required">Source Showroom</label>
          <select id="trf-from-id" class="form-select">
            <option value="1">Main Showroom - Blue Area</option>
            <option value="2">City Branch - Saddar</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label required">Destination Showroom</label>
          <select id="trf-to-id" class="form-select">
            <option value="2">City Branch - Saddar</option>
            <option value="1">Main Showroom - Blue Area</option>
          </select>
        </div>
      </div>

      <div class="form-row">
        <div class="form-group">
          <label class="form-label required">Product</label>
          <select id="trf-product-id" class="form-select" onchange="InventoryModule.onTransferProductChange(this.value)">
            <option value="">Select Product...</option>
            ${this.products.map((p) => `<option value="${p.id}">${p.name} (${p.sku})</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Variant / Size</label>
          <select id="trf-variant-id" class="form-select">
            <option value="">Standard Size</option>
          </select>
        </div>
      </div>

      <div class="form-row">
        <div class="form-group">
          <label class="form-label required">Transfer Quantity</label>
          <input type="number" id="trf-qty" class="form-control" min="1" value="1" required />
        </div>
        <div class="form-group">
          <label class="form-label">Transfer Notes / Dispatch Courier</label>
          <input type="text" id="trf-notes" class="form-control" placeholder="e.g. Sent via internal van driver Kashif" />
        </div>
      </div>
    `;

    footer.innerHTML = `
      <button class="btn btn-secondary" onclick="window.AppRouter.closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="InventoryModule.submitTransfer()">Dispatch Transfer</button>
    `;

    window.AppRouter.openModal();
  },

  onTransferProductChange(prodId) {
    const select = document.getElementById('trf-variant-id');
    if (!select) return;
    select.innerHTML = '<option value="">Standard Size</option>';
    const prod = this.products.find((p) => p.id === parseInt(prodId, 10));
    if (prod && prod.variants) {
      for (const v of prod.variants) {
        select.innerHTML += `<option value="${v.id}">${v.variant_name}</option>`;
      }
    }
  },

  async submitTransfer() {
    const fromId = document.getElementById('trf-from-id').value;
    const toId = document.getElementById('trf-to-id').value;
    const prodId = document.getElementById('trf-product-id').value;
    const varId = document.getElementById('trf-variant-id').value;
    const qty = document.getElementById('trf-qty').value;
    const notes = document.getElementById('trf-notes').value.trim();

    if (fromId === toId) {
      return window.showToast('Source and destination showrooms must be different.', 'error');
    }

    if (!prodId || !qty || parseInt(qty, 10) <= 0) {
      return window.showToast('Please select product and positive transfer quantity.', 'error');
    }

    try {
      const res = await API.post('/inventory/transfer', {
        from_showroom_id: fromId,
        to_showroom_id: toId,
        product_id: prodId,
        variant_id: varId || null,
        quantity: qty,
        notes
      });

      if (res.success) {
        window.showToast(res.message || 'Stock transferred successfully.', 'success');
        window.AppRouter.closeModal();
        this.load();
      }
    } catch (err) {
      window.showToast(err.message, 'error');
    }
  }
};

window.InventoryModule = InventoryModule;
