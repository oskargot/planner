import { NavLink, useLocation } from 'react-router-dom';
import { NAV, matchNav, sectionPath } from '../config.js';
import { useBalance } from '../db/selectors.js';
import Icon from './Icon.jsx';

// Two renderings of the same NAV config, toggled purely by CSS breakpoint:
// narrow screens get the stacked bottom bar (§6), wide screens get a left
// rail so the content area keeps its height (Oskar's iPad markup).
export default function NavBar({ onSearch }) {
  const location = useLocation();
  const { section, child } = matchNav(location.pathname);
  // Settings isn't a nav section, and matchNav falls back to Home for
  // anything it can't place — so without this the rail lights up Home while
  // you're deep in Settings.
  const inSettings = location.pathname.startsWith('/settings');

  return (
    <>
      <BottomBar section={section} child={child} inSettings={inSettings} />
      <Rail section={section} child={child} inSettings={inSettings} onSearch={onSearch} />
    </>
  );
}

function BottomBar({ section, child, inSettings }) {
  const subTabs = section.children || null;
  const subSubTabs = child?.children || null;

  return (
    <nav className="nav nav-bottom">
      {!inSettings && subSubTabs && (
        <SubRow tabs={subSubTabs} accent={section.accent} activeId={null} />
      )}
      {!inSettings && subTabs && (
        <SubRow tabs={subTabs} accent={section.accent} activeId={child?.id} />
      )}
      <div className="nav-row">
        {NAV.map((s) => (
          <NavLink
            key={s.id}
            to={sectionPath(s)}
            className={!inSettings && s.id === section.id ? 'nav-tab active' : 'nav-tab'}
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
 * The wide-screen rail: the phone's bottom bar stood on its end. The sub-page
 * tabs are a flyout that slides out from behind the icon column, beside the
 * section they belong to, and there is no lane held open for them — a section
 * without sub-pages costs nothing, and the column is only as wide as its icons.
 *
 * They're absolutely positioned out of the icon column's flow, so the sections
 * keep fixed positions no matter which one is open. That was the original
 * complaint and it still holds: nothing in this column may move. The sections
 * therefore live in their own centred group, with the balance and the tools
 * pinned to the ends — adding them mustn't shift the icons off centre.
 *
 * The balance is here because on a phone it lives in the Home header, which is
 * fine when Home is one tap away. On the iPad you can spend a whole session on
 * other screens, and the number the entire economy runs on shouldn't need a
 * trip home to read.
 */
function Rail({ section, child, inSettings, onSearch }) {
  const balance = useBalance();

  return (
    <div className="rail-wrap">
      <nav className="nav nav-rail" aria-label="Sections">
        <NavLink to="/settings/ledger" className="rail-points" aria-label="Points and ledger">
          <Icon name="spark" size={15} />
          <span>{balance ?? '…'}</span>
        </NavLink>

        <div className="rail-sections">
          {NAV.map((s) => {
            const active = !inSettings && s.id === section.id;
            return (
              <div key={s.id} className="rail-group" style={accentVars(s.accent)}>
                <NavLink to={sectionPath(s)} className={active ? 'rail-tab active' : 'rail-tab'}>
                  <span className="nav-icon">
                    <Icon name={s.icon} size={24} />
                  </span>
                  <span className="rail-label">{s.label}</span>
                </NavLink>
                {/* Beside its parent rather than in a column of its own, so which
                    section a sub-page belongs to is positional rather than
                    something you have to remember. Keyed by section so switching
                    sections replays the slide-out; switching between two pages of
                    the same section doesn't. */}
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
        </div>

        <div className="rail-foot">
          <button className="rail-mini" onClick={onSearch} aria-label="Search (⌘K)">
            <Icon name="search" size={19} />
          </button>
          <NavLink
            to="/settings"
            className={inSettings ? 'rail-mini active' : 'rail-mini'}
            aria-label="Settings"
          >
            <Icon name="gear" size={19} />
          </NavLink>
        </div>
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
