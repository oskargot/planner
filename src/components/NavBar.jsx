import { NavLink, useLocation } from 'react-router-dom';
import { NAV, matchNav, sectionPath } from '../config.js';

// Three stacked rows, bottom of screen (§6): sub-sub tabs (if any), sub tabs
// (if any), section tabs (always). Entirely driven by the NAV config.
export default function NavBar() {
  const location = useLocation();
  const { section, child } = matchNav(location.pathname);
  const subTabs = section.children || null;
  const subSubTabs = child?.children || null;

  return (
    <nav className="nav">
      {subSubTabs && <TabRow tabs={subSubTabs} accent={section.accent} activeId={null} />}
      {subTabs && (
        <div className="nav-row sub" style={accentVars(section.accent)}>
          {subTabs.map((t) => (
            <NavLink
              key={t.id}
              to={t.path}
              end
              className={t.id === child?.id ? 'nav-subtab active' : 'nav-subtab'}
            >
              {t.label}
            </NavLink>
          ))}
        </div>
      )}
      <div className="nav-row">
        {NAV.map((s) => (
          <NavLink
            key={s.id}
            to={sectionPath(s)}
            className={s.id === section.id ? 'nav-tab active' : 'nav-tab'}
            style={accentVars(s.accent)}
          >
            <span className="nav-icon" aria-hidden="true">{s.icon}</span>
            {s.label}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}

function TabRow({ tabs, accent }) {
  return (
    <div className="nav-row sub" style={accentVars(accent)}>
      {tabs.map((t) => (
        <NavLink key={t.id} to={t.path} className="nav-subtab">
          {t.label}
        </NavLink>
      ))}
    </div>
  );
}

function accentVars(n) {
  return {
    '--tab-accent': `var(--accent-${n})`,
    '--tab-accent-soft': `var(--accent-${n}-soft)`,
  };
}
