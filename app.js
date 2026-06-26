// ============================================================
// JMS Shipment Tracker — Shared App Module
// ============================================================

const AUTH_KEY = 'jms_user';
const PAT_KEY = 'jms_github_pat';
const REPO = 'flbocateam/JMS-Shipment-Tracker';

// ── Activity / presence logging (Google Apps Script endpoint) ──
// Writes are open (any browser posts its own activity); reads require a key.
const ACTIVITY_URL = 'https://script.google.com/macros/s/AKfycbxnAIINOHF9NVG_0-hrSE71LAr8m2l-KGBygi0CGJpAmVqc58FOLQOWvA-a4sXYV167/exec';
const ACTIVITY_KEY_STORE = 'jms_activity_key';

// Fire-and-forget: log a login or heartbeat ("ping") for the current user.
function logActivity(event) {
  if (!ACTIVITY_URL) return;
  const u = getUser();
  if (!u || !u.email) return;
  try {
    fetch(ACTIVITY_URL, {
      method: 'POST', mode: 'no-cors', keepalive: true,
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ email: u.email, name: u.name, role: u.role, event: event || 'ping', page: (location.pathname.split('/').pop() || 'page') })
    });
  } catch (_) {}
}
let _presenceTimer = null;
function startPresence() {
  if (!ACTIVITY_URL || !getUser()) return;
  logActivity('ping');
  if (_presenceTimer) clearInterval(_presenceTimer);
  _presenceTimer = setInterval(() => { if (document.visibilityState === 'visible') logActivity('ping'); }, 60000);
}
// Read the activity summary. The Apps Script returns Access-Control-Allow-Origin:*,
// so a plain cross-origin fetch works (no JSONP/injected-script needed).
function fetchActivitySummary(key, cb) {
  if (!ACTIVITY_URL) { cb({ ok: false, error: 'not configured' }); return; }
  fetch(ACTIVITY_URL + '?key=' + encodeURIComponent(key), { method: 'GET' })
    .then(r => r.json())
    .then(d => cb(d))
    .catch(() => cb({ ok: false, error: 'network' }));
}

// ── Nav Icons ────────────────────────────────────────────────
const ICONS = {
  shipments: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="5" width="12" height="9" rx="1"/><path d="M5 5V3.5A1.5 1.5 0 0 1 6.5 2h3A1.5 1.5 0 0 1 11 3.5V5"/><path d="M2 8h12"/></svg>',
  analytics: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16"><rect x="2" y="9" width="3" height="5" rx="0.5" fill="currentColor" stroke="none"/><rect x="6.5" y="6" width="3" height="8" rx="0.5" fill="currentColor" stroke="none"/><rect x="11" y="3" width="3" height="11" rx="0.5" fill="currentColor" stroke="none"/></svg>',
  import: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M8 2v8M5 5l3-3 3 3"/><path d="M3 11v2a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1v-2"/></svg>',
  users: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="5" r="2.5"/><path d="M2.5 14c0-3.038 2.462-5.5 5.5-5.5s5.5 2.462 5.5 5.5"/></svg>',
  settings: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><circle cx="8" cy="8" r="2.5"/><path d="M8 1v1.5M8 13.5V15M1 8h1.5M13.5 8H15M2.929 2.929l1.06 1.06M12.01 12.01l1.06 1.06M13.07 2.929l-1.06 1.06M3.99 12.01l-1.06 1.06"/></svg>',
  history: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="8" r="6"/><path d="M8 4.5V8l2.5 2"/></svg>',
  preview: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M1 8s2.5-5 7-5 7 5 7 5-2.5 5-7 5-7-5-7-5z"/><circle cx="8" cy="8" r="2"/></svg>',
  activity: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M1.5 8h3l2 5 3-10 2 5h3"/></svg>'
};

function navIcon(key) {
  return ICONS[key] || '';
}

// ── Shared sidebar nav (identical on every standalone page) ───
// activeKey: 'shipments' | 'analytics' | 'import' | 'activity'
// Builds the full menu the current user is entitled to, so nothing is ever
// "missing" depending on which page you're on.
function renderNav(activeKey) {
  const nav = document.getElementById('sidebar-nav');
  if (!nav) return;
  const u = getUser() || {};
  const role = u.role;
  const btn = (key, label, icon, href) =>
    '<button class="nav-item' + (key === activeKey ? ' active' : '') + '" title="' + label + '" onclick="window.location.href=\'' + href + '\'">' + navIcon(icon) + ' ' + label + '</button>';

  let html = '';
  html += btn('shipments', 'Shipments', 'shipments', role === 'admin' ? 'admin.html' : 'dashboard.html');
  html += btn('analytics', 'Analytics', 'analytics', 'analytics.html');
  if (canWrite(role)) html += btn('import', 'Import Data', 'import', 'import.html');
  if (canSeeActivity(u)) html += btn('activity', 'Activity', 'activity', 'activity.html');
  if (role === 'admin') {
    html += '<div class="nav-divider"></div>';
    const tabs = [];
    if (isJack(u)) tabs.push(['users', 'Users']);   // Jack only
    tabs.push(['settings', 'Settings']);
    tabs.push(['history', 'History']);
    if (isJack(u)) tabs.push(['preview', 'Preview As']); // Jack only
    tabs.forEach(([tab, label]) => {
      html += '<button class="nav-item" title="' + label + '" onclick="window.location.href=\'admin.html?tab=' + tab + '\'">' + navIcon(tab) + ' ' + label + '</button>';
    });
  }
  nav.innerHTML = html;
}

