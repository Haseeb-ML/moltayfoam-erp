// Product Master & Variants Catalog Module

const ProductsModule = {
  products: [],
  categories: [],

  async load() {
    const container = document.getElementById('products-content');
    if (!container) return;

    container.innerHTML = `
      <div class="state-loading">
        <div class="spinner"></div>
        <div class="state-title">Loading Product Catalog...</div>
      </div>
    `;

    try {
      const showroomId = window.AppRouter.getCurrentShowroomId();
      const [prodRes, catRes] = await Promise.all([
        API.get('/products', { showroom_id: showroomId }),
        API.get('/products/categories/all')
      ]);

      this.products = prodRes.data || [];
      this.categories = catRes.data || [];
      this.render(this.products, container);
    } catch (err) {
      container.innerHTML = `
        <div class="state-error">
          <div class="state-icon">⚠️</div>
          <div class="state-title">Unable to load products</div>
          <div class="state-desc">${err.message}</div>
        </div>
      `;
    }
  },

  render(products, container) {
    const currency = 'PKR';
    container.innerHTML = `
      <div class="page-header">
        <div class="page-title-group">
          <h1>🛏️ Mattress & Foam Product Master</h1>
          <p>Authorized Pakistani foam manufacturers, mattress sizes, and density variants</p>
        </div>
        <div class="page-actions">
          ${Auth.hasPermission('MANAGE_PRODUCTS') ? '<button class="btn btn-primary" onclick="ProductsModule.openAddProductModal()">+ Add Foam Product</button>' : ''}
        </div>
      </div>

      <div class="table-container">
        <div class="table-toolbar" style="flex-wrap: wrap; gap: 0.75rem;">
          <input type="text" class="form-control" placeholder="Search mattresses, SKUs, or brands..." style="max-width: 280px;" oninput="ProductsModule.filterTable(this.value)" />
          <div style="display: flex; gap: 0.35rem; flex-wrap: wrap; align-items: center;">
            <button class="btn btn-sm btn-outline active brand-filter-btn" onclick="ProductsModule.filterByBrand('', this)">All Brands</button>
            <button class="btn btn-sm btn-outline brand-filter-btn" onclick="ProductsModule.filterByBrand('Molty', this)">👑 Master MoltyFoam</button>
            <button class="btn btn-sm btn-outline brand-filter-btn" onclick="ProductsModule.filterByBrand('Diamond', this)">💎 Diamond Supreme</button>
            <button class="btn btn-sm btn-outline brand-filter-btn" onclick="ProductsModule.filterByBrand('Dura', this)">🛡️ Dura Foam</button>
            <button class="btn btn-sm btn-outline brand-filter-btn" onclick="ProductsModule.filterByBrand('Cannon', this)">⭐ Cannon</button>
            <button class="btn btn-sm btn-outline brand-filter-btn" onclick="ProductsModule.filterByBrand('United', this)">⚡ United</button>
          </div>
        </div>
        <div class="table-scroll">
          <table class="erp-table" id="products-table">
            <thead>
              <tr>
                <th>SKU</th>
                <th>Product Name</th>
                <th>Category</th>
                <th>Brand</th>
                <th>Sizes / Variants</th>
                <th>Cost Price</th>
                <th>Selling Price</th>
                <th>Available Stock</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              ${products.length === 0 ? '<tr><td colspan="9" style="text-align: center; color: var(--text-muted); padding: 2rem;">No products found.</td></tr>' : ''}
              ${products
                .map((p) => {
                  const variants = p.variants || [];
                  return `
                <tr>
                  <td><strong>${p.sku}</strong></td>
                  <td><strong>${p.name}</strong></td>
                  <td><span class="badge badge-purple">${p.category_name || '-'}</span></td>
                  <td>${p.brand || '-'}</td>
                  <td>
                    <div style="display: flex; gap: 0.3rem; flex-wrap: wrap;">
                      ${variants.map((v) => `<span class="badge badge-secondary" style="font-size: 0.68rem;">${v.variant_name}</span>`).join('')}
                      ${variants.length === 0 ? '<span style="color: var(--text-muted); font-size: 0.8rem;">Standard Size</span>' : ''}
                    </div>
                  </td>
                  <td>${currency} ${Number(p.purchase_cost).toLocaleString()}</td>
                  <td><strong>${currency} ${Number(p.selling_price).toLocaleString()}</strong></td>
                  <td>
                    <strong style="color: ${p.current_stock <= p.min_stock_alert ? 'var(--status-danger)' : 'var(--status-success)'};">
                      ${p.current_stock} ${p.unit}
                    </strong>
                  </td>
                  <td>
                    <button class="btn btn-secondary btn-sm" onclick="ProductsModule.openAddVariantModal(${p.id})">
                      + Variant
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
    const rows = document.querySelectorAll('#products-table tbody tr');
    const term = (query || '').toLowerCase();
    rows.forEach((row) => {
      row.style.display = row.textContent.toLowerCase().includes(term) ? '' : 'none';
    });
  },

  filterByBrand(brand, btn) {
    document.querySelectorAll('.brand-filter-btn').forEach((b) => b.classList.remove('active', 'btn-primary'));
    if (btn) btn.classList.add('active');
    this.filterTable(brand);
  },

  openAddProductModal() {
    const modal = document.getElementById('common-modal');
    const title = document.getElementById('common-modal-title');
    const body = document.getElementById('common-modal-body');
    const footer = document.getElementById('common-modal-footer');

    title.textContent = '🛏️ Add New Mattress / Foam Product';
    body.innerHTML = `
      <div class="form-row">
        <div class="form-group">
          <label class="form-label required">Product Name</label>
          <input type="text" id="prd-name" class="form-control" placeholder="e.g. Master MoltyOrtho High Density King" required />
        </div>
        <div class="form-group">
          <label class="form-label">SKU (Leave blank to auto-generate)</label>
          <input type="text" id="prd-sku" class="form-control" placeholder="e.g. MOLTY-ORTHO-01" />
        </div>
      </div>

      <div class="form-row">
        <div class="form-group">
          <label class="form-label required">Category</label>
          <select id="prd-category-id" class="form-select" required>
            <option value="">Select Category...</option>
            ${this.categories.map((c) => `<option value="${c.id}">${c.name}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label class="form-label required">Pakistani Foam Brand</label>
          <select id="prd-brand" class="form-select">
            <option value="Master MoltyFoam">Master MoltyFoam (The Asli Foam)</option>
            <option value="Diamond Supreme">Diamond Supreme Foam</option>
            <option value="Dura Foam">Dura Foam</option>
            <option value="Cannon Foam">Cannon Foam</option>
            <option value="United Foam">United Foam</option>
            <option value="Other Foam">Other Foam Brand</option>
          </select>
        </div>
      </div>

      <div class="form-row">
        <div class="form-group">
          <label class="form-label required">Purchase Cost (PKR)</label>
          <input type="number" id="prd-cost" class="form-control" min="0" placeholder="e.g. 24000" required />
        </div>
        <div class="form-group">
          <label class="form-label required">Selling Price (PKR)</label>
          <input type="number" id="prd-price" class="form-control" min="0" placeholder="e.g. 38000" required />
        </div>
      </div>

      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Unit of Measure</label>
          <select id="prd-unit" class="form-select">
            <option value="PCS">Mattress Pieces (PCS)</option>
            <option value="SET">Bedding Set (SET)</option>
            <option value="SQFT">Square Feet / Sheet (SQFT)</option>
            <option value="PAIR">Pillow Pair (PAIR)</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Low Stock Alert Threshold</label>
          <input type="number" id="prd-alert" class="form-control" min="1" value="5" />
        </div>
      </div>

      <div class="form-group">
        <label class="form-label">Product Description</label>
        <textarea id="prd-desc" class="form-control" rows="2" placeholder="Fabric composition, fit, care instructions"></textarea>
      </div>
    `;

    footer.innerHTML = `
      <button class="btn btn-secondary" onclick="window.AppRouter.closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="ProductsModule.submitProduct()">Save Product</button>
    `;

    window.AppRouter.openModal();
  },

  async submitProduct() {
    const name = document.getElementById('prd-name').value.trim();
    const sku = document.getElementById('prd-sku').value.trim();
    const categoryId = document.getElementById('prd-category-id').value;
    const brand = document.getElementById('prd-brand').value.trim();
    const cost = document.getElementById('prd-cost').value;
    const price = document.getElementById('prd-price').value;
    const unit = document.getElementById('prd-unit').value;
    const alertQty = document.getElementById('prd-alert').value;
    const desc = document.getElementById('prd-desc').value.trim();

    if (!name || cost === '' || price === '') {
      return window.showToast('Product name, purchase cost, and selling price are required.', 'error');
    }

    try {
      const res = await API.post('/products', {
        name,
        sku: sku || undefined,
        category_id: categoryId || undefined,
        brand,
        purchase_cost: cost,
        selling_price: price,
        unit,
        min_stock_alert: alertQty,
        description: desc
      });

      if (res.success) {
        window.showToast(res.message || 'Product created successfully.', 'success');
        window.AppRouter.closeModal();
        this.load();
      }
    } catch (err) {
      window.showToast(err.message, 'error');
    }
  },

  openAddVariantModal(productId) {
    const prod = this.products.find((p) => p.id === productId);
    if (!prod) return;

    const modal = document.getElementById('common-modal');
    const title = document.getElementById('common-modal-title');
    const body = document.getElementById('common-modal-body');
    const footer = document.getElementById('common-modal-footer');

    title.textContent = `+ Add Size / Variant to ${prod.name}`;
    body.innerHTML = `
      <div class="form-group">
        <label class="form-label required">Variant / Size Name</label>
        <input type="text" id="var-name" class="form-control" placeholder="e.g. Size: 42 Regular, Size: Medium, Size: 34x32" required />
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Purchase Cost (PKR)</label>
          <input type="number" id="var-cost" class="form-control" value="${prod.purchase_cost}" />
        </div>
        <div class="form-group">
          <label class="form-label">Selling Price (PKR)</label>
          <input type="number" id="var-price" class="form-control" value="${prod.selling_price}" />
        </div>
      </div>
    `;

    footer.innerHTML = `
      <button class="btn btn-secondary" onclick="window.AppRouter.closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="ProductsModule.submitVariant(${productId})">Add Variant</button>
    `;

    window.AppRouter.openModal();
  },

  async submitVariant(productId) {
    const name = document.getElementById('var-name').value.trim();
    const cost = document.getElementById('var-cost').value;
    const price = document.getElementById('var-price').value;

    if (!name) return window.showToast('Variant name is required.', 'error');

    try {
      const res = await API.post(`/products/${productId}/variants`, {
        variant_name: name,
        purchase_cost: cost,
        selling_price: price
      });

      if (res.success) {
        window.showToast(res.message || 'Variant added successfully.', 'success');
        window.AppRouter.closeModal();
        this.load();
      }
    } catch (err) {
      window.showToast(err.message, 'error');
    }
  }
};

window.ProductsModule = ProductsModule;
