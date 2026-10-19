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

  function Sidebar(props) {
    var me = props.me;
    var active = props.active;
    var canManage = !!me && (me.role === 'ADMIN' || me.role === 'SUPER_ADMIN');
    return h('aside', { className: 'sidebar' },
      h('div', { className: 'sidebar-brand' }, 'SLTS', h('small', null, 'Service Labor Time Standards')),
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
