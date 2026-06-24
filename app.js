// ============================================================
// JMS Shipment Tracker — Shared App Module
// ============================================================

const AUTH_KEY = 'jms_user';
const PAT_KEY = 'jms_github_pat';
const REPO = 'flbocateam/JMS-Shipment-Tracker';

// Roles that can see all shipments, upload, and use AM filter
function isElevatedRole(role) {
  return role === 'admin' || role === 'account_manager' || role === 'vice_president';
}

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

async function loadAssignments() {
  try {
    const r = await fetch('data/clinic_assignments.json?t=' + Date.now());
    if (!r.ok) return {};
    const j = await r.json();
    return j.assignments || {};
  } catch { return {}; }
}

// ── Account manager lookup ────────────────────────────────────
function getAMForShipment(shipment, assignments) {
  // 1. Already stamped on the shipment (new imports)
  if (shipment.account_manager) return shipment.account_manager;
  // 2. Look up by clinic_id
  if (shipment.clinic_id && assignments[shipment.clinic_id]) {
    return assignments[shipment.clinic_id].account_manager;
  }
  // 3. Fall back to clinic_name match (case-insensitive)
  if (shipment.clinic_name) {
    const cn = shipment.clinic_name.toLowerCase().trim();
    for (const v of Object.values(assignments)) {
      if (v.clinic_name && v.clinic_name.toLowerCase().trim() === cn) return v.account_manager;
    }
  }
  return null;
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

// ── Last-upload banner ────────────────────────────────────────
function renderUploadBanner(containerId, shipmentData) {
  const el = document.getElementById(containerId);
  if (!el || !shipmentData) return;
  const when = shipmentData.last_updated ? formatDate(shipmentData.last_updated) : 'Never';
  const who = shipmentData.updated_by || '—';
  el.innerHTML = '<span style="font-size:0.8125rem;color:var(--text-muted)">Last upload: <strong style="color:var(--text)">' + when + '</strong> &nbsp;by <strong style="color:var(--text)">' + who + '</strong></span>';
}

// ── Table rendering ──────────────────────────────────────────
// assignments: optional map of clinic_id → {account_manager, clinic_name}
function renderTable(shipments, tableBodyId, showRepCol, globalLastUpdated, globalUpdatedBy, assignments) {
  const tbody = document.getElementById(tableBodyId);
  if (!tbody) return;
  if (!shipments.length) {
    tbody.innerHTML = '<tr><td colspan="10" style="text-align:center;padding:2rem;color:var(--gray)">No shipments found.</td></tr>';
    return;
  }
  const assignMap = assignments || {};
  tbody.innerHTML = shipments.map(s => {
    const cancelled = s.status === 'cancelled' ? ' row-cancelled' : '';
    const repCol = showRepCol ? '<td>' + (s.rep_name || '—') + '</td>' : '';
    const lu = s.import_date ? formatDate(s.import_date) : (globalLastUpdated ? formatDate(globalLastUpdated) : '—');
    const ub = s.updated_by || globalUpdatedBy || '';
    const am = getAMForShipment(s, assignMap);
    const amText = am ? '<div class="sub-text" style="margin-top:2px">Account Manager: ' + am + '</div>' : '';
    return '<tr class="' + cancelled + '">' +
      '<td>' + statusBadge(s.status) + '</td>' +
      repCol +
      '<td><div>' + lu + '</div>' + (ub ? '<div class="sub-text">Entered by ' + ub + '</div>' : '') + '</td>' +
      '<td>' + (s.pharmacy_name || '—') + '</td>' +
      '<td><div>' + (s.invoice_number || '—') + '</div>' + amText + '</td>' +
      '<td>' + trackingLink(s) + '</td>' +
      '</tr>';
  }).join('');
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

// Concurrent-safe shipment commit: on SHA conflict (409/422), re-fetches live data,
// merges our new rows into it, and retries — up to maxRetries times.
async function commitShipments(newRows, uploaderEmail, commitMessage, maxRetries) {
  maxRetries = maxRetries || 3;
  const headers = _ghHeaders();
  const apiUrl = 'https://api.github.com/repos/' + REPO + '/contents/data/shipments.json';
  let attempt = 0;
  while (attempt < maxRetries) {
    attempt++;
    // Always fetch fresh copy so SHA is current
    const getResp = await fetch(apiUrl, { headers });
    if (!getResp.ok) throw new Error('Could not read shipments.json from GitHub');
    const fileJson = await getResp.json();
    const sha = fileJson.sha;
    let current;
    try { current = JSON.parse(atob(fileJson.content.replace(/\n/g, ''))); }
    catch (e) { current = { shipments: [] }; }
    // Merge: upsert new rows into live data, newest import_date wins
    const merged = upsertShipments(current.shipments || [], newRows);
    const newData = { ...current, shipments: merged, last_updated: new Date().toISOString(), updated_by: uploaderEmail };
    const content = btoa(unescape(encodeURIComponent(JSON.stringify(newData, null, 2))));
    const putResp = await fetch(apiUrl, { method: 'PUT', headers, body: JSON.stringify({ message: commitMessage || 'Import shipments', content, sha }) });
    if (putResp.ok) return { result: await putResp.json(), data: newData };
    if (putResp.status === 409 || putResp.status === 422) {
      if (attempt < maxRetries) continue; // SHA conflict — retry with fresh data
    }
    let msg = 'GitHub API error ' + putResp.status;
    try { const e = await putResp.json(); msg = e.message || msg; } catch {}
    throw new Error(msg);
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

// Restore shipments.json to the version at a specific commit SHA
async function restoreToCommit(commitSha, uploaderEmail) {
  const headers = _ghHeaders();
  // Fetch the file at that commit
  const fileResp = await fetch('https://api.github.com/repos/' + REPO + '/contents/data/shipments.json?ref=' + commitSha, { headers });
  if (!fileResp.ok) throw new Error('Could not fetch historical version');
  const fileJson = await fileResp.json();
  let historic;
  try { historic = JSON.parse(atob(fileJson.content.replace(/\n/g, ''))); }
  catch (e) { throw new Error('Could not parse historical file'); }
  // Commit it as the new HEAD
  await commitToGitHub('data/shipments.json', historic, 'Restore to ' + new Date(historic.last_updated || 0).toLocaleString() + ' (by ' + uploaderEmail + ')');
  return historic;
}

// ── Import helpers ───────────────────────────────────────────
function normalizeStatus(raw) {
  const s = String(raw || '').toLowerCase().trim();
  if (s.includes('ship')) return 'shipped';
  if (s.includes('cancel')) return 'cancelled';
  return 'received';
}

// assignments param is optional — if provided, stamps account_manager on each row
function mapImportRow(row, assignments) {
  let repName = String(row['sales_rep'] || row['rep_name'] || '').trim();
  // Strip the JMS house-account prefix; keep the actual rep name after it
  repName = repName.replace(/^JMS\s*-\s*Jack\s+L['']Hommedieu\s*\/\s*Mark\s+Mousseau\s*/i, '').trim();
  // If nothing left, it IS the JMS/house account — preserve the original name
  if (!repName) repName = String(row['sales_rep'] || row['rep_name'] || '').trim();

  const trackingNum = String(row['tracking_number'] || '').trim();
  const { carrier, url } = detectCarrier(trackingNum);

  // Clinic ID — try several possible column names
  const clinicId = String(
    row['clinic_id'] || row['Clinic ID'] || row['BoomRx Clinic ID'] ||
    row['clinic id'] || row['boomrx_clinic_id'] || ''
  ).trim();

  const clinicName = String(row['clinic_name'] || row['Clinic Name'] || '').trim();

  // Look up account manager from assignments
  let accountManager = null;
  if (assignments) {
    const probe = { clinic_id: clinicId, clinic_name: clinicName };
    accountManager = getAMForShipment(probe, assignments) || null;
  }

  return {
    invoice_number: String(row['invoice_number'] || '').trim(),
    order_date: row['order_date'] || '',
    rep_name: repName,
    clinic_id: clinicId,
    clinic_name: clinicName,
    pharmacy_name: String(row['pharmacy_name'] || '').trim(),
    drug_name: String(row['drug_name'] || '').trim(),
    tracking_number: trackingNum,
    carrier,
    tracking_url: url,
    status: normalizeStatus(row['status']),
    account_manager: accountManager,
    import_date: new Date().toISOString()
  };
}

function upsertShipments(existing, incoming) {
  const map = new Map(existing.map(s => [s.invoice_number, s]));
  incoming.forEach(s => {
    if (!s.invoice_number) return;
    const cur = map.get(s.invoice_number);
    if (!cur) { map.set(s.invoice_number, s); return; }
    // Keep whichever row has the newer import_date; incoming wins on tie
    const curDate = cur.import_date ? new Date(cur.import_date).getTime() : 0;
    const newDate = s.import_date ? new Date(s.import_date).getTime() : 0;
    if (newDate >= curDate) map.set(s.invoice_number, s);
  });
  return Array.from(map.values());
}

// ── Filter/search ────────────────────────────────────────────
function filterShipments(shipments, { status, search, repFilter, amFilter }, assignments) {
  return shipments.filter(s => {
    if (status && status !== 'all' && s.status !== status) return false;
    if (repFilter && s.rep_name !== repFilter) return false;
    if (amFilter) {
      const am = getAMForShipment(s, assignments || {});
      if (amFilter === '__unassigned__') {
        if (am && am !== 'Unassigned') return false;
      } else {
        if (am !== amFilter) return false;
      }
    }
    if (search) {
      const q = search.toLowerCase();
      const fields = [s.clinic_name, s.invoice_number, s.tracking_number, s.rep_name, s.pharmacy_name];
      if (!fields.some(f => f && String(f).toLowerCase().includes(q))) return false;
    }
    return true;
  });
}