// Roles that can see all shipments and use AM/rep filters
function isElevatedRole(role) {
  return role === 'admin' || role === 'account_manager' || role === 'vice_president' || role === 'owner';
}

// Roles that can write data (import shipments, manage users)
function canWrite(role) {
  return role === 'admin' || role === 'account_manager' || role === 'vice_president';
}

// Who can see the Activity view: Jack (owner) + any Vice President only.
// Gated by email (not just role) so other admins (e.g. Nicole) do NOT see it.
function canSeeActivity(user) {
  const u = user || getUser() || {};
  return u.role === 'vice_president' || String(u.email || '').toLowerCase() === 'jack@boomrx.com';
}

// Jack only — user management ("Add User"/Users tab) and "Preview As" are
// restricted to Jack, hidden from all other admins (e.g. Nicole).
function isJack(user) {
  const u = user || getUser() || {};
  return String(u.email || '').toLowerCase() === 'jack@boomrx.com';
}

// ── Auth ─────────────────────────────────────────────────────
function getUser() {
  try { return JSON.parse(sessionStorage.getItem(AUTH_KEY)); } catch { return null; }
}

function checkAuth(requiredRole) {
  const user = getUser();
  if (!user) { window.location.href = 'index.html'; return null; }
  if (requiredRole && user.role !== requiredRole) { window.location.href = 'index.html'; return null; }
  startPresence(); // begin heartbeat so this user shows "online"
  return user;
}

function logout() {
  sessionStorage.removeItem(AUTH_KEY);
  window.location.href = 'index.html';
}

// ── Data fetching ────────────────────────────────────────────
async function loadConfig() {
  // If a PAT is available, fetch directly from GitHub API — bypasses CDN so
  // changes committed seconds ago are immediately visible on refresh.
  const pat = localStorage.getItem(PAT_KEY);
  if (pat) {
    try {
      const apiUrl = 'https://api.github.com/repos/' + REPO + '/contents/data/config.json';
      const r = await fetch(apiUrl, { headers: { Authorization: 'token ' + pat, Accept: 'application/vnd.github+json' } });
      if (r.ok) {
        const j = await r.json();
        return JSON.parse(atob(j.content.replace(/\n/g, '')));
      }
    } catch (_) { /* fall through to CDN */ }
  }
  // Fallback for login page / users without PAT
  const r = await fetch('data/config.json?t=' + Date.now());
  if (!r.ok) throw new Error('Failed to load config');
  return r.json();
}

async function loadShipments() {
  // When PAT is available, read via the Git Blobs API — returns the exact
  // committed content with NO CDN caching, so a just-imported file is visible
  // immediately. (download_url goes through raw.githubusercontent's CDN and can
  // serve a stale copy right after a commit.)
  const pat = localStorage.getItem(PAT_KEY);
  if (pat) {
    try {
      const headers = { Authorization: 'token ' + pat, Accept: 'application/vnd.github+json' };
      const meta = await fetch('https://api.github.com/repos/' + REPO + '/contents/data/shipments.json', { headers });
      if (meta.ok) {
        const j = await meta.json();
        if (j.encoding === 'base64' && j.content) {
          return JSON.parse(atob(j.content.replace(/\n/g, '')));
        }
        const blob = await fetch('https://api.github.com/repos/' + REPO + '/git/blobs/' + j.sha, { headers });
        if (blob.ok) {
          return JSON.parse(atob((await blob.json()).content.replace(/\n/g, '')));
        }
      }
    } catch (_) { /* fall through to CDN */ }
  }
  const r = await fetch('data/shipments.json');
  if (!r.ok) throw new Error('Failed to load shipments');
  return r.json();
}

async function loadAssignments() {
  try {
    const r = await fetch('data/clinic_assignments.json?t=' + Date.now());
    if (!r.ok) return {};
    const j = await r.json();
    return j.assignments || {};
  } catch { return {}; }
}

// ── Account manager lookup ────────────────────────────────────
// Returns the full assignment record for a shipment's clinic (or null)
function getAssignmentRecord(shipment, assignments) {
  if (shipment.clinic_id && assignments[shipment.clinic_id]) return assignments[shipment.clinic_id];
  if (shipment.clinic_name) {
    const cn = shipment.clinic_name.toLowerCase().trim();
    for (const v of Object.values(assignments)) {
      if (v.clinic_name && v.clinic_name.toLowerCase().trim() === cn) return v;
    }
  }
  return null;
}

function getAMForShipment(shipment, assignments) {
  if (shipment.account_manager) {
    // Still check the record for a secondary AM display
    return shipment.account_manager;
  }
  const rec = getAssignmentRecord(shipment, assignments);
  return rec ? rec.account_manager : null;
}

// Returns secondary AM name if the clinic has a dual-AM setup
function getSecondaryAMForShipment(shipment, assignments) {
  const rec = getAssignmentRecord(shipment, assignments);
  return rec ? (rec.secondary_account_manager || null) : null;
}

