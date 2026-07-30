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
 * The wide-screen rail: the phone's bottom bar stood on its end.
 *
 * Two columns, not one. Sections live in a fixed-position icon column, and the
 * active section's sub-pages get their own column beside it — exactly the
 * relationship the phone has between its tab bar and the sub-row above it,
 * rotated a quarter turn.
 *
 * They used to be nested, one group per section, which meant selecting a
 * section with three sub-pages shoved every section below it down the rail;
 * Rocks sat at a different height depending on where you were. Splitting the
 * columns is what makes the icons hold still.
 */
function Rail({ section, child }) {
  const subs = section.children || null;

  return (
    <div className="rail-wrap">
      <nav className="nav nav-rail" aria-label="Sections">
        {NAV.map((s) => {
          const active = s.id === section.id;
          return (
            <NavLink
              key={s.id}
              to={sectionPath(s)}
              className={active ? 'rail-tab active' : 'rail-tab'}
              style={accentVars(s.accent)}
            >
              <span className="nav-icon">
                <Icon name={s.icon} size={24} />
              </span>
              <span className="rail-label">{s.label}</span>
            </NavLink>
          );
        })}
      </nav>
      {/* Rendered even when the section has none, so the content area doesn't
          shift sideways as you move between Home and everything else. */}
      <nav
        className={`rail-subs${subs ? '' : ' empty'}`}
        style={accentVars(section.accent)}
        aria-label={subs ? `${section.label} pages` : undefined}
      >
        {subs?.map((t) => (
          <NavLink
            key={t.id}
            to={t.path}
            end
            className={t.id === child?.id ? 'rail-subtab active' : 'rail-subtab'}
          >
            {t.label}
          </NavLink>
        ))}
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
