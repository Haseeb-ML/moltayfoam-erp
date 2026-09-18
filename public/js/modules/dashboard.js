// Executive ERP Dashboard Module

const DashboardModule = {
  async load() {
    const container = document.getElementById('dashboard-content');
    if (!container) return;

    container.innerHTML = `
      <div class="state-loading">
        <div class="spinner"></div>
        <div class="state-title">Loading Executive Dashboard...</div>
      </div>
    `;

    try {
      const showroomId = window.AppRouter.getCurrentShowroomId();
      const periodSelect = document.getElementById('dash-period-filter');
      const period = periodSelect ? periodSelect.value : 'today';

      const res = await API.get('/dashboard/stats', { showroom_id: showroomId, period });
      if (res.success) {
        this.render(res.data, container);
      }
    } catch (err) {
      container.innerHTML = `
        <div class="state-error">
          <div class="state-icon">⚠️</div>
          <div class="state-title">Unable to load dashboard metrics</div>
          <div class="state-desc">${err.message}</div>
          <button class="btn btn-secondary btn-sm" onclick="DashboardModule.load()" style="margin-top: 1rem;">Retry</button>
        </div>
      `;
    }
  },

  render(data, container) {
    const sales = data.sales || {};
    const deliv = data.deliveries || {};
    const inv = data.inventory || {};
    const custom = data.customOrders || {};
    const currency = 'PKR';

    container.innerHTML = `
      <!-- Top Operational KPIs Grid -->
      <div class="kpi-grid">
        <div class="kpi-card">
          <div class="kpi-icon-wrapper" style="background: rgba(59, 130, 246, 0.15); color: #3b82f6;">💰</div>
          <div class="kpi-details">
            <div class="kpi-label">Sales (Period)</div>
            <div class="kpi-value">${currency} ${Number(sales.total_sales || 0).toLocaleString()}</div>
            <div class="kpi-subtext">${sales.total_order_count || 0} Orders Placed</div>
          </div>
        </div>

        <div class="kpi-card">
          <div class="kpi-icon-wrapper" style="background: rgba(16, 185, 129, 0.15); color: #10b981;">💵</div>
          <div class="kpi-details">
            <div class="kpi-label">Cash Collected</div>
            <div class="kpi-value">${currency} ${Number(sales.total_collected || 0).toLocaleString()}</div>
            <div class="kpi-subtext">Order Receipts</div>
          </div>
        </div>

        <div class="kpi-card">
          <div class="kpi-icon-wrapper" style="background: rgba(245, 158, 11, 0.15); color: #f59e0b;">🚚</div>
          <div class="kpi-details">
            <div class="kpi-label">Active Deliveries</div>
            <div class="kpi-value">${deliv.pending_delivery_count || 0}</div>
            <div class="kpi-subtext">${deliv.out_for_delivery_count || 0} Out on Route</div>
          </div>
        </div>

        <div class="kpi-card">
          <div class="kpi-icon-wrapper" style="background: rgba(239, 68, 68, 0.15); color: #ef4444;">📦</div>
          <div class="kpi-details">
            <div class="kpi-label">COD Receivable</div>
            <div class="kpi-value">${currency} ${Number(deliv.cod_pending_amount || 0).toLocaleString()}</div>
            <div class="kpi-subtext">Pending Collection</div>
          </div>
        </div>

        <div class="kpi-card">
          <div class="kpi-icon-wrapper" style="background: rgba(139, 92, 246, 0.15); color: #8b5cf6;">🏷️</div>
          <div class="kpi-details">
            <div class="kpi-label">Total Inventory Stock</div>
            <div class="kpi-value">${Number(inv.total_units_in_stock || 0).toLocaleString()} Pcs</div>
            <div class="kpi-subtext">Retail: ${currency} ${Number(inv.total_inventory_retail_value || 0).toLocaleString()}</div>
          </div>
        </div>

        <div class="kpi-card">
          <div class="kpi-icon-wrapper" style="background: rgba(6, 182, 212, 0.15); color: #06b6d4;">✨</div>
          <div class="kpi-details">
            <div class="kpi-label">Make-To-Order Profit</div>
            <div class="kpi-value">${currency} ${Number(custom.total_custom_profit || 0).toLocaleString()}</div>
            <div class="kpi-subtext">${custom.total_custom_orders || 0} Custom Orders</div>
          </div>
        </div>

        <div class="kpi-card">
          <div class="kpi-icon-wrapper" style="background: rgba(244, 63, 94, 0.15); color: #f43f5e;">⚠️</div>
          <div class="kpi-details">
            <div class="kpi-label">Low Stock Alerts</div>
            <div class="kpi-value">${inv.low_stock_product_count || 0}</div>
            <div class="kpi-subtext">Below Threshold</div>
          </div>
        </div>

        <div class="kpi-card">
          <div class="kpi-icon-wrapper" style="background: rgba(100, 116, 139, 0.15); color: #64748b;">🧾</div>
          <div class="kpi-details">
            <div class="kpi-label">Daily Expenses</div>
            <div class="kpi-value">${currency} ${Number(data.expenses || 0).toLocaleString()}</div>
            <div class="kpi-subtext">Advances: ${currency} ${Number(data.advances || 0).toLocaleString()}</div>
          </div>
        </div>
      </div>

      <!-- Multi-Showroom Comparison & Analytics -->
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 1.5rem; margin-bottom: 1.5rem;">
        <!-- Showroom Operations Comparison -->
        <div class="card">
          <div class="card-header">
            <div class="card-title">🏢 Multi-Showroom Live Comparison</div>
            <span class="badge badge-info">Multi-Branch</span>
          </div>
          <div style="display: flex; flex-direction: column; gap: 1rem;">
            ${(data.showroomComparison || [])
              .map(
                (s) => `
              <div style="background: var(--bg-app); border: 1px solid var(--border-subtle); border-radius: var(--radius-md); padding: 1rem;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
                  <strong style="font-size: 0.95rem;">${s.name} (${s.code})</strong>
                  <span class="badge badge-success">Active</span>
                </div>
                <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 0.5rem; font-size: 0.8rem;">
                  <div>
                    <span style="color: var(--text-muted); display: block;">Sales:</span>
                    <strong>${currency} ${Number(s.total_sales || 0).toLocaleString()}</strong>
                  </div>
                  <div>
                    <span style="color: var(--text-muted); display: block;">Stock:</span>
                    <strong>${Number(s.total_stock || 0).toLocaleString()} units</strong>
                  </div>
                  <div>
                    <span style="color: var(--text-muted); display: block;">Expenses:</span>
                    <strong>${currency} ${Number(s.total_expenses || 0).toLocaleString()}</strong>
                  </div>
                </div>
              </div>
            `
              )
              .join('')}
          </div>
        </div>

        <!-- Payment Breakdown -->
        <div class="card">
          <div class="card-header">
            <div class="card-title">💳 Payment Channels</div>
            <span class="badge badge-purple">Settlement</span>
          </div>
          <div style="display: flex; flex-direction: column; gap: 0.75rem;">
            ${(data.paymentDistribution || [])
              .map(
                (p) => `
              <div style="display: flex; align-items: center; justify-content: space-between; padding: 0.65rem 0.85rem; background: var(--bg-app); border-radius: var(--radius-md); border: 1px solid var(--border-subtle);">
                <div style="display: flex; align-items: center; gap: 0.5rem;">
                  <span class="badge ${p.payment_method === 'CASH' ? 'badge-success' : p.payment_method === 'COD' ? 'badge-warning' : 'badge-info'}">
                    ${p.payment_method}
                  </span>
                  <span style="font-size: 0.85rem; color: var(--text-secondary);">${p.count} Transactions</span>
                </div>
                <strong style="font-size: 0.95rem;">${currency} ${Number(p.total_amount || 0).toLocaleString()}</strong>
              </div>
            `
              )
              .join('')}
            ${(!data.paymentDistribution || data.paymentDistribution.length === 0) ? '<p style="color: var(--text-muted); font-size: 0.85rem;">No payment transactions recorded for selected period.</p>' : ''}
          </div>
        </div>
      </div>

      <!-- Recent Orders Table -->
      <div class="table-container">
        <div class="table-toolbar">
          <div style="font-weight: 700; font-size: 1rem; color: var(--text-primary);">⚡ Recent Showroom Orders</div>
          <button class="btn btn-outline btn-sm" onclick="window.AppRouter.switchTab('sales')">View All Orders →</button>
        </div>
        <div class="table-scroll">
          <table class="erp-table">
            <thead>
              <tr>
                <th>Order #</th>
                <th>Showroom</th>
                <th>Customer</th>
                <th>Total</th>
                <th>Paid</th>
                <th>Balance</th>
                <th>Order Status</th>
                <th>Payment</th>
              </tr>
            </thead>
            <tbody>
              ${(data.recentOrders || [])
                .map(
                  (o) => `
                <tr>
                  <td><strong>${o.order_number}</strong></td>
                  <td><span class="badge badge-info">${o.showroom_code}</span></td>
                  <td>${o.customer_name}</td>
                  <td><strong>${currency} ${Number(o.net_total).toLocaleString()}</strong></td>
                  <td style="color: var(--status-success);">${currency} ${Number(o.paid_amount).toLocaleString()}</td>
                  <td style="color: ${o.remaining_balance > 0 ? 'var(--status-danger)' : 'var(--text-muted)'}; font-weight: 600;">
                    ${currency} ${Number(o.remaining_balance).toLocaleString()}
                  </td>
                  <td>
                    <span class="badge ${o.order_status === 'COMPLETED' ? 'badge-success' : o.order_status === 'CONFIRMED' ? 'badge-info' : 'badge-warning'}">
                      ${o.order_status}
                    </span>
                  </td>
                  <td>
                    <span class="badge ${o.payment_status === 'PAID' ? 'badge-success' : o.payment_status === 'PARTIAL' ? 'badge-warning' : 'badge-danger'}">
                      ${o.payment_status}
                    </span>
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
  }
};

window.DashboardModule = DashboardModule;