// ── Carrier detection ────────────────────────────────────────
function detectCarrier(trackingNum) {
  if (!trackingNum) return { carrier: 'unknown', url: null };
  const t = String(trackingNum).trim();
  if (t.startsWith('1Z')) return { carrier: 'ups', url: 'https://www.ups.com/track?tracknum=' + t };
  if (/^\d{12,22}$/.test(t) || /^(96|98|02)/.test(t)) return { carrier: 'fedex', url: 'https://www.fedex.com/fedextrack/?trknbr=' + t };
  return { carrier: 'unknown', url: null };
}

// ── Formatting ───────────────────────────────────────────────
function formatDate(isoStr) {
  if (!isoStr) return '—';
  try {
    const d = new Date(isoStr);
    return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) + ' at ' + d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  } catch { return isoStr; }
}

function statusBadge(status) {
  const cls = { received: 'badge-received', shipped: 'badge-shipped', cancelled: 'badge-cancelled' }[status] || 'badge-unknown';
  return '<span class="badge ' + cls + '">' + (status || 'unknown') + '</span>';
}

function trackingLink(shipment) {
  const t = shipment.tracking_number;
  if (!t) return '—';
  const carrier = shipment.carrier || detectCarrier(t).carrier;
  const url = shipment.tracking_url || detectCarrier(t).url;
  const label = carrier.charAt(0).toUpperCase() + carrier.slice(1);
  if (url) return '<a href="' + url + '" target="_blank" rel="noopener">' + label + ': ' + t + ' ↗</a>';
  return t;
}

// ── KPI strip ────────────────────────────────────────────────
function renderKPI(shipments, containerId) {
  const el = document.getElementById(containerId);
  if (!el) return;
  const c = { total: shipments.length, received: 0, shipped: 0, cancelled: 0 };
  shipments.forEach(s => { if (c[s.status] !== undefined) c[s.status]++; });
  el.innerHTML =
    '<div class="kpi-card"><div class="kpi-num">' + c.total + '</div><div class="kpi-label">Total</div></div>' +
    '<div class="kpi-card kpi-received"><div class="kpi-num">' + c.received + '</div><div class="kpi-label">Received</div></div>' +
    '<div class="kpi-card kpi-shipped"><div class="kpi-num">' + c.shipped + '</div><div class="kpi-label">Shipped</div></div>' +
    '<div class="kpi-card kpi-cancelled"><div class="kpi-num">' + c.cancelled + '</div><div class="kpi-label">Cancelled</div></div>';
}

// ── Last-upload banner ────────────────────────────────────────
function renderUploadBanner(containerId, shipmentData) {
  const el = document.getElementById(containerId);
  if (!el || !shipmentData) return;
  const when = shipmentData.last_updated ? formatDate(shipmentData.last_updated) : 'Never';
  const who = shipmentData.updated_by || '—';
  el.innerHTML = '<span style="font-size:0.8125rem;color:var(--text-muted)">Last upload: <strong style="color:var(--text)">' + when + '</strong> &nbsp;by <strong style="color:var(--text)">' + who + '</strong></span>';
}

// Short date formatter (no time)
function formatShortDate(isoStr) {
  if (!isoStr) return '—';
  try { return new Date(isoStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); }
  catch { return isoStr; }
}

// ── Table rendering ──────────────────────────────────────────
// Columns: Status | (Rep) | Clinic | Region | Order Date | Ship Date | Pharmacy | Order ID | Contents | Tracking
// Line items sharing the same order_id are collapsed into a single order row,
// with all medications listed in the Contents column.
// assignments: optional map of clinic_id → {account_manager, clinic_name}
const TABLE_ROW_CAP = 300;

