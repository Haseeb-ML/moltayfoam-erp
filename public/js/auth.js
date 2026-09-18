// Dynamic RBAC & Authentication Manager

const Auth = {
  currentUser: null,

  init() {
    this.currentUser = API.getUser();
    if (!this.currentUser) {
      // Auto-initialize with Super Admin session for immediate live access and data entry
      const defaultAdmin = {
        id: 1,
        username: 'admin',
        full_name: 'Super Admin (Dealership Owner)',
        role_id: 1,
        role_name: 'Super Admin',
        showroom_id: null,
        showroom_name: 'Master MoltyFoam Flagship Gallery - Blue Area',
        showroom_code: 'SH-01',
        permissions: [
          'ALL_SHOWROOMS', 'VIEW_DASHBOARD', 'VIEW_SHOWROOMS', 'MANAGE_SHOWROOMS',
          'VIEW_PRODUCTS', 'MANAGE_PRODUCTS', 'VIEW_CHALLANS', 'CREATE_CHALLAN',
          'MOBILE_CHALLAN', 'VIEW_INVENTORY', 'ADJUST_INVENTORY', 'TRANSFER_INVENTORY',
          'VIEW_CUSTOMERS', 'MANAGE_CUSTOMERS', 'VIEW_SALES', 'CREATE_SALE',
          'VIEW_INVOICES', 'VIEW_PAYMENTS', 'CREATE_PAYMENT', 'VIEW_CUSTOM_ORDERS',
          'CREATE_CUSTOM_ORDERS', 'VIEW_DELIVERIES', 'UPDATE_DELIVERY', 'VIEW_STAFF',
          'MANAGE_STAFF', 'VIEW_ADVANCES', 'CREATE_ADVANCE', 'VIEW_EXPENSES',
          'CREATE_EXPENSE', 'VIEW_REPORTS', 'EXPORT_REPORTS', 'VIEW_AUDIT', 'MANAGE_SETTINGS'
        ]
      };
      API.setToken('demo-token-master');
      API.setUser(defaultAdmin);
      this.currentUser = defaultAdmin;
    }

    this.renderUserBadge();
    this.applyDynamicTabs();
    this.hideLoginModal();

    window.addEventListener('erp:auth-expired', () => {
      this.currentUser = null;
      this.showLoginModal();
    });
  },

  hasPermission(permCode) {
    if (!this.currentUser) return true; // Default allow in client fallback if not set
    if (this.currentUser.role_id === 1) return true; // Super Admin bypass
    if (this.currentUser.permissions && this.currentUser.permissions.includes('ALL_SHOWROOMS') && this.currentUser.permissions.includes(permCode)) {
      return true;
    }
    return Boolean(this.currentUser.permissions && this.currentUser.permissions.includes(permCode));
  },

  renderUserBadge() {
    const user = this.currentUser;
    if (!user) return;

    const nameEl = document.getElementById('sidebar-user-name');
    const roleEl = document.getElementById('sidebar-user-role');
    const avatarEl = document.getElementById('sidebar-user-avatar');

    if (nameEl) nameEl.textContent = user.full_name || user.username;
    if (roleEl) roleEl.textContent = user.role_name || 'Staff';
    if (avatarEl) {
      const initials = (user.full_name || user.username)
        .split(' ')
        .map((n) => n[0])
        .join('')
        .toUpperCase()
        .substring(0, 2);
      avatarEl.textContent = initials || '👑';
    }
  },

  applyDynamicTabs() {
    const navItems = document.querySelectorAll('.nav-item[data-permission]');
    let firstVisibleTab = null;

    navItems.forEach((item) => {
      const perm = item.getAttribute('data-permission');
      if (this.hasPermission(perm)) {
        item.style.display = 'flex';
        if (!firstVisibleTab) firstVisibleTab = item.getAttribute('data-tab');
      } else {
        item.style.display = 'none';
      }
    });

    // If current active tab is forbidden, navigate to first permitted tab
    const activeTab = document.querySelector('.nav-item.active');
    if (activeTab && activeTab.style.display === 'none' && firstVisibleTab) {
      window.AppRouter.switchTab(firstVisibleTab);
    }
  },

  showLoginModal() {
    const modal = document.getElementById('login-modal');
    if (modal) modal.classList.add('active');
  },

  hideLoginModal() {
    const modal = document.getElementById('login-modal');
    if (modal) modal.classList.remove('active');
  },

  async login(username, password) {
    try {
      const res = await API.post('/auth/login', { username, password });
      if (res.success && res.token) {
        API.setToken(res.token);
        API.setUser(res.user);
        this.currentUser = res.user;

        this.hideLoginModal();
        this.renderUserBadge();
        this.applyDynamicTabs();

        // Refresh showrooms selector and active tab
        window.dispatchEvent(new CustomEvent('erp:login-success'));
        window.showToast(`Welcome back, ${res.user.full_name}!`, 'success');
        return true;
      }
    } catch (err) {
      window.showToast(err.message || 'Login failed', 'error');
      return false;
    }
  },

  logout() {
    API.clearToken();
    this.currentUser = null;
    this.showLoginModal();
    window.showToast('You have been logged out. Choose a demo persona to continue.', 'info');
  }
};

window.Auth = Auth;
