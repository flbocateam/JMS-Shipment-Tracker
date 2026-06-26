/**
 * JMS Shipment Tracker — Activity & Presence logger (Google Apps Script)
 *
 * WHAT IT DOES
 *   - Receives login + heartbeat ("ping") events from the dashboard (any user).
 *   - Keeps a small "Presence" tab (one row per user, last-seen timestamp) for
 *     live "online now" status.
 *   - Appends every login to a "History" tab for usage history.
 *   - doGet returns a JSON summary (online users + per-user usage stats),
 *     protected by a secret key so only admins/VP can read it.
 *
 * SETUP (one-time, ~10 min) — use ANY Google account you like:
 *   1. Go to https://sheets.new and create a blank spreadsheet (name it e.g.
 *      "JMS Activity"). This can be under any Google account.
 *   2. Extensions → Apps Script. Delete the default code, paste THIS file.
 *   3. Change READ_KEY below to a secret only you + Mark will know.
 *   4. Click Deploy → New deployment → type "Web app".
 *        - Description: JMS activity
 *        - Execute as: Me
 *        - Who has access: Anyone   (required so reps' browsers can post)
 *   5. Authorize when prompted. Copy the "Web app URL" (ends in /exec).
 *   6. Send Claude: the Web app URL + the READ_KEY you chose.
 *
 * PRIVACY: this only logs email, name, role, page, and timestamps — no PII
 * beyond the work account already used to sign in. Internal use only.
 */

const READ_KEY = 'CHANGE_ME_TO_A_SECRET';   // <-- set this; admins enter it to view
const PRESENCE_TAB = 'Presence';
const HISTORY_TAB = 'History';
const ONLINE_WINDOW_MS = 3 * 60 * 1000;       // "online" = pinged in last 3 min

function _ss() { return SpreadsheetApp.getActiveSpreadsheet(); }
function _tab(name, headers) {
  const ss = _ss();
  let sh = ss.getSheetByName(name);
  if (!sh) { sh = ss.insertSheet(name); sh.appendRow(headers); }
  return sh;
}
function _json(obj, callback) {
  // JSONP when a callback is supplied (lets the dashboard read cross-origin
  // without CORS headaches); plain JSON otherwise.
  if (callback) {
    return ContentService.createTextOutput(callback + '(' + JSON.stringify(obj) + ')')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// ── Write: login + heartbeat events ──────────────────────────────
function doPost(e) {
  try {
    const b = JSON.parse(e.postData.contents || '{}');
    const email = String(b.email || '').toLowerCase();
    if (!email) return _json({ ok: false, error: 'no email' });
    const now = new Date();
    const name = String(b.name || ''), role = String(b.role || ''), page = String(b.page || '');
    const event = String(b.event || 'ping');

    // Upsert presence (one row per user)
    const pres = _tab(PRESENCE_TAB, ['email', 'name', 'role', 'lastSeen', 'lastPage']);
    const data = pres.getDataRange().getValues();
    let row = -1;
    for (let i = 1; i < data.length; i++) { if (String(data[i][0]).toLowerCase() === email) { row = i + 1; break; } }
    if (row === -1) pres.appendRow([email, name, role, now, page]);
    else { pres.getRange(row, 2, 1, 4).setValues([[name, role, now, page]]); }

    // Append login events to history
    if (event === 'login') {
      _tab(HISTORY_TAB, ['timestamp', 'email', 'name', 'role', 'page']).appendRow([now, email, name, role, page]);
    }
    return _json({ ok: true });
  } catch (err) {
    return _json({ ok: false, error: String(err) });
  }
}

// ── Read: summary for admin/VP view (key-protected) ──────────────
function doGet(e) {
  const cb = e.parameter.callback || '';
  if (String(e.parameter.key || '') !== READ_KEY) return _json({ ok: false, error: 'unauthorized' }, cb);
  const now = Date.now();

  // Presence → online + last seen per user
  const pres = _tab(PRESENCE_TAB, ['email', 'name', 'role', 'lastSeen', 'lastPage']).getDataRange().getValues();
  const users = {};
  for (let i = 1; i < pres.length; i++) {
    const [email, name, role, lastSeen, lastPage] = pres[i];
    if (!email) continue;
    const ls = lastSeen ? new Date(lastSeen).getTime() : 0;
    users[String(email).toLowerCase()] = {
      email: email, name: name, role: role, lastSeen: ls, lastPage: lastPage,
      online: (now - ls) < ONLINE_WINDOW_MS, logins: 0, logins7d: 0, lastLogin: 0
    };
  }

  // History → login counts (all-time + last 7 days) + last login
  const hist = _tab(HISTORY_TAB, ['timestamp', 'email', 'name', 'role', 'page']).getDataRange().getValues();
  const weekAgo = now - 7 * 24 * 3600 * 1000;
  for (let i = 1; i < hist.length; i++) {
    const ts = hist[i][0] ? new Date(hist[i][0]).getTime() : 0;
    const email = String(hist[i][1] || '').toLowerCase();
    if (!email) continue;
    if (!users[email]) users[email] = { email: email, name: hist[i][2], role: hist[i][3], lastSeen: 0, online: false, logins: 0, logins7d: 0, lastLogin: 0 };
    users[email].logins++;
    if (ts > weekAgo) users[email].logins7d++;
    if (ts > users[email].lastLogin) users[email].lastLogin = ts;
  }

  const list = Object.keys(users).map(k => users[k]).sort((a, b) => b.lastSeen - a.lastSeen);
  return _json({ ok: true, generatedAt: now, users: list, online: list.filter(u => u.online).map(u => u.email) }, cb);
}
