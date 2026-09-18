// Factory Receiving & Mobile Challan Entry Module

const ChallansModule = {
  suppliers: [],
  products: [],
  challanItems: [],

  async load() {
    const container = document.getElementById('challans-content');
    if (!container) return;

    container.innerHTML = `
      <div class="state-loading">
        <div class="spinner"></div>
        <div class="state-title">Loading Factory Challans...</div>
      </div>
    `;

    try {
      const showroomId = window.AppRouter.getCurrentShowroomId();
      const [challansRes, suppliersRes, productsRes] = await Promise.all([
        API.get('/challans', { showroom_id: showroomId }),
        API.get('/challans/suppliers/all'),
        API.get('/products', { showroom_id: showroomId })
      ]);

      this.suppliers = suppliersRes.data || [];
      this.products = productsRes.data || [];

      this.render(challansRes.data || [], container);
    } catch (err) {
      container.innerHTML = `
        <div class="state-error">
          <div class="state-icon">⚠️</div>
          <div class="state-title">Unable to load challans</div>
          <div class="state-desc">${err.message}</div>
        </div>
      `;
    }
  },

  render(challans, container) {
    const currency = 'PKR';
    container.innerHTML = `
      <div class="page-header">
        <div class="page-title-group">
          <h1>📦 Factory Challans & Receiving</h1>
          <p>Record stock shipments arriving from Master MoltyFoam, Diamond Supreme & foam mills</p>
        </div>
        <div class="page-actions">
          <button class="btn btn-primary" onclick="ChallansModule.openCreateModal()">
            📥 Receive Factory Challan
          </button>
        </div>
      </div>

      <!-- Challans List Table -->
      <div class="table-container">
        <div class="table-toolbar">
          <div style="font-weight: 700; font-size: 1rem;">Factory Receiving Log</div>
          <input type="text" id="challan-search" class="form-control" placeholder="Search by Challan # or Supplier..." style="max-width: 280px;" oninput="ChallansModule.filterTable(this.value)" />
        </div>
        <div class="table-scroll">
          <table class="erp-table" id="challans-table">
            <thead>
              <tr>
                <th>Challan #</th>
                <th>Supplier / Factory</th>
                <th>Showroom</th>
                <th>Challan Date</th>
                <th>Total Items</th>
                <th>Total Value</th>
                <th>Received By</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              ${challans.length === 0 ? '<tr><td colspan="9" style="text-align: center; color: var(--text-muted); padding: 2rem;">No factory challans recorded yet.</td></tr>' : ''}
              ${challans
                .map(
                  (c) => `
                <tr>
                  <td><strong>${c.challan_number}</strong></td>
                  <td>${c.supplier_name}</td>
                  <td><span class="badge badge-info">${c.showroom_code}</span></td>
                  <td>${c.challan_date}</td>
                  <td><strong>${c.total_items} Pcs</strong></td>
                  <td>${currency} ${Number(c.total_cost || 0).toLocaleString()}</td>
                  <td>${c.received_by_name}</td>
                  <td><span class="badge badge-success">${c.status}</span></td>
                  <td>
                    <button class="btn btn-secondary btn-sm" onclick="ChallansModule.viewChallan(${c.id})">
                      👁️ View
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
    const rows = document.querySelectorAll('#challans-table tbody tr');
    const term = query.toLowerCase();
    rows.forEach((row) => {
      row.style.display = row.textContent.toLowerCase().includes(term) ? '' : 'none';
    });
  },

  openCreateModal() {
    this.challanItems = [{ product_id: '', variant_id: '', quantity: 1, unit_cost: 0 }];
    const modal = document.getElementById('common-modal');
    const title = document.getElementById('common-modal-title');
    const body = document.getElementById('common-modal-body');
    const footer = document.getElementById('common-modal-footer');

    title.textContent = '📥 Receive Factory Challan (Mobile & Desktop)';
    body.innerHTML = `
      <div class="mobile-challan-container">
        <div class="form-row">
          <div class="form-group">
            <label class="form-label required">Challan Number</label>
            <input type="text" id="m-challan-number" class="form-control" placeholder="e.g. CHL-5542" required />
          </div>
          <div class="form-group">
            <label class="form-label required">Factory / Supplier</label>
            <select id="m-supplier-id" class="form-select" required>
              <option value="">Select Supplier...</option>
              ${this.suppliers.map((s) => `<option value="${s.id}">${s.name}</option>`).join('')}
            </select>
          </div>
        </div>

        <div class="form-row">
          <div class="form-group">
            <label class="form-label required">Destination Showroom</label>
            <select id="m-showroom-id" class="form-select" required>
              <option value="1">Main Showroom - Blue Area</option>
              <option value="2">City Branch - Saddar</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label required">Challan Date</label>
            <input type="date" id="m-challan-date" class="form-control" value="${new Date().toISOString().split('T')[0]}" required />
          </div>
        </div>

        <div class="form-group">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
            <label class="form-label required" style="margin-bottom: 0;">Received Items</label>
            <button type="button" class="btn btn-secondary btn-sm" onclick="ChallansModule.addItemRow()">+ Add Item</button>
          </div>
          <div id="challan-items-container">
            <!-- Dynamic item rows will render here -->
          </div>
        </div>

        <div style="background: var(--bg-app); border: 1px solid var(--border-subtle); border-radius: var(--radius-md); padding: 0.85rem; margin-top: 1rem; display: flex; justify-content: space-between; align-items: center;">
          <span style="font-size: 0.9rem; font-weight: 600;">Total Received Qty: <strong id="challan-total-qty">0</strong> Pcs</span>
          <span style="font-size: 0.9rem; font-weight: 700; color: var(--brand-primary);">Total Cost: PKR <strong id="challan-total-cost">0</strong></span>
        </div>

        <div class="form-group" style="margin-top: 1rem;">
          <label class="form-label">Receiving Notes / Cargo Vehicle #</label>
          <input type="text" id="m-challan-notes" class="form-control" placeholder="e.g. Delivered via Driver Rizwan Truck # 882" />
        </div>
      </div>
    `;

    footer.innerHTML = `
      <button class="btn btn-secondary" onclick="window.AppRouter.closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="ChallansModule.submitChallan()">✅ Post Challan & Update Stock</button>
    `;

    window.AppRouter.openModal();
    this.renderItemRows();
  },

  renderItemRows() {
    const container = document.getElementById('challan-items-container');
    if (!container) return;

    container.innerHTML = this.challanItems
      .map((item, idx) => {
        const prod = this.products.find((p) => p.id === parseInt(item.product_id, 10));
        const variants = prod ? prod.variants || [] : [];

        return `
        <div class="challan-item-row" style="background: var(--bg-app); border: 1px solid var(--border-subtle); border-radius: var(--radius-md); padding: 0.75rem; margin-bottom: 0.65rem;">
          <div style="display: grid; grid-template-columns: 2fr 1.5fr 1fr 1fr 40px; gap: 0.5rem; align-items: end;">
            <div class="form-group" style="margin: 0;">
              <label class="form-label" style="font-size: 0.72rem;">Product</label>
              <select class="form-select" onchange="ChallansModule.onProductChange(${idx}, this.value)" style="font-size: 0.82rem;">
                <option value="">Select Product...</option>
                ${this.products.map((p) => `<option value="${p.id}" ${p.id === parseInt(item.product_id, 10) ? 'selected' : ''}>${p.name} (${p.sku})</option>`).join('')}
              </select>
            </div>

            <div class="form-group" style="margin: 0;">
              <label class="form-label" style="font-size: 0.72rem;">Variant / Size</label>
              <select class="form-select" onchange="ChallansModule.onVariantChange(${idx}, this.value)" style="font-size: 0.82rem;">
                <option value="">Standard Size</option>
                ${variants.map((v) => `<option value="${v.id}" ${v.id === parseInt(item.variant_id, 10) ? 'selected' : ''}>${v.variant_name}</option>`).join('')}
              </select>
            </div>

            <div class="form-group" style="margin: 0;">
              <label class="form-label" style="font-size: 0.72rem;">Quantity</label>
              <input type="number" class="form-control" min="1" value="${item.quantity}" oninput="ChallansModule.onQtyChange(${idx}, this.value)" style="font-size: 0.85rem;" />
            </div>

            <div class="form-group" style="margin: 0;">
              <label class="form-label" style="font-size: 0.72rem;">Cost (PKR)</label>
              <input type="number" class="form-control" min="0" value="${item.unit_cost}" oninput="ChallansModule.onCostChange(${idx}, this.value)" style="font-size: 0.85rem;" />
            </div>

            <button type="button" class="btn btn-danger btn-sm" onclick="ChallansModule.removeItemRow(${idx})" style="padding: 0.45rem; height: 36px;">✕</button>
          </div>
        </div>
      `;
      })
      .join('');

    this.recalcTotals();
  },

  addItemRow() {
    this.challanItems.push({ product_id: '', variant_id: '', quantity: 1, unit_cost: 0 });
    this.renderItemRows();
  },

  removeItemRow(idx) {
    if (this.challanItems.length > 1) {
      this.challanItems.splice(idx, 1);
      this.renderItemRows();
    } else {
      window.showToast('At least one item is required.', 'error');
    }
  },

  onProductChange(idx, val) {
    this.challanItems[idx].product_id = val;
    this.challanItems[idx].variant_id = '';
    const prod = this.products.find((p) => p.id === parseInt(val, 10));
    if (prod) {
      this.challanItems[idx].unit_cost = prod.purchase_cost || 0;
    }
    this.renderItemRows();
  },

  onVariantChange(idx, val) {
    this.challanItems[idx].variant_id = val;
    this.recalcTotals();
  },

  onQtyChange(idx, val) {
    this.challanItems[idx].quantity = parseInt(val, 10) || 1;
    this.recalcTotals();
  },

  onCostChange(idx, val) {
    this.challanItems[idx].unit_cost = parseFloat(val) || 0;
    this.recalcTotals();
  },

  recalcTotals() {
    let totalQty = 0;
    let totalCost = 0;
    for (const itm of this.challanItems) {
      const q = parseInt(itm.quantity, 10) || 0;
      const c = parseFloat(itm.unit_cost) || 0;
      totalQty += q;
      totalCost += q * c;
    }

    const qtyEl = document.getElementById('challan-total-qty');
    const costEl = document.getElementById('challan-total-cost');
    if (qtyEl) qtyEl.textContent = totalQty;
    if (costEl) costEl.textContent = totalCost.toLocaleString();
  },

  async submitChallan() {
    const challanNumber = document.getElementById('m-challan-number').value.trim();
    const supplierId = document.getElementById('m-supplier-id').value;
    const showroomId = document.getElementById('m-showroom-id').value;
    const challanDate = document.getElementById('m-challan-date').value;
    const notes = document.getElementById('m-challan-notes').value.trim();

    if (!challanNumber || !supplierId || !showroomId || !challanDate) {
      return window.showToast('Please fill all required fields.', 'error');
    }

    const validItems = this.challanItems.filter((i) => i.product_id && i.quantity > 0);
    if (validItems.length === 0) {
      return window.showToast('Please specify at least one valid item.', 'error');
    }

    try {
      const res = await API.post('/challans', {
        challan_number: challanNumber,
        supplier_id: supplierId,
        showroom_id: showroomId,
        challan_date: challanDate,
        notes,
        items: validItems
      });

      if (res.success) {
        window.showToast(res.message || 'Challan recorded and stock updated.', 'success');
        window.AppRouter.closeModal();
        this.load();
      }
    } catch (err) {
      window.showToast(err.message, 'error');
    }
  },

  async viewChallan(id) {
    try {
      const res = await API.get(`/challans/${id}`);
      if (res.success) {
        const c = res.data;
        const modal = document.getElementById('common-modal');
        const title = document.getElementById('common-modal-title');
        const body = document.getElementById('common-modal-body');
        const footer = document.getElementById('common-modal-footer');

        title.textContent = `Challan Details: ${c.challan_number}`;
        body.innerHTML = `
          <div style="margin-bottom: 1rem; line-height: 1.6;">
            <div><strong>Factory/Supplier:</strong> ${c.supplier_name} (${c.supplier_phone})</div>
            <div><strong>Showroom:</strong> ${c.showroom_name} (${c.showroom_code})</div>
            <div><strong>Challan Date:</strong> ${c.challan_date} | <strong>Received By:</strong> ${c.received_by_name}</div>
            <div><strong>Notes:</strong> ${c.notes || 'None'}</div>
          </div>

          <table class="erp-table">
            <thead>
              <tr>
                <th>Product</th>
                <th>Variant / Size</th>
                <th>Quantity</th>
                <th>Unit Cost</th>
                <th>Total Cost</th>
              </tr>
            </thead>
            <tbody>
              ${(c.items || [])
                .map(
                  (itm) => `
                <tr>
                  <td><strong>${itm.product_name}</strong> (${itm.product_sku})</td>
                  <td>${itm.variant_name || 'Standard'}</td>
                  <td>${itm.quantity} ${itm.unit}</td>
                  <td>PKR ${Number(itm.unit_cost).toLocaleString()}</td>
                  <td><strong>PKR ${Number(itm.total_cost).toLocaleString()}</strong></td>
                </tr>
              `
                )
                .join('')}
            </tbody>
          </table>
        `;

        footer.innerHTML = `
          <button class="btn btn-secondary" onclick="window.print()">🖨️ Print Challan</button>
          <button class="btn btn-primary" onclick="window.AppRouter.closeModal()">Close</button>
        `;

        window.AppRouter.openModal();
      }
    } catch (err) {
      window.showToast(err.message, 'error');
    }
  }
};

window.ChallansModule = ChallansModule;