function _esc(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
// One medication's name + strength + quantity
function _medMain(s) {
  const name = _esc(s.drug_name || '—');
  const str = s.drug_strength ? ' <span class="med-str" title="' + _esc(s.drug_strength) + '">' + _esc(s.drug_strength) + '</span>' : '';
  const qty = s.quantity ? ' <span class="med-qty">×' + _esc(s.quantity) + '</span>' : '';
  return name + str + qty;
}
// Shared detail panel: one block per medication with its Rx ID, pharmacy, tracking
function _medDetailHtml(items) {
  return items.map(s => {
    const rxFull = String(s.prescription_id || '');
    const rx = rxFull ? '<span class="med-rx" title="Prescription ID: ' + _esc(rxFull) + '">Rx ' + _esc(rxFull.slice(0, 8)) + '</span>' : '';
    const ph = s.pharmacy_name ? '<span>' + _esc(s.pharmacy_name) + '</span>' : '';
    const trk = String(s.tracking_number || '').trim() ? trackingLink(s) : '<span style="color:var(--text-muted)">no tracking</span>';
    const sub = [rx, ph, trk].filter(Boolean).join(' &middot; ');
    return '<div class="med-detail"><div class="med-line">' + _medMain(s) + '</div><div class="med-sub">' + sub + '</div></div>';
  }).join('');
}
// A chip button that toggles a shared, full-width detail row (one view for the order).
function _chip(uid, label) {
  return '<button type="button" class="dd-btn" data-od="' + uid + '" onclick="toggleOrderDetail(\'' + uid + '\')">' + label + '</button>';
}

// Toggle the shared detail row for an order; both chips (Contents + Tracking) drive it.
function toggleOrderDetail(uid) {
  const row = document.getElementById(uid);
  if (!row) return;
  const show = row.style.display === 'none';
  row.style.display = show ? '' : 'none';
  document.querySelectorAll('.dd-btn[data-od="' + uid + '"]').forEach(b => b.classList.toggle('open', show));
}

// Contents cell: single med inline; multiple meds → chip toggling the shared detail row.
function _contentsCell(items, uid) {
  if (!items.length) return '<span style="color:var(--text-muted)">—</span>';
  if (items.length === 1) return '<div class="med-line">' + _medMain(items[0]) + '</div>';
  return _chip(uid, items.length + ' medications');
}

// Group line-item rows into orders (same order_id → one order; blank order_id → its own row)
function groupByOrder(shipments) {
  const map = new Map();
  for (const s of shipments) {
    const oid = String(s.order_id || '').trim();
    const key = oid || ('pi:' + (s.prescription_item_id || Math.random()));
    if (!map.has(key)) map.set(key, { rep: s, items: [] });
    map.get(key).items.push(s);
  }
  return [...map.values()];
}

// Order-level pharmacy cell: one name, or "Multiple" when meds ship from different pharmacies
function _pharmacyCell(items) {
  const set = [...new Set(items.map(x => String(x.pharmacy_name || '').trim()).filter(Boolean))];
  if (!set.length) return '—';
  return set.length === 1 ? set[0] : 'Multiple';
}
// Order-level tracking cell: one link when all meds share a tracking number,
// or a chip that opens the SAME shared detail row when they differ.
function _trackingCell(items, uid) {
  const set = [...new Set(items.map(x => String(x.tracking_number || '').trim()).filter(Boolean))];
  if (!set.length) return '—';
  if (set.length === 1) {
    const item = items.find(x => String(x.tracking_number || '').trim() === set[0]);
    return trackingLink(item);
  }
  return _chip(uid, set.length + ' tracking #s');
}

function renderTable(shipments, tableBodyId, showRepCol, globalLastUpdated, globalUpdatedBy, assignments) {
  const tbody = document.getElementById(tableBodyId);
  if (!tbody) return;
  const cols = 9 + (showRepCol ? 1 : 0);
  if (!shipments.length) {
    tbody.innerHTML = '<tr><td colspan="' + cols + '" style="text-align:center;padding:2rem;color:var(--gray)">No shipments found.</td></tr>';
    return;
  }
  const assignMap = assignments || {};
  const orders = groupByOrder(shipments);
  // Newest orders first, so the most recent data is always visible within the row cap
  orders.sort((a, b) => (new Date(b.rep.order_date || 0)) - (new Date(a.rep.order_date || 0)));
  const capped = orders.length > TABLE_ROW_CAP;
  const visible = capped ? orders.slice(0, TABLE_ROW_CAP) : orders;
  const capRow = capped
    ? '<tr><td colspan="' + cols + '" style="text-align:center;padding:0.75rem;background:var(--bg-alt);color:var(--text-muted);font-size:0.8125rem">Showing first ' + TABLE_ROW_CAP + ' of ' + orders.length.toLocaleString() + ' orders — narrow your filters to see more</td></tr>'
    : '';
  tbody.innerHTML = visible.map(({ rep: s, items }, idx) => {
    const uid = 'od-' + tableBodyId + '-' + idx;
    const cancelled = s.status === 'cancelled' ? ' row-cancelled' : '';
    const repCol = showRepCol ? '<td>' + (s.rep_name || '—') + '</td>' : '';
    const am  = getAMForShipment(s, assignMap);
    const am2 = getSecondaryAMForShipment(s, assignMap);
    const amLabel = am ? (am2 ? am + ' &amp; ' + am2 : am) : null;
    const amText = amLabel ? '<div class="sub-text">AM: ' + amLabel + '</div>' : '';
    const mainRow = '<tr class="' + cancelled + '">' +
      '<td>' + statusBadge(s.status) + '</td>' +
      repCol +
      '<td><div>' + (s.clinic_name || '—') + '</div>' + amText + '</td>' +
      '<td>' + (s.region || '—') + '</td>' +
      '<td>' + formatShortDate(s.order_date) + '</td>' +
      '<td>' + formatShortDate(s.ship_date) + '</td>' +
      '<td>' + _pharmacyCell(items) + '</td>' +
      '<td>' + (s.order_id || '—') + '</td>' +
      '<td class="contents-cell">' + _contentsCell(items, uid) + '</td>' +
      '<td>' + _trackingCell(items, uid) + '</td>' +
      '</tr>';
    // Single shared, full-width detail row (only when the order has multiple line items)
    const detailRow = items.length > 1
      ? '<tr class="order-detail-row" id="' + uid + '" style="display:none"><td colspan="' + cols + '"><div class="dd-panel">' + _medDetailHtml(items) + '</div></td></tr>'
      : '';
    return mainRow + detailRow;
  }).join('') + capRow;
}

// ── Raw upload archive ───────────────────────────────────────
// Keeps the 2 most recent raw ProRx files in the repo (data/uploads/) so they
// persist for EVERYONE regardless of who imports or from which computer
// (GitHub is the shared store; the local Obsidian clone syncs them on git pull).
function _fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => { const s = String(r.result); resolve(s.slice(s.indexOf(',') + 1)); };
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}
async function archiveUpload(file, byEmail) {
  if (!file) return;
  const pat = localStorage.getItem(PAT_KEY);
  if (!pat) return; // no token → skip silently (import already handles token prompt)
  const headers = { Authorization: 'Bearer ' + pat, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json' };
  const listUrl = 'https://api.github.com/repos/' + REPO + '/contents/data/uploads';
  try {
    const b64 = await _fileToBase64(file);
    const stamp = new Date().toISOString().replace(/[:.]/g, '-'); // sorts chronologically
    const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-80);
    const path = 'data/uploads/' + stamp + '__' + safe;
    await fetch('https://api.github.com/repos/' + REPO + '/contents/' + path, {
      method: 'PUT', headers,
      body: JSON.stringify({ message: 'Archive ProRx upload by ' + (byEmail || 'unknown'), content: b64 })
    });
    // Prune: keep only the 2 newest files
    const listResp = await fetch(listUrl, { headers });
    if (listResp.ok) {
      const files = (await listResp.json()).filter(f => f.type === 'file')
        .sort((a, b) => (a.name < b.name ? 1 : -1)); // newest (highest stamp) first
      for (let i = 2; i < files.length; i++) {
        await fetch('https://api.github.com/repos/' + REPO + '/contents/' + files[i].path, {
          method: 'DELETE', headers,
          body: JSON.stringify({ message: 'Prune old ProRx upload', sha: files[i].sha })
        });
      }
    }
  } catch (e) { console.warn('archiveUpload failed (non-fatal):', e); }
}

