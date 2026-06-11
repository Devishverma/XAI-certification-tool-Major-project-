import React from 'react';

function Sidebar({ activeTab, setActiveTab, theme, setTheme }) {
  const toggleTheme = () => {
    setTheme(theme === 'dark' ? 'light' : 'dark');
  };

  const navItems = [
    { id: 'audit-tab',           icon: 'fa-chart-line',         label: 'Bias Audit' },
    { id: 'explain-tab',         icon: 'fa-wand-magic-sparkles', label: 'Model XAI' },
    { id: 'recommendations-tab', icon: 'fa-list-check',          label: 'Mitigations' },
    { id: 'certificate-tab',     icon: 'fa-award',              label: 'Certificate' },
  ];

  return (
    <aside className="sidebar">
      <div className="brand">
          <i className="fa-solid fa-shield-halved logo-icon"></i>
          <div className="brand-text">
              <h1>XAI Certify</h1>
              <span>Responsible AI Engine</span>
          </div>
      </div>
      <nav className="nav-menu">
        {navItems.map(item => (
          <a
            key={item.id}
            href="#"
            className={`nav-item ${activeTab === item.id ? 'active' : ''}`}
            onClick={(e) => { e.preventDefault(); setActiveTab(item.id); }}
          >
              <i className={`fa-solid ${item.icon}`}></i> {item.label}
          </a>
        ))}
      </nav>
      <div className="sidebar-footer">
          <div className="theme-toggle" onClick={toggleTheme}>
              <i className={`fa-solid ${theme === 'dark' ? 'fa-moon' : 'fa-sun'}`}></i>
              <span>{theme === 'dark' ? 'Dark Theme' : 'Light Theme'}</span>
          </div>
          <div className="status-indicator">
              <span className="dot pulse"></span>
              <span className="status-text">Backend Connected</span>
          </div>
      </div>
    </aside>
  );
}

export default Sidebar;
