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

/*
 * The wide-screen rail: the phone's bottom bar stood on its end — and now so
 * is its sub-row. The sub-page tabs sit directly beside the section they
 * belong to, with their labels written vertically, which is the whole reason
 * they fit: a horizontal "Collection" needed a 116px panel of its own, a
 * vertical one needs about 40px of gutter.
 *
 * They're absolutely positioned out of the icon column's flow, so the sections
 * keep fixed positions no matter which one is open. That was the original
 * complaint and it still holds: nothing in this column may move.
 */
function Rail({ section, child }) {
  return (
    <div className="rail-wrap">
      <nav className="nav nav-rail" aria-label="Sections">
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
              {/* Beside its parent rather than in a column of its own, so which
                  section a sub-page belongs to is positional rather than
                  something you have to remember. */}
              {active && s.children && (
                <div className="rail-subs" aria-label={`${s.label} pages`}>
                  {s.children.map((t) => (
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
              )}
            </div>
          );
        })}
      </nav>
    </div>
  );
}

function accentVars(n) {
  return {
    '--tab-accent': `var(--accent-${n})`,
    '--tab-accent-soft': `var(--accent-${n}-soft)`,
    '--tab-accent-ink': `var(--accent-${n}-ink)`,
  };
}