// ── GitHub API ───────────────────────────────────────────────
function _ghHeaders() {
  const pat = localStorage.getItem(PAT_KEY);
  if (!pat) throw new Error('GitHub token not set or expired. Go to Settings to update your token.');
  return { 'Authorization': 'Bearer ' + pat, 'Accept': 'application/vnd.github+json', 'Content-Type': 'application/json' };
}

async function commitToGitHub(filename, data, commitMessage) {
  const headers = _ghHeaders();
  const apiUrl = 'https://api.github.com/repos/' + REPO + '/contents/' + filename;
  let sha = null;
  const getResp = await fetch(apiUrl, { headers });
  if (getResp.ok) { const j = await getResp.json(); sha = j.sha; }
  const content = btoa(unescape(encodeURIComponent(JSON.stringify(data, null, 2))));
  const body = { message: commitMessage || 'Update ' + filename, content };
  if (sha) body.sha = sha;
  const putResp = await fetch(apiUrl, { method: 'PUT', headers, body: JSON.stringify(body) });
  if (!putResp.ok) {
    let msg = 'GitHub API error ' + putResp.status;
    try { const e = await putResp.json(); msg = e.message || msg; } catch {}
    throw new Error(msg);
  }
  return putResp.json();
}

const BRANCH = 'main';

// Commit a (possibly large) file via the Git Data API: create blob → tree →
// commit → update ref. The Contents API PUT fails ("Failed to fetch") on files
// this size (~25MB); the Git Data API is GitHub's supported path for large files.
async function commitFileViaGitData(path, contentBase64, message, headers) {
  const api = 'https://api.github.com/repos/' + REPO;
  const post = async (url, body) => {
    const r = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
    if (!r.ok) { let m = 'GitHub error ' + r.status; try { m = (await r.json()).message || m; } catch {} const e = new Error(m); e.status = r.status; throw e; }
    return r.json();
  };
  // 1. blob (large base64 content)
  const blob = await post(api + '/git/blobs', { content: contentBase64, encoding: 'base64' });
  // 2. current ref / parent commit
  const refResp = await fetch(api + '/git/ref/heads/' + BRANCH, { headers });
  if (!refResp.ok) throw new Error('Could not read branch ref');
  const parentSha = (await refResp.json()).object.sha;
  // 3. base tree
  const baseCommitResp = await fetch(api + '/git/commits/' + parentSha, { headers });
  const baseTree = (await baseCommitResp.json()).tree.sha;
  // 4. new tree with our file
  const tree = await post(api + '/git/trees', { base_tree: baseTree, tree: [{ path, mode: '100644', type: 'blob', sha: blob.sha }] });
  // 5. new commit
  const commit = await post(api + '/git/commits', { message, tree: tree.sha, parents: [parentSha] });
  // 6. move the branch
  const upd = await fetch(api + '/git/refs/heads/' + BRANCH, { method: 'PATCH', headers, body: JSON.stringify({ sha: commit.sha }) });
  if (!upd.ok) { let m = 'GitHub error ' + upd.status; try { m = (await upd.json()).message || m; } catch {} const e = new Error(m); e.status = upd.status; throw e; }
  return commit.sha;
}

