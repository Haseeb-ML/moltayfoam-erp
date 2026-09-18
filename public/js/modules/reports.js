// Business Reports & Analytics Engine with CSV Export & Printing

const ReportsModule = {
  currentType: 'sales',

  async load() {
    const container = document.getElementById('reports-content');
    if (!container) return;

    container.innerHTML = `
      <div class="page-header">
        <div class="page-title-group">
          <h1>📊 Business Analytics & Reporting Suite</h1>
          <p>Exportable reports for sales, showroom inventory, stock movements, deliveries, expenses, and profitability</p>
        </div>
        <div class="page-actions">
          <button class="btn btn-secondary btn-sm" onclick="ReportsModule.exportCsv()">
            📥 Export to CSV
          </button>
          <button class="btn btn-primary btn-sm" onclick="window.print()">
            🖨️ Print Report
          </button>
        </div>
      </div>

      <!-- Controls Toolbar -->
      <div class="card" style="margin-bottom: 1.5rem; padding: 1rem;">
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 0.75rem; align-items: end;">
          <div class="form-group" style="margin: 0;">
            <label class="form-label">Report Category</label>
            <select id="report-type-select" class="form-select" onchange="ReportsModule.onTypeChange(this.value)">
              <option value="sales">Sales & Revenue</option>
              <option value="inventory">Inventory Valuation</option>
              <option value="stock_movements">Stock Movement Audit</option>
              <option value="challans">Factory Challans</option>
              <option value="deliveries">Delivery & COD Collection</option>
              <option value="expenses">Showroom Daily Expenses</option>
              <option value="advances">Employee Advances</option>
              <option value="custom_orders">Make-To-Order Profitability</option>
            </select>
          </div>

          <div class="form-group" style="margin: 0;">
            <label class="form-label">From Date</label>
            <input type="date" id="rep-from-date" class="form-control" />
          </div>

          <div class="form-group" style="margin: 0;">
            <label class="form-label">To Date</label>
            <input type="date" id="rep-to-date" class="form-control" />
          </div>

          <div class="form-group" style="margin: 0;">
            <button class="btn btn-primary" style="width: 100%;" onclick="ReportsModule.fetchReport()">
              🔍 Generate Report
            </button>
          </div>
        </div>
      </div>

      <!-- Report Results Canvas -->
      <div id="report-results-canvas" class="table-container">
        <!-- Results rendered dynamically -->
      </div>
    `;

    this.fetchReport();
  },

  onTypeChange(val) {
    this.currentType = val;
    this.fetchReport();
  },

  async fetchReport() {
    const canvas = document.getElementById('report-results-canvas');
    if (!canvas) return;

    canvas.innerHTML = `
      <div class="state-loading">
        <div class="spinner"></div>
        <div class="state-title">Compiling Enterprise Report...</div>
      </div>
    `;

    const type = document.getElementById('report-type-select')?.value || this.currentType;
    const fromDate = document.getElementById('rep-from-date')?.value;
    const toDate = document.getElementById('rep-to-date')?.value;
    const showroomId = window.AppRouter.getCurrentShowroomId();

    try {
      const res = await API.get(`/reports/${type}`, {
        from_date: fromDate,
        to_date: toDate,
        showroom_id: showroomId
      });

      if (res.success) {
        this.renderTable(res.data || [], canvas);
      }
    } catch (err) {
      canvas.innerHTML = `
        <div class="state-error">
          <div class="state-icon">⚠️</div>
          <div class="state-title">Error generating report</div>
          <div class="state-desc">${err.message}</div>
        </div>
      `;
    }
  },

  renderTable(rows, canvas) {
    if (!rows || rows.length === 0) {
      canvas.innerHTML = `
        <div class="state-empty">
          <div class="state-icon">📭</div>
          <div class="state-title">No records match the report criteria</div>
          <div class="state-desc">Try widening your date range or adjusting the showroom filter.</div>
        </div>
      `;
      return;
    }

    const columns = Object.keys(rows[0]);

    canvas.innerHTML = `
      <div class="table-toolbar">
        <div style="font-weight: 700; font-size: 0.95rem;">
          Report Preview: <span style="text-transform: uppercase; color: var(--brand-primary);">${this.currentType.replace('_', ' ')}</span> (${rows.length} rows)
        </div>
      </div>
      <div class="table-scroll">
        <table class="erp-table" style="font-size: 0.85rem;">
          <thead>
            <tr>
              ${columns.map((col) => `<th>${col.replace(/_/g, ' ')}</th>`).join('')}
            </tr>
          </thead>
          <tbody>
            ${rows
              .map(
                (row) => `
              <tr>
                ${columns
                  .map((col) => {
                    const val = row[col];
                    if (typeof val === 'number') {
                      return `<td><strong>${val.toLocaleString()}</strong></td>`;
                    }
                    return `<td>${val !== null && val !== undefined ? val : '-'}</td>`;
                  })
                  .join('')}
              </tr>
            `
              )
              .join('')}
          </tbody>
        </table>
      </div>
    `;
  },

  async exportCsv() {
    const type = document.getElementById('report-type-select')?.value || this.currentType;
    const fromDate = document.getElementById('rep-from-date')?.value;
    const toDate = document.getElementById('rep-to-date')?.value;
    const showroomId = window.AppRouter.getCurrentShowroomId();

    try {
      const blob = await API.get(`/reports/${type}`, {
        from_date: fromDate,
        to_date: toDate,
        showroom_id: showroomId,
        format: 'csv'
      });

      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `erp-${type}-report-${Date.now()}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);

      window.showToast('Report CSV exported successfully!', 'success');
    } catch (err) {
      window.showToast(err.message, 'error');
    }
  }
};

window.ReportsModule = ReportsModule;
