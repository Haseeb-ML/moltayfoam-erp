// Enterprise Theme Engine

const ThemeEngine = {
  init() {
    const savedTheme = localStorage.getItem('erp_theme') || 'dark'; // Dark default for modern wow factor
    this.setTheme(savedTheme);

    const toggleBtn = document.getElementById('theme-toggle');
    if (toggleBtn) {
      toggleBtn.addEventListener('click', () => {
        const current = document.documentElement.getAttribute('data-theme') || 'dark';
        const next = current === 'dark' ? 'light' : 'dark';
        this.setTheme(next);
      });
    }
  },

  setTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('erp_theme', theme);

    const toggleBtn = document.getElementById('theme-toggle');
    if (toggleBtn) {
      toggleBtn.innerHTML = theme === 'dark' ? '☀️' : '🌙';
      toggleBtn.title = theme === 'dark' ? 'Switch to Light Theme' : 'Switch to Dark Theme';
    }
  }
};

window.ThemeEngine = ThemeEngine;