// Concurrent-safe shipment commit: reads current data (Git Blobs API), merges
// new rows, commits via Git Data API. Retries on ref conflict with fresh data.
async function commitShipments(newRows, uploaderEmail, commitMessage, maxRetries) {
  maxRetries = maxRetries || 3;
  const headers = _ghHeaders();
  const apiUrl = 'https://api.github.com/repos/' + REPO + '/contents/data/shipments.json';
  let attempt = 0;
  while (attempt < maxRetries) {
    attempt++;
    // Read current shipments (use Git Blobs API for the >1MB file)
    const getResp = await fetch(apiUrl, { headers });
    if (!getResp.ok) throw new Error('Could not read shipments.json from GitHub');
    const fileJson = await getResp.json();
    let current;
    try {
      if (fileJson.encoding === 'base64' && fileJson.content) {
        current = JSON.parse(atob(fileJson.content.replace(/\n/g, '')));
      } else {
        const blobResp = await fetch('https://api.github.com/repos/' + REPO + '/git/blobs/' + fileJson.sha, { headers });
        if (!blobResp.ok) throw new Error('Could not fetch shipments blob');
        current = JSON.parse(atob((await blobResp.json()).content.replace(/\n/g, '')));
      }
    } catch (e) {
      throw new Error('Could not read existing shipments before merging: ' + e.message);
    }
    // Merge: upsert new rows into live data, newest import_date wins
    const merged = upsertShipments(current.shipments || [], newRows);
    const newData = { ...current, shipments: merged, last_updated: new Date().toISOString(), updated_by: uploaderEmail };
    const content = btoa(unescape(encodeURIComponent(JSON.stringify(newData))));
    try {
      await commitFileViaGitData('data/shipments.json', content, commitMessage || 'Import shipments', headers);
      return { data: newData };
    } catch (e) {
      // ref moved underneath us (concurrent import) → retry with fresh data
      if ((e.status === 409 || e.status === 422) && attempt < maxRetries) continue;
      throw e;
    }
  }
  throw new Error('Upload failed after ' + maxRetries + ' attempts due to concurrent edits. Please try again.');
}

// Fetch the commit history for shipments.json (for rewind UI)
async function fetchShipmentHistory(perPage) {
  const headers = _ghHeaders();
  const url = 'https://api.github.com/repos/' + REPO + '/commits?path=data/shipments.json&per_page=' + (perPage || 20);
  const r = await fetch(url, { headers });
  if (!r.ok) throw new Error('Could not load history');
  return r.json();
}

// Restore shipments.json to the version at a specific commit SHA.
// Passes the raw base64 blob content straight through to the PUT — avoids
// decoding + re-encoding 25MB which times out in the browser.
async function restoreToCommit(commitSha, uploaderEmail) {
  const headers = _ghHeaders();
  const apiUrl = 'https://api.github.com/repos/' + REPO + '/contents/data/shipments.json';

  // 1. Get the blob SHA at the historical commit (no content needed here)
  const histResp = await fetch(apiUrl + '?ref=' + commitSha, { headers });
  if (!histResp.ok) throw new Error('Could not fetch historical version (' + histResp.status + ')');
  const histMeta = await histResp.json();
  const blobSha = histMeta.sha; // git object SHA of the historical file

  // 2. Fetch the blob's raw base64 content via the Git Blobs API
  const blobResp = await fetch('https://api.github.com/repos/' + REPO + '/git/blobs/' + blobSha, {
    headers: { ...headers, Accept: 'application/vnd.github+json' }
  });
  if (!blobResp.ok) throw new Error('Could not fetch historical blob (' + blobResp.status + ')');
  const blob = await blobResp.json();
  // blob.content is already base64-encoded — use it directly, no decode/re-encode
  const rawBase64 = blob.content.replace(/\n/g, '');

  // 3. Commit the historical content as a new HEAD via the Git Data API
  //    (large-file safe — the Contents API PUT fails on ~25MB files)
  await commitFileViaGitData('data/shipments.json', rawBase64,
    'Restore shipments to ' + commitSha.slice(0, 7) + ' (by ' + uploaderEmail + ')', headers);

  // 4. Decode just enough to return the shipments array to the UI
  let historic;
  try { historic = JSON.parse(atob(rawBase64)); } catch (e) { historic = { shipments: [] }; }
  return historic;
}

// ── Import helpers ───────────────────────────────────────────
function normalizeStatus(raw) {
  const s = String(raw || '').toLowerCase().trim();
  if (s.includes('ship')) return 'shipped';
  if (s.includes('cancel')) return 'cancelled';
  return 'received';
}

// Composite dedup key — resolves to the most specific unique identifier available.
// Priority: prescription_item_id > prescription_id > invoice+drug_id+clinic_id >
//           invoice+drug_name+clinic_id > invoice+drug_name+date > invoice+drug_name >
//           date+clinic+drug (no invoice) > invoice alone
function getShipmentKey(s) {
  const str = v => String(v || '').trim();
  const lc  = v => str(v).toLowerCase();

  const pitem   = str(s.prescription_item_id);
  const rx      = str(s.prescription_id);
  const inv     = str(s.invoice_number);
  const drugId  = str(s.drug_id);
  const clinicId= str(s.clinic_id);
  const drugName= lc(s.drug_name);
  const date    = str(s.order_date).split('T')[0].split(' ')[0]; // date portion only
  const clinic  = lc(s.clinic_name);

  // 1. prescription_item_id — unique per drug line per order (best)
  if (pitem) return 'pitem:' + pitem;

  // 2. prescription_id — unique per drug per patient per order
  if (rx) return 'rx:' + rx;

  // 3. invoice + drug_id + clinic_id — invoice with drug and clinic IDs
  if (inv && drugId && clinicId) return 'idc:' + inv + '|' + drugId + '|' + clinicId;

  // 4. invoice + drug_id (no clinic)
  if (inv && drugId) return 'id:' + inv + '|' + drugId;

  // 5. invoice + drug_name + clinic_id
  if (inv && drugName && clinicId) return 'inc:' + inv + '|' + drugName + '|' + clinicId;

  // 6. invoice + drug_name + order_date
  if (inv && drugName && date) return 'ind:' + inv + '|' + drugName + '|' + date;

  // 7. invoice + drug_name (covers multi-drug orders without dates/IDs)
  if (inv && drugName) return 'in:' + inv + '|' + drugName;

  // 8. date + clinic_id/name + drug_name (no invoice)
  const clinicRef = clinicId || clinic;
  if (date && clinicRef && drugName) return 'dcd:' + date + '|' + clinicRef + '|' + drugName;

  // 9. Last resort: invoice number alone (may merge multi-drug rows — only hits if no drug_name)
  if (inv) return 'i:' + inv;

  return 'unknown:' + String(Math.random()).slice(2);
}

