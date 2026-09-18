// Cashier Make-To-Order & Custom Order Engine

const CustomOrdersModule = {
  customers: [],

  async load() {
    const container = document.getElementById('custom-orders-content');
    if (!container) return;

    container.innerHTML = `
      <div class="state-loading">
        <div class="spinner"></div>
        <div class="state-title">Loading Make-To-Order Register...</div>
      </div>
    `;

    try {
      const showroomId = window.AppRouter.getCurrentShowroomId();
      const [ordersRes, custRes] = await Promise.all([
        API.get('/custom-orders', { showroom_id: showroomId }),
        API.get('/customers')
      ]);

      this.customers = custRes.data || [];
      this.render(ordersRes.data || [], container);
    } catch (err) {
      container.innerHTML = `
        <div class="state-error">
          <div class="state-icon">⚠️</div>
          <div class="state-title">Unable to load custom orders</div>
          <div class="state-desc">${err.message}</div>
        </div>
      `;
    }
  },

  render(orders, container) {
    const currency = 'PKR';
    container.innerHTML = `
      <div class="page-header">
        <div class="page-title-group">
          <h1>✨ Cashier Make-To-Order & Custom Production</h1>
          <p>Process customized orders for non-stock sizes and specifications with real-time cost & profit calculation</p>
        </div>
        <div class="page-actions">
          <button class="btn btn-primary" onclick="CustomOrdersModule.openCreateModal()">
            + New Custom Order
          </button>
        </div>
      </div>

      <!-- Custom Orders Data Grid -->
      <div class="table-container">
        <div class="table-toolbar">
          <div style="font-weight: 700; font-size: 1rem;">Make-To-Order Transactions</div>
          <input type="text" class="form-control" placeholder="Search custom orders..." style="max-width: 280px;" oninput="CustomOrdersModule.filterTable(this.value)" />
        </div>
        <div class="table-scroll">
          <table class="erp-table" id="custom-orders-table">
            <thead>
              <tr>
                <th>Custom Order #</th>
                <th>Showroom</th>
                <th>Customer</th>
                <th>Specification</th>
                <th>Qty</th>
                <th>Cost</th>
                <th>Sale Price</th>
                <th>Gross Profit</th>
                <th>Margin</th>
                <th>Balance</th>
                <th>Status</th>
                <th>Lock</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              ${orders.length === 0 ? '<tr><td colspan="13" style="text-align: center; color: var(--text-muted); padding: 2rem;">No custom orders recorded yet.</td></tr>' : ''}
              ${orders
                .map(
                  (co) => `
                <tr>
                  <td><strong>${co.custom_order_number}</strong></td>
                  <td><span class="badge badge-info">${co.showroom_code}</span></td>
                  <td>${co.customer_name}</td>
                  <td title="${co.size_specification}" style="max-width: 180px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                    ${co.item_description} (${co.size_specification})
                  </td>
                  <td>${co.quantity}</td>
                  <td>${currency} ${Number(co.total_cost).toLocaleString()}</td>
                  <td><strong>${currency} ${Number(co.total_sale).toLocaleString()}</strong></td>
                  <td style="color: var(--status-success); font-weight: 700;">
                    +${currency} ${Number(co.gross_profit).toLocaleString()}
                  </td>
                  <td><span class="badge badge-success">${co.profit_margin_pct}%</span></td>
                  <td style="color: ${co.remaining_balance > 0 ? 'var(--status-danger)' : 'var(--text-muted)'}; font-weight: 600;">
                    ${currency} ${Number(co.remaining_balance).toLocaleString()}
                  </td>
                  <td><span class="badge badge-purple">${co.status}</span></td>
                  <td><span title="Immutable transaction" style="font-size: 1.1rem;">🔒</span></td>
                  <td>
                    <div style="display: flex; gap: 0.35rem;">
                      <button class="btn btn-secondary btn-sm" onclick="CustomOrdersModule.viewOrder(${co.id})">👁️</button>
                      ${Auth.hasPermission('MANAGE_SETTINGS') ? `<button class="btn btn-outline btn-sm" title="Admin Correction" onclick="CustomOrdersModule.openCorrectionModal(${co.id})">⚙️</button>` : ''}
                    </div>
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
    const rows = document.querySelectorAll('#custom-orders-table tbody tr');
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

    title.textContent = '✨ New Make-To-Order Transaction (Cashier Engine)';
    body.innerHTML = `
      <div class="form-row">
        <div class="form-group">
          <label class="form-label required">Customer</label>
          <select id="co-customer-id" class="form-select" onchange="CustomOrdersModule.onCustomerSelect(this.value)">
            <option value="">Select Existing Customer...</option>
            ${this.customers.map((c) => `<option value="${c.id}">${c.name} (${c.phone})</option>`).join('')}
            <option value="NEW">+ Register New Customer at Checkout</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label required">Showroom</label>
          <select id="co-showroom-id" class="form-select">
            <option value="1">Main Showroom - Blue Area</option>
            <option value="2">City Branch - Saddar</option>
          </select>
        </div>
      </div>

      <!-- Quick customer register block if new -->
      <div id="co-new-cust-fields" style="display: none; background: var(--bg-app); border: 1px solid var(--border-subtle); border-radius: var(--radius-md); padding: 0.85rem; margin-bottom: 1rem;">
        <div class="form-row">
          <div class="form-group" style="margin-bottom: 0.5rem;">
            <label class="form-label required">Customer Name</label>
            <input type="text" id="co-new-name" class="form-control" placeholder="e.g. Asad Umar" />
          </div>
          <div class="form-group" style="margin-bottom: 0.5rem;">
            <label class="form-label required">Mobile Phone</label>
            <input type="text" id="co-new-phone" class="form-control" placeholder="0300-1234567" />
          </div>
        </div>
        <div class="form-group" style="margin-bottom: 0;">
          <label class="form-label">Delivery Address</label>
          <input type="text" id="co-new-address" class="form-control" placeholder="Street, Sector/Area, City" />
        </div>
      </div>

      <div class="form-group">
        <label class="form-label required">Custom Mattress Description</label>
        <input type="text" id="co-desc" class="form-control" placeholder="e.g. Master Molty High-Density Custom Mattress with Quilted Jacquard Cover" required />
      </div>

      <!-- Foam Cutting & Fabrication Interactive Calculator -->
      <div style="background: var(--bg-card-hover); border: 1px solid var(--border-subtle); border-radius: var(--radius-md); padding: 0.9rem; margin-bottom: 1rem;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.65rem;">
          <div style="font-weight: 800; font-size: 0.88rem; color: #0056b3; display: flex; align-items: center; gap: 0.35rem;">
            📐 Foam Cutting & Size Calculator
          </div>
          <span class="warranty-tag">10-Year Master Warranty</span>
        </div>

        <div class="form-row">
          <div class="form-group" style="margin-bottom: 0.5rem;">
            <label class="form-label" style="font-size: 0.75rem;">Length (Inches)</label>
            <input type="number" id="co-dim-l" class="form-control form-control-sm" value="78" min="12" max="120" oninput="CustomOrdersModule.onFoamParamChange()" />
          </div>
          <div class="form-group" style="margin-bottom: 0.5rem;">
            <label class="form-label" style="font-size: 0.75rem;">Width (Inches)</label>
            <input type="number" id="co-dim-w" class="form-control form-control-sm" value="72" min="12" max="120" oninput="CustomOrdersModule.onFoamParamChange()" />
          </div>
          <div class="form-group" style="margin-bottom: 0.5rem;">
            <label class="form-label" style="font-size: 0.75rem;">Thickness (Inches)</label>
            <input type="number" id="co-dim-t" class="form-control form-control-sm" value="6" min="1" max="18" oninput="CustomOrdersModule.onFoamParamChange()" />
          </div>
        </div>

        <div class="form-row">
          <div class="form-group" style="margin-bottom: 0.5rem;">
            <label class="form-label" style="font-size: 0.75rem;">Foam Density / Core Grade</label>
            <select id="co-foam-density" class="form-select form-select-sm" onchange="CustomOrdersModule.onFoamParamChange()">
              <option value="Master Molty D-32 High Resilience" data-rate="48">Master Molty D-32 (High Resilience)</option>
              <option value="Master Molty D-40 Ortho Firm" data-rate="58">Master Molty D-40 (Ortho Spine Firm)</option>
              <option value="Medical Rebonded Extra Firm" data-rate="52">Medical Rebonded Extra Firm Core</option>
              <option value="Cool Gel Memory Foam Layer" data-rate="75">Cool Gel Memory Foam Luxury Core</option>
            </select>
          </div>
          <div class="form-group" style="margin-bottom: 0.5rem;">
            <label class="form-label" style="font-size: 0.75rem;">Quilted Fabric Cover</label>
            <select id="co-cover-type" class="form-select form-select-sm" onchange="CustomOrdersModule.onFoamParamChange()">
              <option value="Quilted Jacquard Anti-Allergic" data-cost="3500">Premium Quilted Jacquard Fabric (+Rs 3,500)</option>
              <option value="Organic Knitted Cotton" data-cost="4500">Organic Breathable Knitted Cotton (+Rs 4,500)</option>
              <option value="Medical Waterproof Rexine" data-cost="2800">Medical Waterproof Rexine Zippered (+Rs 2,800)</option>
              <option value="Standard Soft Terry" data-cost="2000">Standard Soft Terry Towel (+Rs 2,000)</option>
            </select>
          </div>
        </div>
        <div style="display: flex; justify-content: space-between; font-size: 0.76rem; color: var(--text-muted); padding-top: 0.35rem; border-top: 1px dashed var(--border-subtle);">
          <span>Volume: <strong id="co-calc-bf">234 Board Feet</strong></span>
          <span>Core Cost: <strong id="co-calc-core">PKR 11,232</strong></span>
          <span>Labor & Stitching: <strong id="co-calc-labor">PKR 2,000</strong></span>
        </div>
      </div>

      <div class="form-group">
        <label class="form-label required">Custom Specifications & Dimensions</label>
        <textarea id="co-specs" class="form-control" rows="2" placeholder="e.g. Dimensions: 78x72x6 inches, Master Molty D-32, Quilted Jacquard Cover" required></textarea>
      </div>

      <div class="form-row">
        <div class="form-group">
          <label class="form-label required">Quantity</label>
          <input type="number" id="co-qty" class="form-control" min="1" value="1" oninput="CustomOrdersModule.calculateProfit()" />
        </div>
        <div class="form-group">
          <label class="form-label required">Manufacturing Cost / Unit (PKR)</label>
          <input type="number" id="co-cost" class="form-control" min="0" placeholder="e.g. 5000" oninput="CustomOrdersModule.calculateProfit()" />
        </div>
        <div class="form-group">
          <label class="form-label required">Selling Price / Unit (PKR)</label>
          <input type="number" id="co-price" class="form-control" min="0" placeholder="e.g. 8000" oninput="CustomOrdersModule.calculateProfit()" />
        </div>
      </div>

      <!-- Real-Time Profit Calculation Metric Box -->
      <div class="profit-metric-box">
        <div class="profit-item">
          <span class="profit-item-label">Total Cost</span>
          <span class="profit-item-val" id="disp-co-cost">PKR 0</span>
        </div>
        <div class="profit-item">
          <span class="profit-item-label">Total Sale Value</span>
          <span class="profit-item-val blue" id="disp-co-sale">PKR 0</span>
        </div>
        <div class="profit-item">
          <span class="profit-item-label">Gross Profit</span>
          <span class="profit-item-val green" id="disp-co-profit">PKR 0</span>
        </div>
        <div class="profit-item">
          <span class="profit-item-label">Profit Margin</span>
          <span class="profit-item-val green" id="disp-co-margin">0%</span>
        </div>
      </div>

      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Advance Payment (PKR)</label>
          <input type="number" id="co-paid" class="form-control" min="0" value="0" placeholder="e.g. 3000" />
        </div>
        <div class="form-group">
          <label class="form-label">Payment Channel</label>
          <select id="co-pay-method" class="form-select">
            <option value="CASH">Cash Counter</option>
            <option value="BANK_TRANSFER">Bank Transfer / Online</option>
            <option value="COD">Cash on Delivery (Full COD)</option>
          </select>
        </div>
      </div>

      <div class="form-group">
        <label class="form-label">Special Delivery / Event Notes</label>
        <input type="text" id="co-notes" class="form-control" placeholder="e.g. Event on 28th Sept, deliver before 3 PM" />
      </div>
    `;

    footer.innerHTML = `
      <button class="btn btn-secondary" onclick="window.AppRouter.closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="CustomOrdersModule.submitOrder()">🔒 Post Locked Custom Transaction</button>
    `;

    window.AppRouter.openModal();
    this.onFoamParamChange();
  },

  onCustomerSelect(val) {
    const newBlock = document.getElementById('co-new-cust-fields');
    if (newBlock) {
      newBlock.style.display = val === 'NEW' ? 'block' : 'none';
    }
  },

  onFoamParamChange() {
    const l = parseFloat(document.getElementById('co-dim-l')?.value) || 78;
    const w = parseFloat(document.getElementById('co-dim-w')?.value) || 72;
    const t = parseFloat(document.getElementById('co-dim-t')?.value) || 6;

    const densitySelect = document.getElementById('co-foam-density');
    const selectedDensityOpt = densitySelect?.options[densitySelect.selectedIndex];
    const rate = parseFloat(selectedDensityOpt?.getAttribute('data-rate')) || 48;
    const densityName = selectedDensityOpt?.text?.split(' - ')[0] || 'Master Molty Foam';

    const coverSelect = document.getElementById('co-cover-type');
    const selectedCoverOpt = coverSelect?.options[coverSelect.selectedIndex];
    const coverCost = parseFloat(selectedCoverOpt?.getAttribute('data-cost')) || 3500;
    const coverName = selectedCoverOpt?.text?.split(' (+')[0] || 'Quilted Cover';

    // Formula: (Length * Width * Thickness) / 144 = Board Feet (BF)
    const boardFeet = Math.round(((l * w * t) / 144) * 10) / 10;
    const coreCost = Math.round(boardFeet * rate);
    const labor = 2000;
    const wastage = Math.round((coreCost + coverCost) * 0.05);
    const unitManufacturingCost = coreCost + coverCost + labor + wastage;
    const suggestedSellingPrice = Math.round(unitManufacturingCost * 1.55);

    const bfEl = document.getElementById('co-calc-bf');
    const coreEl = document.getElementById('co-calc-core');
    const laborEl = document.getElementById('co-calc-labor');
    if (bfEl) bfEl.textContent = `${boardFeet} Board Feet`;
    if (coreEl) coreEl.textContent = `PKR ${coreCost.toLocaleString()}`;
    if (laborEl) laborEl.textContent = `PKR ${(labor + coverCost).toLocaleString()}`;

    const descInput = document.getElementById('co-desc');
    const specsInput = document.getElementById('co-specs');
    const costInput = document.getElementById('co-cost');
    const priceInput = document.getElementById('co-price');

    if (descInput) descInput.value = `Custom ${densityName} Mattress (${l}x${w}x${t}")`;
    if (specsInput) specsInput.value = `Dimensions: ${l}" x ${w}" x ${t}" inches | Foam Core: ${densityName} | Cover: ${coverName} with Heavy Border Piping & Zipper | 10-Year Master Warranty`;
    if (costInput) costInput.value = unitManufacturingCost;
    if (priceInput) priceInput.value = suggestedSellingPrice;

    this.calculateProfit();
  },

  calculateProfit() {
    const qty = parseInt(document.getElementById('co-qty').value, 10) || 1;
    const cost = parseFloat(document.getElementById('co-cost').value) || 0;
    const price = parseFloat(document.getElementById('co-price').value) || 0;

    const totalCost = cost * qty;
    const totalSale = price * qty;
    const grossProfit = totalSale - totalCost;
    const margin = totalSale > 0 ? ((grossProfit / totalSale) * 100).toFixed(1) : 0;

    document.getElementById('disp-co-cost').textContent = `PKR ${totalCost.toLocaleString()}`;
    document.getElementById('disp-co-sale').textContent = `PKR ${totalSale.toLocaleString()}`;
    document.getElementById('disp-co-profit').textContent = `PKR ${grossProfit.toLocaleString()}`;
    document.getElementById('disp-co-margin').textContent = `${margin}%`;
  },

  async submitOrder() {
    const custSelect = document.getElementById('co-customer-id').value;
    const showroomId = document.getElementById('co-showroom-id').value;
    const desc = document.getElementById('co-desc').value.trim();
    const specs = document.getElementById('co-specs').value.trim();
    const qty = parseInt(document.getElementById('co-qty').value, 10) || 1;
    const cost = parseFloat(document.getElementById('co-cost').value) || 0;
    const price = parseFloat(document.getElementById('co-price').value) || 0;
    const paid = parseFloat(document.getElementById('co-paid').value) || 0;
    const payMethod = document.getElementById('co-pay-method').value;
    const notes = document.getElementById('co-notes').value.trim();

    if (!desc || !specs || price <= 0) {
      return window.showToast('Please provide description, specifications and valid selling price.', 'error');
    }

    const payload = {
      showroom_id: showroomId,
      item_description: desc,
      size_specification: specs,
      quantity: qty,
      manufacturing_cost: cost,
      selling_price: price,
      paid_amount: paid,
      payment_method: payMethod,
      notes
    };

    if (custSelect === 'NEW') {
      const name = document.getElementById('co-new-name').value.trim();
      const phone = document.getElementById('co-new-phone').value.trim();
      const address = document.getElementById('co-new-address').value.trim();
      if (!name || !phone) {
        return window.showToast('Customer name and phone are required.', 'error');
      }
      payload.customer_data = { name, phone, address };
      payload.delivery_address = address;
    } else if (custSelect) {
      payload.customer_id = custSelect;
    } else {
      return window.showToast('Please select or register a customer.', 'error');
    }

    try {
      const res = await API.post('/custom-orders', payload);
      if (res.success) {
        window.showToast(res.message || 'Custom order created successfully.', 'success');
        window.AppRouter.closeModal();
        this.load();
      }
    } catch (err) {
      window.showToast(err.message, 'error');
    }
  },

  async viewOrder(id) {
    try {
      const res = await API.get(`/custom-orders/${id}`);
      if (res.success) {
        const co = res.data;
        const modal = document.getElementById('common-modal');
        const title = document.getElementById('common-modal-title');
        const body = document.getElementById('common-modal-body');
        const footer = document.getElementById('common-modal-footer');

        title.textContent = `Custom Order: ${co.custom_order_number}`;
        body.innerHTML = `
          <div style="background: var(--bg-app); border-radius: var(--radius-md); padding: 1rem; margin-bottom: 1rem; line-height: 1.6;">
            <div><strong>Customer:</strong> ${co.customer_name} (${co.customer_phone})</div>
            <div><strong>Item:</strong> ${co.item_description}</div>
            <div><strong>Specifications:</strong> ${co.size_specification}</div>
            <div><strong>Showroom:</strong> ${co.showroom_name} | <strong>Cashier:</strong> ${co.cashier_name}</div>
          </div>

          <div class="profit-metric-box">
            <div class="profit-item">
              <span class="profit-item-label">Total Cost</span>
              <span class="profit-item-val">PKR ${Number(co.total_cost).toLocaleString()}</span>
            </div>
            <div class="profit-item">
              <span class="profit-item-label">Total Sale</span>
              <span class="profit-item-val blue">PKR ${Number(co.total_sale).toLocaleString()}</span>
            </div>
            <div class="profit-item">
              <span class="profit-item-label">Gross Profit</span>
              <span class="profit-item-val green">+PKR ${Number(co.gross_profit).toLocaleString()}</span>
            </div>
            <div class="profit-item">
              <span class="profit-item-label">Margin</span>
              <span class="profit-item-val green">${co.profit_margin_pct}%</span>
            </div>
          </div>

          <div style="margin-top: 1rem;">
            <div style="font-weight: 700; margin-bottom: 0.5rem;">Payment & Balance</div>
            <div>Paid Amount: <strong style="color: var(--status-success);">PKR ${Number(co.paid_amount).toLocaleString()}</strong></div>
            <div>Remaining Balance: <strong style="color: var(--status-danger);">PKR ${Number(co.remaining_balance).toLocaleString()}</strong></div>
            <div>Status: <span class="badge badge-purple">${co.status}</span></div>
          </div>
        `;

        footer.innerHTML = `
          <button class="btn btn-secondary" onclick="window.print()">🖨️ Print Invoice</button>
          <button class="btn btn-primary" onclick="window.AppRouter.closeModal()">Close</button>
        `;

        window.AppRouter.openModal();
      }
    } catch (err) {
      window.showToast(err.message, 'error');
    }
  },

  openCorrectionModal(id) {
    const modal = document.getElementById('common-modal');
    const title = document.getElementById('common-modal-title');
    const body = document.getElementById('common-modal-body');
    const footer = document.getElementById('common-modal-footer');

    title.textContent = '🔒 Admin Controlled Correction (Strict Audit)';
    body.innerHTML = `
      <div style="background: rgba(245, 158, 11, 0.1); border: 1px solid var(--status-warning); border-radius: var(--radius-md); padding: 0.85rem; margin-bottom: 1rem; font-size: 0.85rem; color: var(--text-primary);">
        ⚠️ <strong>Security Audit Warning:</strong> Historical custom transactions are strictly locked. Any adjustment requires a mandatory explanation and creates a permanent record in the immutable audit log.
      </div>
      <div class="form-group">
        <label class="form-label required">Correction Reason</label>
        <textarea id="co-corr-reason" class="form-control" rows="2" placeholder="Explain the business reason for adjusting this transaction (min 10 characters)..." required></textarea>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">New Manufacturing Cost / Unit (PKR)</label>
          <input type="number" id="co-corr-cost" class="form-control" />
        </div>
        <div class="form-group">
          <label class="form-label">New Selling Price / Unit (PKR)</label>
          <input type="number" id="co-corr-price" class="form-control" />
        </div>
      </div>
    `;

    footer.innerHTML = `
      <button class="btn btn-secondary" onclick="window.AppRouter.closeModal()">Cancel</button>
      <button class="btn btn-danger" onclick="CustomOrdersModule.submitCorrection(${id})">Apply Admin Correction</button>
    `;

    window.AppRouter.openModal();
  },

  async submitCorrection(id) {
    const reason = document.getElementById('co-corr-reason').value.trim();
    const cost = document.getElementById('co-corr-cost').value;
    const price = document.getElementById('co-corr-price').value;

    if (!reason || reason.length < 10) {
      return window.showToast('A detailed reason (min 10 characters) is mandatory.', 'error');
    }

    try {
      const res = await API.post(`/custom-orders/${id}/correct`, {
        reason,
        new_manufacturing_cost: cost ? parseFloat(cost) : undefined,
        new_selling_price: price ? parseFloat(price) : undefined
      });

      if (res.success) {
        window.showToast(res.message || 'Custom order corrected successfully.', 'success');
        window.AppRouter.closeModal();
        this.load();
      }
    } catch (err) {
      window.showToast(err.message, 'error');
    }
  }
};

window.CustomOrdersModule = CustomOrdersModule;
