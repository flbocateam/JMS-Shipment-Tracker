// ============================================================
// JMS Shipment Tracker — Shared App Module
// ============================================================

const AUTH_KEY = 'jms_user';
const PAT_KEY = 'jms_github_pat';
const REPO = 'flbocateam/JMS-Shipment-Tracker';

// ── Auth ─────────────────────────────────────────────────────
function getUser() {
  try { return JSON.parse(sessionStorage.getItem(AUTH_KEY)); } catch { return null; }
}

function checkAuth(requiredRole) {
  const user = getUser();
  if (!user) { window.location.href = 'index.html'; return null; }
  if (requiredRole && user.role !== requiredRole) { window.location.href = 'index.html'; return null; }
  return user;
}

function logout() {
  sessionStorage.removeItem(AUTH_KEY);
  window.location.href = 'index.html';
}

// ── Data fetching ────────────────────────────────────────────
async function loadConfig() {
  const r = await fetch('data/config.json?t=' + Date.now());
  if (!r.ok) throw new Error('Failed to load config');
  return r.json();
}

async function loadShipments() {
  const r = await fetch('data/shipments.json?t=' + Date.now());
  if (!r.ok) throw new Error('Failed to load shipments');
  return r.json();
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
  if (url) return '<a href="' + url + '" target="_blank" rel="noopener">' + label + ': ' + t + ' 🔗</a>';
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

// ── Table rendering ──────────────────────────────────────────
function renderTable(shipments, tableBodyId, showRepCol, globalLastUpdated, globalUpdatedBy) {
  const tbody = document.getElementById(tableBodyId);
  if (!tbody) return;
  if (!shipments.length) {
    tbody.innerHTML = '<tr><td colspan="10" style="text-align:center;padding:2rem;color:var(--gray)">No shipments found.</td></tr>';
    return;
  }
  tbody.innerHTML = shipments.map(s => {
    const cancelled = s.status === 'cancelled' ? ' row-cancelled' : '';
    const repCol = showRepCol ? '<td>' + (s.rep_name || '—') + '</td>' : '';
    const lu = s.import_date ? formatDate(s.import_date) : (globalLastUpdated ? formatDate(globalLastUpdated) : '—');
    const ub = s.updated_by || globalUpdatedBy || '';
    return '<tr class="' + cancelled + '">' +
      '<td>' + statusBadge(s.status) + '</td>' +
      repCol +
      '<td><div>' + lu + '</div>' + (ub ? '<div class="sub-text">Entered by ' + ub + '</div>' : '') + '</td>' +
      '<td>' + (s.clinician_name || '—') + '</td>' +
      '<td>' + (s.pharmacy_name || '—') + '</td>' +
      '<td>' + (s.invoice_number || '—') + '</td>' +
      '<td>' + trackingLink(s) + '</td>' +
      '</tr>';
  }).join('');
}

// ── GitHub API ───────────────────────────────────────────────
async function commitToGitHub(filename, data, commitMessage) {
  const pat = localStorage.getItem(PAT_KEY);
  if (!pat) throw new Error('GitHub token not set or expired. Go to Settings to update your token.');
  const apiUrl = 'https://api.github.com/repos/' + REPO + '/contents/' + filename;
  const headers = {
    'Authorization': 'Bearer ' + pat,
    'Accept': 'application/vnd.github+json',
    'Content-Type': 'application/json'
  };
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

// ── Import helpers ───────────────────────────────────────────
function normalizeStatus(raw) {
  const s = String(raw || '').toLowerCase().trim();
  if (s.includes('ship')) return 'shipped';
  if (s.includes('cancel')) return 'cancelled';
  return 'received';
}

function mapImportRow(row) {
  let repName = String(row['sales_rep'] || row['rep_name'] || '').trim();
  repName = repName.replace(/JMS\s*-\s*Jack\s+L['']Hommedieu\s*\/\s*Mark\s+Mousseau\s*/gi, '').trim();
  const trackingNum = String(row['tracking_number'] || '').trim();
  const { carrier, url } = detectCarrier(trackingNum);
  return {
    invoice_number: String(row['invoice_number'] || '').trim(),
    order_date: row['order_date'] || '',
    rep_name: repName,
    clinician_name: row['clinician_full_name'] || row['clinician_name'] || '',
    clinic_name: row['clinic_name'] || '',
    pharmacy_name: row['pharmacy_name'] || '',
    drug_name: row['drug_name'] || '',
    tracking_number: trackingNum,
    carrier,
    tracking_url: url,
    status: normalizeStatus(row['status']),
    import_date: new Date().toISOString()
  };
}

function upsertShipments(existing, incoming) {
  const map = new Map(existing.map(s => [s.invoice_number, s]));
  incoming.forEach(s => { if (s.invoice_number) map.set(s.invoice_number, s); });
  return Array.from(map.values());
}

// ── Filter/search ────────────────────────────────────────────
function filterShipments(shipments, { status, search, repFilter }) {
  return shipments.filter(s => {
    if (status && status !== 'all' && s.status !== status) return false;
    if (repFilter && s.rep_name !== repFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      const fields = [s.clinic_name, s.clinician_name, s.invoice_number, s.tracking_number, s.rep_name, s.pharmacy_name];
      if (!fields.some(f => f && String(f).toLowerCase().includes(q))) return false;
    }
    return true;
  });
}