// assignments param is optional — if provided, stamps account_manager on each row
function mapImportRow(row, assignments) {
  // Normalize keys: lowercase, spaces→underscores, strip non-alphanumeric
  // So "Invoice Number" → "invoice_number", "Sales Rep" → "sales_rep", etc.
  const norm = {};
  for (const k of Object.keys(row)) {
    const nk = k.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
    norm[nk] = row[k];
  }
  const str = k => String(norm[k] !== undefined ? norm[k] : (row[k] !== undefined ? row[k] : '')).trim();

  let repName = str('sales_rep') || str('rep_name') || str('salesperson');
  // Strip the "JMS - " prefix present on all ProRx rep names
  repName = repName.replace(/^JMS\s*-\s*/i, '').trim() || repName;
  // Permanent rule: omit any row belonging to Nick Clemens
  if (/nick\s*clemens/i.test(repName)) return null;

  const trackingNum = str('tracking_number');
  const carrierRaw  = str('shipping_carrier');
  // Use ProRx carrier name if present; otherwise auto-detect from number
  let carrier, trackingUrl;
  if (carrierRaw) {
    const c = carrierRaw.toLowerCase();
    carrier = c.includes('ups') ? 'ups' : c.includes('fedex') ? 'fedex' : 'unknown';
    const detected = detectCarrier(trackingNum);
    trackingUrl = carrier === 'ups'
      ? 'https://www.ups.com/track?tracknum=' + trackingNum
      : carrier === 'fedex'
      ? 'https://www.fedex.com/fedextrack/?trknbr=' + trackingNum
      : detected.url;
  } else {
    const detected = detectCarrier(trackingNum);
    carrier = detected.carrier;
    trackingUrl = detected.url;
  }

  // boomrx_clinic_id normalizes from "BoomRx Clinic ID"
  const clinicId   = str('clinic_id') || str('boomrx_clinic_id');
  const clinicName = str('clinic_name');

  let accountManager = null;
  if (assignments) {
    accountManager = getAMForShipment({ clinic_id: clinicId, clinic_name: clinicName }, assignments) || null;
  }

  const mapped = {
    // Core identifiers
    prescription_item_id: str('prescription_item_id'),
    prescription_id:      str('prescription_id'),
    order_id:             str('order_id'),
    invoice_number:       str('invoice_number'),
    drug_id:              str('drug_id'),

    // Order info
    order_date:    norm['order_date'] || row['order_date'] || '',
    ship_date:     norm['ship_date']  || row['ship_date']  || '',
    status:        normalizeStatus(norm['status'] || row['status']),

    // Clinic / rep
    clinic_id:   clinicId,
    clinic_name: clinicName,
    rep_name:    repName,

    // Drug
    drug_name:        str('drug_name'),
    drug_strength:    str('drug_strength'),
    drug_dosage_form: str('drug_dosage_form'),
    quantity:         str('quantity'),

    // Pharmacy & shipping
    pharmacy_name: str('pharmacy_name'),
    pharmacy_id:   str('pharmacy_id'),
    tracking_number: trackingNum,
    carrier,
    tracking_url: trackingUrl || '',

    // Account manager (resolved from clinic assignment)
    account_manager: accountManager,
    region: str('region'),

    import_date: new Date().toISOString()
  };

  // Stamp the composite key so it travels with the row and can be re-used on merge
  mapped._key = getShipmentKey(mapped);
  return mapped;
}

function upsertShipments(existing, incoming) {
  // Build map using composite key for all existing rows
  const map = new Map();
  existing.forEach(s => {
    const key = s._key || getShipmentKey(s);
    if (!s._key) s._key = key; // back-fill key on old records
    map.set(key, s);
  });

  incoming.forEach(s => {
    const key = s._key || getShipmentKey(s);
    if (!key || key.startsWith('unknown:')) return; // skip genuinely unidentifiable rows
    s._key = key;
    const cur = map.get(key);
    if (!cur) { map.set(key, s); return; }
    // Keep whichever row has the newer import_date; incoming wins on tie/equal
    const curMs = cur.import_date  ? new Date(cur.import_date).getTime()  : 0;
    const newMs = s.import_date    ? new Date(s.import_date).getTime()    : 0;
    if (newMs >= curMs) map.set(key, s);
  });

  return Array.from(map.values());
}

