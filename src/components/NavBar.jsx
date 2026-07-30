import { NavLink, useLocation } from 'react-router-dom';
import { NAV, matchNav, sectionPath } from '../config.js';
import Icon from './Icon.jsx';

// Two renderings of the same NAV config, toggled purely by CSS breakpoint:
// narrow screens get the stacked bottom bar (§6), wide screens get a left
// rail so the content area keeps its height (Oskar's iPad markup).
export default function NavBar() {
  const location = useLocation();
  const { section, child } = matchNav(location.pathname);

  return (
    <>
      <BottomBar section={section} child={child} />
      <Rail section={section} child={child} />
    </>
  );
}

function BottomBar({ section, child }) {
  const subTabs = section.children || null;
  const subSubTabs = child?.children || null;

  return (
    <nav className="nav nav-bottom">
      {subSubTabs && <SubRow tabs={subSubTabs} accent={section.accent} activeId={null} />}
      {subTabs && <SubRow tabs={subTabs} accent={section.accent} activeId={child?.id} />}
      <div className="nav-row">
        {NAV.map((s) => (
          <NavLink
            key={s.id}
            to={sectionPath(s)}
            className={s.id === section.id ? 'nav-tab active' : 'nav-tab'}
            style={accentVars(s.accent)}
          >
            <span className="nav-icon">
              <Icon name={s.icon} size={22} />
            </span>
            {s.label}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}

function SubRow({ tabs, accent, activeId }) {
  return (
    <div className="nav-row sub" style={accentVars(accent)}>
      {tabs.map((t) => (
        <NavLink
          key={t.id}
          to={t.path}
          end
          className={t.id === activeId ? 'nav-subtab active' : 'nav-subtab'}
        >
          {t.label}
        </NavLink>
      ))}
    </div>
  );
}

function Rail({ section, child }) {
  return (
    <nav className="nav nav-rail">
      {NAV.map((s) => {
        const active = s.id === section.id;
        return (
          <div key={s.id} className="rail-group" style={accentVars(s.accent)}>
            <NavLink
              to={sectionPath(s)}
              className={active ? 'rail-tab active' : 'rail-tab'}
            >
              <span className="nav-icon">
                <Icon name={s.icon} size={24} />
              </span>
              <span className="rail-label">{s.label}</span>
            </NavLink>
            {active &&
              s.children?.map((t) => (
                <NavLink
                  key={t.id}
                  to={t.path}
                  end
                  className={t.id === child?.id ? 'rail-subtab active' : 'rail-subtab'}
                >
                  {t.label}
                </NavLink>
              ))}
          </div>
        );
      })}
    </nav>
  );
}

function accentVars(n) {
  return {
    '--tab-accent': `var(--accent-${n})`,
    '--tab-accent-soft': `var(--accent-${n}-soft)`,
  };
}
