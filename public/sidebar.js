/*
 * sidebar.js
 * Shared left navigation + page frame for every signed-in page (index,
 * users, audit). Plain React.createElement — no JSX — so it loads as an
 * ordinary <script> after React and before each page's Babel-compiled app
 * code, and there is still no build step. Exposes:
 *   window.Sidebar      React component: <Sidebar active="data|users|audit" me={me} onLogout={fn} />
 *   window.formatWhen   ISO timestamp -> local "18 Oct 2026, 11:40" style string
 * Admin-only links (Manage Access, Audit Log) are hidden for Viewers; the
 * server still gates those pages and APIs by role regardless.
 */
(function () {
  var css = [
    '.layout { display: flex; min-height: 100vh; }',
    '.sidebar { flex: 0 0 230px; width: 230px; background: #111827; color: #e5e7eb; display: flex; flex-direction: column; position: sticky; top: 0; height: 100vh; }',
    '.sidebar-brand { font-size: 20px; font-weight: 800; letter-spacing: .04em; padding: 22px 22px 14px; color: #fff; }',
    '.sidebar-brand small { display: block; font-size: 11px; font-weight: 500; letter-spacing: 0; color: #9ca3af; margin-top: 2px; }',
    '.sidebar-nav { display: flex; flex-direction: column; padding: 6px 12px; gap: 2px; }',
    '.sidebar-link { display: block; padding: 10px 12px; border-radius: 8px; color: #d1d5db; text-decoration: none; font-size: 14px; font-weight: 600; }',
    '.sidebar-link:hover { background: #1f2937; color: #fff; }',
    '.sidebar-link.active { background: #1d4ed8; color: #fff; }',
    '.sidebar-section { font-size: 10.5px; font-weight: 700; text-transform: uppercase; letter-spacing: .06em; color: #6b7280; padding: 14px 12px 4px; }',
    '.sidebar-user { margin-top: auto; padding: 16px 22px 20px; border-top: 1px solid #1f2937; font-size: 13px; }',
    '.sidebar-user-name { font-weight: 600; color: #fff; word-break: break-all; }',
    '.sidebar-user-role { font-size: 11px; text-transform: uppercase; letter-spacing: .04em; color: #9ca3af; margin: 2px 0 10px; }',
    '.sidebar-logout { padding: 6px 12px; border: 1px solid #374151; background: transparent; color: #d1d5db; border-radius: 999px; font-size: 12px; font-weight: 600; cursor: pointer; }',
    '.sidebar-logout:hover { background: #7f1d1d; border-color: #7f1d1d; color: #fff; }',
    '.main { flex: 1; min-width: 0; }',
    '.sidebar-head { display: flex; align-items: flex-start; justify-content: space-between; }',
    '.sidebar-hide { margin: 18px 12px 0 0; width: 30px; height: 30px; border: 1px solid #374151; background: transparent; color: #9ca3af; border-radius: 8px; font-size: 16px; line-height: 1; cursor: pointer; }',
    '.sidebar-hide:hover { background: #1f2937; color: #fff; }',
    '.sidebar-show { position: fixed; top: 14px; left: 14px; z-index: 50; width: 36px; height: 36px; border: 1px solid #374151; background: #111827; color: #e5e7eb; border-radius: 8px; font-size: 18px; line-height: 1; cursor: pointer; box-shadow: 0 4px 14px rgba(0,0,0,.18); }',
    '.sidebar-show:hover { background: #1f2937; color: #fff; }',
    '.layout.sidebar-hidden .wrap { padding-left: 64px; }',
    '@media (max-width: 760px) { .layout { flex-direction: column; } .sidebar { position: static; height: auto; width: auto; flex: none; } .sidebar-user { margin-top: 0; } }',
  ].join('\n');
  var style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);

  var h = React.createElement;
  var ROLE_LABEL = { SUPER_ADMIN: 'Super Admin', ADMIN: 'Admin', USER: 'Viewer' };

  function link(href, label, isActive) {
    return h('a', { href: href, className: 'sidebar-link' + (isActive ? ' active' : '') }, label);
  }

  // Hidden/shown state is remembered per browser (localStorage) so it
  // sticks across pages and reloads. Guarded: storage can be unavailable
  // in private windows, in which case it simply starts visible each time.
  var STORAGE_KEY = 'slts.sidebarHidden';
  function readHidden() { try { return localStorage.getItem(STORAGE_KEY) === '1'; } catch (e) { return false; } }
  function writeHidden(v) { try { localStorage.setItem(STORAGE_KEY, v ? '1' : '0'); } catch (e) { /* ignore */ } }

  function Sidebar(props) {
    var me = props.me;
    var active = props.active;
    var canManage = !!me && (me.role === 'ADMIN' || me.role === 'SUPER_ADMIN');
    var state = React.useState(readHidden);
    var hidden = state[0];
    var setHidden = state[1];

    // The page frame (.layout) is the parent; toggle a class on it so the
    // content can pad itself away from the floating "show" button.
    React.useEffect(function () {
      var layout = document.querySelector('.layout');
      if (layout) layout.classList.toggle('sidebar-hidden', hidden);
    }, [hidden]);

    function toggle() { var next = !hidden; setHidden(next); writeHidden(next); }

    if (hidden) {
      return h('button', { className: 'sidebar-show', onClick: toggle, title: 'Show menu', 'aria-label': 'Show menu' }, '☰');
    }

    return h('aside', { className: 'sidebar' },
      h('div', { className: 'sidebar-head' },
        h('div', { className: 'sidebar-brand' }, 'SLTS', h('small', null, 'Service Labor Time Standards')),
        h('button', { className: 'sidebar-hide', onClick: toggle, title: 'Hide menu', 'aria-label': 'Hide menu' }, '«')
      ),
      h('nav', { className: 'sidebar-nav' },
        link('/', 'Labor Times', active === 'data'),
        canManage ? h('div', { className: 'sidebar-section' }, 'Administration') : null,
        canManage ? link('/users.html', 'Manage Access', active === 'users') : null,
        canManage ? link('/audit.html', 'Audit Log', active === 'audit') : null
      ),
      me ? h('div', { className: 'sidebar-user' },
        h('div', { className: 'sidebar-user-name' }, me.name || me.email),
        h('div', { className: 'sidebar-user-role' }, ROLE_LABEL[me.role] || me.role),
        props.onLogout ? h('button', { className: 'sidebar-logout', onClick: props.onLogout }, 'Sign out') : null
      ) : null
    );
  }

  function formatWhen(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    if (isNaN(d.getTime())) return String(iso);
    return d.toLocaleString(undefined, { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  window.Sidebar = Sidebar;
  window.formatWhen = formatWhen;
})();