// ── Fulfillment analytics ────────────────────────────────────
function statsArr(arr) {
  if (!arr.length) return { avg: 0, median: 0, min: 0, max: 0, count: 0 };
  const s = [...arr].sort((a, b) => a - b);
  const n = s.length;
  const mid = Math.floor(n / 2);
  return {
    avg:    s.reduce((a, b) => a + b, 0) / n,
    median: n % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2,
    min:    s[0],
    max:    s[n - 1],
    count:  n
  };
}

function computeFulfillmentStats(shipments, dateRange) {
  const cutoff = getDateRangeCutoff(dateRange || 'all');
  const base = cutoff
    ? shipments.filter(s => s.order_date && new Date(s.order_date) >= cutoff)
    : shipments;

  const eligible = base.filter(s =>
    s.order_date && s.ship_date && s.status !== 'cancelled'
  );

  const getDays = s => {
    const ms = new Date(s.ship_date) - new Date(s.order_date);
    return Math.max(0, ms / 86400000);
  };

  const byPharmacy = {}, byRep = {};
  const allDays = [];

  eligible.forEach(s => {
    const d = getDays(s);
    if (d > 60) return; // exclude outliers (likely data issues)
    allDays.push(d);
    const p = s.pharmacy_name || 'Unknown';
    (byPharmacy[p] = byPharmacy[p] || []).push(d);
    const r = s.rep_name || 'Unknown';
    (byRep[r] = byRep[r] || []).push(d);
  });

  return {
    overall:    statsArr(allDays),
    byPharmacy: Object.fromEntries(Object.entries(byPharmacy).map(([k, v]) => [k, statsArr(v)])),
    byRep:      Object.fromEntries(Object.entries(byRep).map(([k, v]) => [k, statsArr(v)])),
    totalOrders: base.length,
    ordersWithShipDate: eligible.length
  };
}

// ── Date range helpers ───────────────────────────────────────
function getDateRangeCutoff(range) {
  const now = new Date();
  if (range === 'today') { const d = new Date(); d.setHours(0,0,0,0); return d; }
  if (range === 'yesterday') { const d = new Date(); d.setDate(d.getDate()-1); d.setHours(0,0,0,0); return d; }
  if (range === 'last7')  return new Date(now.getTime() - 7  * 86400000);
  if (range === 'last30') return new Date(now.getTime() - 30 * 86400000);
  if (range === 'last90') return new Date(now.getTime() - 90 * 86400000);
  return null; // 'all'
}

// ── Filter/search ────────────────────────────────────────────
function filterShipments(shipments, { status, search, repFilter, amFilter, dateRange }, assignments) {
  // When a search term is active, bypass the date filter so clinic lookups show full history
  const cutoff = search ? null : getDateRangeCutoff(dateRange || 'last30');

  return shipments.filter(s => {
    if (status && status !== 'all' && s.status !== status) return false;
    if (repFilter && s.rep_name !== repFilter) return false;
    if (amFilter) {
      const am  = getAMForShipment(s, assignments || {});
      const am2 = getSecondaryAMForShipment(s, assignments || {});
      if (amFilter === '__unassigned__') {
        if ((am && am !== 'Unassigned') || am2) return false;
      } else {
        // Match primary OR secondary so dual-AM clinics appear for both managers
        if (am !== amFilter && am2 !== amFilter) return false;
      }
    }
    if (cutoff) {
      // Parse date-only strings (YYYY-MM-DD) as local time, not UTC.
      // new Date("2026-06-24") parses as UTC midnight which is the prior evening
      // in US timezones and would exclude today's orders from the "today" filter.
      const raw = s.order_date ? String(s.order_date).split('T')[0] : null;
      if (!raw) return false;
      const parts = raw.split('-');
      const od = parts.length === 3
        ? new Date(+parts[0], +parts[1] - 1, +parts[2])  // local midnight
        : new Date(s.order_date);
      if (!od || isNaN(od) || od < cutoff) return false;
    }
    if (search) {
      const q = search.toLowerCase();
      const fields = [s.clinic_name, s.invoice_number, s.tracking_number, s.rep_name, s.pharmacy_name, s.drug_name];
      if (!fields.some(f => f && String(f).toLowerCase().includes(q))) return false;
    }
    return true;
  });
}

// ── Collapsible sidebar (shared across all pages) ─────────────
function initSidebar() {
  const layout = document.querySelector('.app-layout');
  if (!layout) return;
  const sidebar = layout.querySelector('.sidebar');
  if (!sidebar || sidebar.querySelector('.nav-collapse-btn')) return;
  if (localStorage.getItem('jms_nav_collapsed') === '1') layout.classList.add('nav-collapsed');
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'nav-collapse-btn';
  btn.title = 'Collapse / expand menu';
  btn.setAttribute('aria-label', 'Toggle menu');
  btn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M10 3 5 8l5 5"/></svg>';
  btn.onclick = () => {
    const collapsed = layout.classList.toggle('nav-collapsed');
    localStorage.setItem('jms_nav_collapsed', collapsed ? '1' : '0');
  };
  sidebar.insertBefore(btn, sidebar.firstChild);
  // tooltips so icons are identifiable when collapsed (renderNav also sets title)
  sidebar.querySelectorAll('.nav-item').forEach(b => { const t = b.textContent.trim(); if (t && !b.title) b.title = t; });
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initSidebar);
else initSidebar();
