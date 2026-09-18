// Master ERP Application Router and State Coordinator

const AppRouter = {
  currentTab: 'dashboard',
  selectedShowroomId: '', // '' = All Showrooms, or ID string

  init() {
    ThemeEngine.init();
    Auth.init();

    // Mobile drawer toggle
    const menuBtn = document.getElementById('menu-toggle');
    const sidebar = document.getElementById('app-sidebar');
    const backdrop = document.getElementById('drawer-backdrop');

    if (menuBtn && sidebar && backdrop) {
      menuBtn.addEventListener('click', () => {
        sidebar.classList.toggle('drawer-open');
        backdrop.classList.toggle('active');
      });

      backdrop.addEventListener('click', () => {
        sidebar.classList.remove('drawer-open');
        backdrop.classList.remove('active');
      });
    }

    // Navigation Tab clicks
    document.querySelectorAll('.nav-item[data-tab]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const tab = btn.getAttribute('data-tab');
        this.switchTab(tab);

        // Close mobile drawer if open
        if (sidebar) sidebar.classList.remove('drawer-open');
        if (backdrop) backdrop.classList.remove('active');
      });
    });

    // Global Showroom Selector change
    const showroomSelect = document.getElementById('global-showroom-select');
    if (showroomSelect) {
      showroomSelect.addEventListener('change', (e) => {
        this.onShowroomChange(e.target.value);
      });
    }

    // Login success handler
    window.addEventListener('erp:login-success', () => {
      this.populateShowroomsDropdown();
      this.switchTab(this.currentTab || 'dashboard');
    });

    if (Auth.currentUser) {
      this.populateShowroomsDropdown();
      const initialTab = window.location.hash.replace('#', '') || 'dashboard';
      this.switchTab(initialTab);
    }
  },

  async populateShowroomsDropdown() {
    const select = document.getElementById('global-showroom-select');
    if (!select) return;

    try {
      const res = await API.get('/showrooms');
      const showrooms = res.data || [];

      // Check if user has cross-showroom access permission
      const canAccessAll = Auth.hasPermission('ALL_SHOWROOMS') || (Auth.currentUser && Auth.currentUser.showroom_id === null);

      let optionsHtml = '';
      if (canAccessAll) {
        optionsHtml += '<option value="">All Showrooms (Combined View)</option>';
      }

      for (const s of showrooms) {
        if (!canAccessAll && Auth.currentUser && Auth.currentUser.showroom_id !== s.id) {
          continue; // Filter out inaccessible showrooms
        }
        optionsHtml += `<option value="${s.id}">${s.name} (${s.code})</option>`;
      }

      select.innerHTML = optionsHtml;

      if (!canAccessAll && Auth.currentUser && Auth.currentUser.showroom_id) {
        select.value = String(Auth.currentUser.showroom_id);
        this.selectedShowroomId = String(Auth.currentUser.showroom_id);
      }
    } catch (err) {
      console.error('Failed to load showrooms for dropdown:', err);
    }
  },

  onShowroomChange(showroomId) {
    this.selectedShowroomId = showroomId;
    window.showToast(showroomId ? `Switched to Showroom #${showroomId}` : 'Switched to Combined Showroom View', 'info');
    this.reloadCurrentTab();
  },

  getCurrentShowroomId() {
    return this.selectedShowroomId || (Auth.currentUser && Auth.currentUser.showroom_id ? String(Auth.currentUser.showroom_id) : '');
  },

  switchTab(tabName) {
    this.currentTab = tabName;
    window.location.hash = tabName;

    // Update active state on nav items
    document.querySelectorAll('.nav-item').forEach((item) => {
      if (item.getAttribute('data-tab') === tabName) {
        item.classList.add('active');
      } else {
        item.classList.remove('active');
      }
    });

    // Update active pane
    document.querySelectorAll('.tab-pane').forEach((pane) => {
      pane.classList.remove('active');
    });

    const targetPane = document.getElementById(`tab-${tabName}`);
    if (targetPane) {
      targetPane.classList.add('active');
    }

    this.reloadCurrentTab();
  },

  reloadCurrentTab() {
    switch (this.currentTab) {
      case 'dashboard':
        DashboardModule.load();
        break;
      case 'challans':
        ChallansModule.load();
        break;
      case 'custom-orders':
        CustomOrdersModule.load();
        break;
      case 'sales':
        SalesModule.load();
        break;
      case 'inventory':
        InventoryModule.load();
        break;
      case 'customers':
        CustomersModule.load();
        break;
      case 'deliveries':
        DeliveriesModule.load();
        break;
      case 'staff':
        StaffModule.load();
        break;
      case 'expenses':
        ExpensesModule.load();
        break;
      case 'payments':
        PaymentsModule.load();
        break;
      case 'reports':
        ReportsModule.load();
        break;
      case 'audit':
        AuditModule.load();
        break;
      case 'settings':
        SettingsModule.load();
        break;
      case 'showrooms':
        ShowroomsModule.load();
        break;
      case 'products':
        ProductsModule.load();
        break;
      default:
        DashboardModule.load();
    }
  },

  openModal() {
    const modal = document.getElementById('common-modal');
    if (modal) modal.classList.add('active');
  },

  closeModal() {
    const modal = document.getElementById('common-modal');
    if (modal) modal.classList.remove('active');
  }
};

// Global Toast Notification Helper
function showToast(message, type = 'info') {
  let displayMsg = message;
  if (!displayMsg || displayMsg === 'undefined' || typeof displayMsg !== 'string') {
    if (type === 'success') displayMsg = 'Operation completed successfully!';
    else if (type === 'error') displayMsg = 'Operation encountered an issue.';
    else displayMsg = 'Notification received.';
  }

  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast-message toast-${type}`;

  const icon = type === 'success' ? '✅' : type === 'error' ? '❌' : 'ℹ️';
  toast.innerHTML = `<span>${icon}</span> <span>${displayMsg}</span>`;

  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => {
      if (toast.parentNode) toast.parentNode.removeChild(toast);
    }, 300);
  }, 3500);
}

window.showToast = showToast;
window.AppRouter = AppRouter;

// Bootstrap on DOM ready
document.addEventListener('DOMContentLoaded', () => {
  AppRouter.init();
});
