'use strict';
/* ===== Butil POS - application logic ===== */

const NAV = [
  { id: 'dashboard',  icon: '📊', label: 'Dashboard',  roles: ['admin'] },
  { id: 'pos',        icon: '🛒', label: 'Sales (POS)', roles: ['admin', 'staff'] },
  { id: 'receipts',   icon: '🧾', label: 'Receipts',   roles: ['admin', 'staff'] },
  { id: 'inventory',  icon: '📦', label: 'Inventory',  roles: ['admin'] },
  { id: 'categories', icon: '🏷️', label: 'Categories', roles: ['admin'] },
  { id: 'accounts',   icon: '👤', label: 'Accounts',   roles: ['admin'] },
  { id: 'reports',    icon: '📈', label: 'Reports',    roles: ['admin'] }
];

let S = null;            // current session {username, role, name, sessionId}
let page = null;         // current page id
let heartbeat = null;

/* ---------- helpers ---------- */
function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('show'), 2400);
}
function openModal(html, cls) {
  const o = document.createElement('div');
  o.className = 'overlay';
  o.innerHTML = '<div class="modal ' + (cls || '') + '">' + html + '</div>';
  $('#modal-root').appendChild(o);
  return o;
}
function closeModal(o) { if (o && o.parentNode) o.parentNode.removeChild(o); }
function confirmBox(title, msg, okLabel, danger) {
  return new Promise(res => {
    const o = openModal('<h3>' + esc(title) + '</h3><p>' + msg + '</p><div class="actions"><button class="btn btn-ghost" data-x="0">Cancel</button><button class="btn ' + (danger ? 'btn-danger' : 'btn-primary') + '" data-x="1">' + esc(okLabel || 'OK') + '</button></div>');
    $$('[data-x]', o).forEach(b => b.onclick = () => { closeModal(o); res(b.dataset.x === '1'); });
  });
}
const D = () => Store.data;
const catName = id => (D().categories.find(c => c.id === id) || { name: 'Uncategorized' }).name;
const todayKey = () => dKey(new Date());
function weekStart(d) { d = new Date(d); d.setHours(0, 0, 0, 0); const k = (d.getDay() + 6) % 7; d.setDate(d.getDate() - k); return d; }
function periodRange(p) {
  const n = new Date(), y = n.getFullYear(), m = n.getMonth();
  if (p === 'daily') return [dKey(n), dKey(n)];
  if (p === 'weekly') { const s = weekStart(n), e = new Date(s); e.setDate(e.getDate() + 6); return [dKey(s), dKey(e)]; }
  if (p === 'monthly') return [dKey(new Date(y, m, 1)), dKey(new Date(y, m + 1, 0))];
  if (p === 'quarterly') { const q = Math.floor(m / 3) * 3; return [dKey(new Date(y, q, 1)), dKey(new Date(y, q + 3, 0))]; }
  if (p === 'annual') return [y + '-01-01', y + '-12-31'];
  return ['', ''];
}
const saleProfit = s => s.items.reduce((a, i) => a + (i.price - (i.cost || 0)) * i.qty, 0);
const activeSales = () => D().sales.filter(s => s.status !== 'refunded');

/* ======================= LOGIN / LOGOUT ======================= */
function closeDanglingSessions() {
  let seen = null; try { seen = JSON.parse(localStorage.getItem('butil_seen')); } catch (e) {}
  let changed = false;
  D().sessions.forEach(s => {
    if (!s.timeOut) {
      s.timeOut = (seen && seen.id === s.id && seen.t) ? seen.t : s.timeIn;
      s.auto = true; changed = true;
    }
  });
  if (changed) Store.save();
}
function askStaffName() {
  return new Promise(res => {
    const o = openModal('<h3>Welcome!</h3><p class="muted">Please enter your name to continue to the POS and Receipts.</p>' +
      '<label for="sn">Staff name</label><input id="sn" type="text" maxlength="40" autocomplete="off">' +
      '<div id="sn-err" class="error" hidden>Please enter your name (at least 2 characters).</div>' +
      '<div class="actions"><button class="btn btn-ghost" id="sn-cancel">Cancel</button><button class="btn btn-primary" id="sn-ok">Continue</button></div>');
    const inp = $('#sn', o); setTimeout(() => inp.focus(), 50);
    const go = () => { const v = inp.value.trim().replace(/\s+/g, ' '); if (v.length < 2) { $('#sn-err', o).hidden = false; return; } closeModal(o); res(v); };
    $('#sn-ok', o).onclick = go;
    inp.onkeydown = e => { if (e.key === 'Enter') go(); };
    $('#sn-cancel', o).onclick = () => { closeModal(o); res(null); };
  });
}
async function doLogin(e) {
  e.preventDefault();
  const u = $('#login-user').value.trim(), p = $('#login-pass').value, err = $('#login-error');
  const acc = USERS[u];
  if (!acc || acc.pass !== p) { err.textContent = 'Incorrect username or password.'; err.hidden = false; return; }
  err.hidden = true;
  closeDanglingSessions();
  let name = 'Administrator', sessionId = null;
  if (acc.role === 'staff') {
    name = await askStaffName();
    if (!name) return;
    sessionId = Store.uid();
    D().sessions.push({ id: sessionId, username: u, name, timeIn: new Date().toISOString(), timeOut: null });
    Store.save();
    const beat = () => { try { localStorage.setItem('butil_seen', JSON.stringify({ id: sessionId, t: new Date().toISOString() })); } catch (e) {} };
    beat(); heartbeat = setInterval(beat, 20000);
  }
  S = { username: u, role: acc.role, name, sessionId };
  $('#login-form').reset();
  $('#login-screen').hidden = true;
  $('#app').hidden = false;
  buildNav();
  go(acc.role === 'admin' ? 'dashboard' : 'pos');
}
function doLogout() {
  if (S && S.sessionId) {
    const s = D().sessions.find(x => x.id === S.sessionId);
    if (s && !s.timeOut) { s.timeOut = new Date().toISOString(); Store.save(); }
  }
  clearInterval(heartbeat); heartbeat = null;
  try { localStorage.removeItem('butil_seen'); } catch (e) {}
  S = null; page = null; cart = [];
  $$('.overlay').forEach(closeModal);
  $('#app').hidden = true;
  $('#login-screen').hidden = false;
  $('#sidenav').classList.remove('open'); $('#scrim').classList.remove('show');
}

/* ======================= NAV / ROUTER ======================= */
function buildNav() {
  $('#nav-user').innerHTML = '<b>' + esc(S.name) + '</b>' + (S.role === 'admin' ? 'Admin account' : 'Staff account');
  $('#nav-list').innerHTML = NAV.filter(n => n.roles.includes(S.role))
    .map(n => '<li><button data-p="' + n.id + '"><span>' + n.icon + '</span> ' + n.label + '</button></li>').join('');
  $$('#nav-list button').forEach(b => b.onclick = () => go(b.dataset.p));
}
function toggleNav(open) {
  $('#sidenav').classList.toggle('open', open);
  $('#scrim').classList.toggle('show', open);
}
function go(p) {
  const item = NAV.find(n => n.id === p);
  if (!S || !item || !item.roles.includes(S.role)) return;   // role guard
  page = p; toggleNav(false);
  $$('#nav-list button').forEach(b => b.classList.toggle('active', b.dataset.p === p));
  $('#page-title').textContent = item.label;
  const c = $('#content'); c.scrollTop = 0;
  ({ dashboard: pgDashboard, pos: pgPOS, receipts: pgReceipts, inventory: pgInventory,
     categories: pgCategories, accounts: pgAccounts, reports: pgReports })[p](c);
}

/* ======================= DASHBOARD ======================= */
let dashMode = 'daily';
function buckets(mode) {
  const out = [], now = new Date(); now.setHours(0, 0, 0, 0);
  if (mode === 'daily') for (let i = 13; i >= 0; i--) { const d = new Date(now); d.setDate(d.getDate() - i); out.push({ start: d, end: new Date(d.getTime() + 864e5), label: (d.getMonth() + 1) + '/' + d.getDate() }); }
  if (mode === 'weekly') for (let i = 11; i >= 0; i--) { const d = weekStart(now); d.setDate(d.getDate() - 7 * i); const e = new Date(d); e.setDate(e.getDate() + 7); out.push({ start: d, end: e, label: (d.getMonth() + 1) + '/' + d.getDate() }); }
  if (mode === 'monthly') for (let i = 11; i >= 0; i--) { const d = new Date(now.getFullYear(), now.getMonth() - i, 1); const e = new Date(d.getFullYear(), d.getMonth() + 1, 1); out.push({ start: d, end: e, label: d.toLocaleString('en', { month: 'short' }) + (d.getMonth() === 0 || i === 11 ? " '" + String(d.getFullYear()).slice(2) : '') }); }
  const sales = activeSales();
  out.forEach(b => { b.value = 0; });
  sales.forEach(s => { const t = new Date(s.date).getTime(); const b = out.find(x => t >= x.start.getTime() && t < x.end.getTime()); if (b) b.value += saleProfit(s); });
  return out;
}
function lineChart(pts) {
  const W = 640, H = 260, L = 62, R = 14, T = 16, B = 34;
  const max = Math.max(1, ...pts.map(p => p.value));
  const nice = (() => { const e = Math.pow(10, Math.floor(Math.log10(max))); const f = max / e; return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * e; })();
  const x = i => L + (pts.length === 1 ? (W - L - R) / 2 : i * (W - L - R) / (pts.length - 1));
  const y = v => T + (H - T - B) * (1 - v / nice);
  let g = '';
  for (let i = 0; i <= 4; i++) {
    const v = nice * i / 4, yy = y(v);
    g += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + yy + '" y2="' + yy + '" stroke="#e2dcc6"/><text x="' + (L - 8) + '" y="' + (yy + 4) + '" font-size="11" text-anchor="end" fill="#6b6a5a">' + Math.round(v).toLocaleString() + '</text>';
  }
  const step = Math.ceil(pts.length / 7);
  pts.forEach((p, i) => { if (i % step === 0 || i === pts.length - 1) g += '<text x="' + x(i) + '" y="' + (H - 12) + '" font-size="11" text-anchor="middle" fill="#6b6a5a">' + esc(p.label) + '</text>'; });
  const line = pts.map((p, i) => (i ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(p.value).toFixed(1)).join(' ');
  const area = line + ' L' + x(pts.length - 1) + ' ' + y(0) + ' L' + x(0) + ' ' + y(0) + ' Z';
  const dots = pts.map((p, i) => '<circle cx="' + x(i) + '" cy="' + y(p.value) + '" r="4.5" fill="#b07038" stroke="#fff" stroke-width="2"><title>' + esc(p.label) + ': ' + peso(p.value) + '</title></circle>').join('');
  return '<svg id="chart" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Profit line graph">' + g +
    '<path d="' + area + '" fill="rgba(176,112,56,.14)"/><path d="' + line + '" fill="none" stroke="#18331f" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/>' + dots + '</svg>';
}
function pgDashboard(c) {
  const sales = activeSales().slice().sort((a, b) => new Date(b.date) - new Date(a.date));
  const last = sales[0];
  const tk = todayKey();
  const todayProfit = sales.filter(s => dKey(s.date) === tk).reduce((a, s) => a + saleProfit(s), 0);
  const totalProfit = sales.reduce((a, s) => a + saleProfit(s), 0);
  const units = D().products.reduce((a, p) => a + (+p.stock || 0), 0);
  const low = D().products.filter(p => (+p.stock || 0) <= 5);
  const tally = {};
  sales.forEach(s => s.items.forEach(i => { const k = i.name; tally[k] = (tally[k] || 0) + i.qty; }));
  const top = Object.entries(tally).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const topMax = top.length ? top[0][1] : 1;

  c.innerHTML =
    '<div class="page-head"><h2>Dashboard</h2></div>' +
    '<div class="cards">' +
      '<div class="card stat"><div class="k">Most recent profit</div><div class="v">' + (last ? peso(saleProfit(last)) : '—') + '</div><div class="s">' + (last ? esc(last.receiptNo) + ' · ' + fmtDT(last.date) : 'No sales yet') + '</div></div>' +
      '<div class="card stat"><div class="k">Profit today</div><div class="v">' + peso(todayProfit) + '</div><div class="s">All-time: ' + peso(totalProfit) + '</div></div>' +
      '<div class="card stat"><div class="k">Stock count</div><div class="v">' + units.toLocaleString() + ' <span style="font-size:14px;font-weight:600">units</span></div><div class="s">' + D().products.length + ' products · ' + low.length + ' low / out of stock</div></div>' +
    '</div>' +
    '<div class="card"><div class="card-head"><h3>Profit over time</h3><div class="seg" id="dash-seg">' +
      ['daily', 'weekly', 'monthly'].map(m => '<button data-m="' + m + '" class="' + (m === dashMode ? 'on' : '') + '">' + m[0].toUpperCase() + m.slice(1) + '</button>').join('') + '</div></div>' +
      '<div id="chart-box">' + lineChart(buckets(dashMode)) + '</div></div>' +
    '<div class="card"><h3>Most purchased products (Top 5)</h3>' +
      (top.length ? top.map((t, i) => '<div class="top-row"><div class="rank">' + (i + 1) + '</div><div><b>' + esc(t[0]) + '</b><div class="bar"><i style="width:' + (t[1] / topMax * 100) + '%"></i></div></div><div><b>' + t[1] + '</b> sold</div></div>').join('') : '<div class="empty">No purchases recorded yet.</div>') + '</div>' +
    (low.length ? '<div class="card"><h3>Low / out of stock</h3>' + low.slice(0, 12).map(p => '<span class="tag">' + esc(p.name) + ' · ' + (+p.stock || 0) + '</span>').join('') + '</div>' : '');
  $$('#dash-seg button', c).forEach(b => b.onclick = () => { dashMode = b.dataset.m; pgDashboard(c); });
}

/* ======================= POS ======================= */
let cart = [];            // [{pid, qty}]
let posCat = 'all', posQ = '';
function cartTotal() { return cart.reduce((a, l) => { const p = D().products.find(x => x.id === l.pid); return a + (p ? p.price * l.qty : 0); }, 0); }
function cartCount() { return cart.reduce((a, l) => a + l.qty, 0); }
function addToCart(pid) {
  const p = D().products.find(x => x.id === pid); if (!p) return;
  const l = cart.find(x => x.pid === pid);
  const have = l ? l.qty : 0;
  if (have + 1 > (+p.stock || 0)) { toast(p.stock > 0 ? 'Only ' + p.stock + ' in stock' : p.name + ' is out of stock'); return; }
  if (l) l.qty++; else cart.push({ pid, qty: 1 });
  renderCart();
}
function pgPOS(c) {
  c.innerHTML =
    '<div class="page-head"><h2>Sales (POS)</h2></div>' +
    '<div class="pos"><div>' +
      '<div class="toolbar"><input id="pos-q" class="grow" type="search" placeholder="Search product, SKU or scan barcode…" value="' + esc(posQ) + '" autocomplete="off"></div>' +
      '<div class="chips" id="pos-chips"></div><div class="grid" id="pos-grid"></div>' +
    '</div><aside class="cart" id="cart"></aside></div>' +
    '<button id="cart-fab"></button>';
  const q = $('#pos-q', c);
  q.oninput = () => { posQ = q.value; renderPosGrid(); };
  q.onkeydown = e => {
    if (e.key !== 'Enter') return;
    const v = q.value.trim().toLowerCase(); if (!v) return;
    const hit = D().products.find(p => p.barcode === v || p.sku.toLowerCase() === v);
    if (hit) { addToCart(hit.id); q.value = ''; posQ = ''; renderPosGrid(); }
  };
  $('#cart-fab', c).onclick = () => $('#cart').classList.add('open');
  renderPosChips(); renderPosGrid(); renderCart();
}
function renderPosChips() {
  const cats = [{ id: 'all', name: 'All' }].concat(D().categories);
  const box = $('#pos-chips'); if (!box) return;
  box.innerHTML = cats.map(k => '<button class="chip ' + (k.id === posCat ? 'on' : '') + '" data-c="' + k.id + '">' + esc(k.name) + '</button>').join('');
  $$('.chip', box).forEach(b => b.onclick = () => { posCat = b.dataset.c; renderPosChips(); renderPosGrid(); });
}
function renderPosGrid() {
  const g = $('#pos-grid'); if (!g) return;
  const q = posQ.trim().toLowerCase();
  const list = D().products.filter(p => (posCat === 'all' || p.category === posCat) &&
    (!q || (p.name + ' ' + p.sku + ' ' + p.barcode).toLowerCase().includes(q)));
  g.innerHTML = list.length ? list.map(p =>
    '<button class="pcard ' + (p.stock <= 0 ? 'out' : '') + '" data-id="' + p.id + '"><span class="pn">' + esc(p.name) + '</span><span class="pc">' + esc(catName(p.category)) + '</span><span class="pp">' + peso(p.price) + '</span><span class="ps">' + (p.stock > 0 ? p.stock + ' in stock' : 'Out of stock') + '</span></button>').join('')
    : '<div class="empty" style="grid-column:1/-1">No products found.</div>';
  $$('.pcard', g).forEach(b => b.onclick = () => addToCart(b.dataset.id));
}
function renderCart() {
  const box = $('#cart'); if (!box) return;
  const lines = cart.map(l => ({ l, p: D().products.find(x => x.id === l.pid) })).filter(x => x.p);
  cart = lines.map(x => x.l);
  const wasOpen = box.classList.contains('open');
  box.innerHTML =
    '<button class="btn btn-ghost btn-sm cart-close" id="cart-close">Close ✕</button><h3>Current order</h3>' +
    '<div id="cart-lines">' + (lines.length ? lines.map(({ l, p }) =>
      '<div class="line"><div class="ln">' + esc(p.name) + '<div class="small muted">' + peso(p.price) + ' each</div></div><div class="lt">' + peso(p.price * l.qty) + '</div>' +
      '<div class="qty"><button data-a="dec" data-id="' + p.id + '">−</button><b>' + l.qty + '</b><button data-a="inc" data-id="' + p.id + '">+</button></div>' +
      '<div style="text-align:right"><button class="qty rm" style="width:auto;padding:0 10px;height:28px;border-radius:8px;border:1px solid #e7c3bc;background:#fff;color:var(--danger);cursor:pointer" data-a="rm" data-id="' + p.id + '">Remove</button></div></div>').join('')
      : '<div class="empty">Tap a product to add it.</div>') + '</div>' +
    '<div class="total-row"><span>Total</span><span>' + peso(cartTotal()) + '</span></div>' +
    '<div class="row2"><div><label for="pay-m" style="margin-top:0">Payment</label><select id="pay-m"><option>Cash</option><option>GCash</option><option>Card</option></select></div>' +
    '<div id="tend-wrap"><label for="tend" style="margin-top:0">Cash received</label><input id="tend" type="number" inputmode="decimal" min="0" step="0.01"></div></div>' +
    '<div class="change" id="change"></div>' +
    '<div class="row2"><button class="btn btn-ghost" id="clear-cart"' + (lines.length ? '' : ' disabled') + '>Clear</button><button class="btn btn-primary" id="checkout"' + (lines.length ? '' : ' disabled') + '>Checkout</button></div>';
  if (wasOpen) box.classList.add('open');
  $('#cart-close', box).onclick = () => box.classList.remove('open');
  $$('[data-a]', box).forEach(b => b.onclick = () => {
    const l = cart.find(x => x.pid === b.dataset.id), p = D().products.find(x => x.id === b.dataset.id);
    if (b.dataset.a === 'inc') { if (l.qty + 1 > p.stock) toast('Only ' + p.stock + ' in stock'); else l.qty++; }
    if (b.dataset.a === 'dec') { l.qty--; if (l.qty <= 0) cart = cart.filter(x => x !== l); }
    if (b.dataset.a === 'rm') cart = cart.filter(x => x !== l);
    renderCart();
  });
  const pm = $('#pay-m', box), tend = $('#tend', box);
  const upd = () => {
    const cash = pm.value === 'Cash';
    $('#tend-wrap', box).style.visibility = cash ? 'visible' : 'hidden';
    const t = cartTotal(), r = parseFloat(tend.value);
    $('#change', box).textContent = cash && lines.length ? (isNaN(r) ? '' : r >= t ? 'Change: ' + peso(r - t) : 'Short by ' + peso(t - r)) : '';
  };
  pm.value = renderCart.pm || 'Cash'; tend.value = renderCart.tend || '';
  pm.onchange = () => { renderCart.pm = pm.value; upd(); };
  tend.oninput = () => { renderCart.tend = tend.value; upd(); };
  upd();
  $('#clear-cart', box).onclick = () => { cart = []; renderCart.tend = ''; renderCart(); };
  $('#checkout', box).onclick = checkout;
  const fab = $('#cart-fab');
  if (fab) fab.innerHTML = '🛒 <span>' + cartCount() + ' item' + (cartCount() === 1 ? '' : 's') + ' · ' + peso(cartTotal()) + '</span>';
}
renderCart.pm = 'Cash'; renderCart.tend = '';

function checkout() {
  if (!cart.length) return;
  const total = cartTotal(), method = $('#pay-m').value;
  let tendered = null, change = 0;
  if (method === 'Cash') {
    tendered = parseFloat($('#tend').value);
    if (isNaN(tendered) || tendered < total) { toast('Cash received is less than the total'); return; }
    change = tendered - total;
  }
  // re-validate stock
  for (const l of cart) { const p = D().products.find(x => x.id === l.pid); if (!p || p.stock < l.qty) { toast('Not enough stock for ' + (p ? p.name : 'an item')); return; } }
  const items = cart.map(l => { const p = D().products.find(x => x.id === l.pid); p.stock -= l.qty; return { pid: p.id, sku: p.sku, name: p.name, price: p.price, cost: p.cost || 0, qty: l.qty }; });
  D().counters.receipt++;
  const sale = { id: Store.uid(), receiptNo: 'R-' + pad(D().counters.receipt, 6), date: new Date().toISOString(), items, total,
                 payment: method, tendered, change, staff: S.name, status: 'paid' };
  D().sales.push(sale); Store.save();
  cart = []; renderCart.tend = ''; $('#cart').classList.remove('open');
  renderCart(); renderPosGrid();
  const o = openModal('<h3>✅ Sale complete</h3>' + receiptHTML(sale) + '<div class="actions"><button class="btn btn-primary" id="done">New order</button></div>');
  $('#done', o).onclick = () => closeModal(o);
}
function receiptHTML(s) {
  return '<div class="small muted">' + esc(s.receiptNo) + ' · ' + fmtDT(s.date) + '<br>Served by: ' + esc(s.staff) + ' · ' + esc(s.payment) + '</div>' +
    '<div class="table-wrap" style="max-height:none;box-shadow:none;margin-top:8px"><table style="min-width:0"><thead><tr><th>Product</th><th class="num">Qty</th><th class="num">Price</th><th class="num">Amount</th></tr></thead><tbody>' +
    s.items.map(i => '<tr><td>' + esc(i.name) + '</td><td class="num">' + i.qty + '</td><td class="num">' + peso(i.price) + '</td><td class="num">' + peso(i.price * i.qty) + '</td></tr>').join('') +
    '</tbody></table></div><div class="receipt-sum"><span>Total</span><span>' + peso(s.total) + '</span></div>' +
    (s.payment === 'Cash' ? '<div class="small muted">Cash: ' + peso(s.tendered) + ' · Change: ' + peso(s.change) + '</div>' : '');
}

/* ======================= RECEIPTS ======================= */
let rcQ = '', rcOpen = null, rcLimit = 50;
function pgReceipts(c) {
  c.innerHTML = '<div class="page-head"><h2>Receipts</h2></div>' +
    '<div class="toolbar"><input id="rc-q" class="grow" type="search" placeholder="Search receipt no., product, staff, date, status…" value="' + esc(rcQ) + '" autocomplete="off"></div><div id="rc-list"></div>';
  const q = $('#rc-q', c);
  q.oninput = () => { rcQ = q.value; rcLimit = 50; renderReceipts(); };
  renderReceipts();
}
function renderReceipts() {
  const box = $('#rc-list'); if (!box) return;
  const q = rcQ.trim().toLowerCase();
  const all = D().sales.slice().sort((a, b) => new Date(b.date) - new Date(a.date))
    .filter(s => !q || [s.receiptNo, s.staff, s.status, s.payment, fmtDT(s.date), dKey(s.date), s.items.map(i => i.name + ' ' + i.sku).join(' ')].join(' ').toLowerCase().includes(q));
  if (!all.length) { box.innerHTML = '<div class="card empty">No receipts found.</div>'; return; }
  box.innerHTML = all.slice(0, rcLimit).map(s => {
    const open = rcOpen === s.id;
    const badge = '<span class="badge ' + (s.status === 'refunded' ? 'refunded' : 'paid') + '">' + (s.status === 'refunded' ? 'Refunded' : 'Paid') + '</span>';
    return '<div class="rc ' + (open ? 'open' : '') + '" data-id="' + s.id + '"><div class="rc-head" data-open="' + s.id + '"><div><div class="no">' + esc(s.receiptNo) + '</div><div class="meta">' + fmtDT(s.date) + ' · ' + esc(s.staff) + ' · ' + s.items.reduce((a, i) => a + i.qty, 0) + ' item(s)</div></div><div style="text-align:right"><b>' + peso(s.total) + '</b><div>' + badge + '</div></div></div>' +
      (open ? '<div class="rc-body">' + receiptHTML(s) +
        (s.status === 'refunded' ? '<div class="small muted">Refunded ' + fmtDT(s.refundedAt) + ' by ' + esc(s.refundedBy || '') + '</div>' : '') +
        '<div class="rc-actions"><button class="btn btn-ghost" data-back="1">← Back</button><button class="btn btn-danger" data-refund="' + s.id + '"' + (s.status === 'refunded' ? ' disabled' : '') + '>Refund</button></div></div>' : '') + '</div>';
  }).join('') + (all.length > rcLimit ? '<button class="btn btn-ghost btn-block" id="rc-more">Show more (' + (all.length - rcLimit) + ' remaining)</button>' : '');
  $$('[data-open]', box).forEach(h => h.onclick = () => { rcOpen = h.dataset.open; renderReceipts(); });
  $$('[data-back]', box).forEach(b => b.onclick = () => { rcOpen = null; renderReceipts(); });
  $$('[data-refund]', box).forEach(b => b.onclick = () => refund(b.dataset.refund));
  const more = $('#rc-more'); if (more) more.onclick = () => { rcLimit += 50; renderReceipts(); };
}
async function refund(id) {
  const s = D().sales.find(x => x.id === id); if (!s || s.status === 'refunded') return;
  const ok = await confirmBox('Refund ' + s.receiptNo + '?', 'This refunds <b>' + peso(s.total) + '</b>, returns the items to stock and removes the sale from reports and the dashboard.', 'Refund', true);
  if (!ok) return;
  s.items.forEach(i => { const p = D().products.find(x => x.id === i.pid); if (p) p.stock = (+p.stock || 0) + i.qty; });
  s.status = 'refunded'; s.refundedAt = new Date().toISOString(); s.refundedBy = S.name;
  Store.save(); toast('Receipt refunded'); renderReceipts();
}

/* ======================= INVENTORY ======================= */
let invQ = '', invCat = 'all', invSel = new Set();
function pgInventory(c) {
  c.innerHTML = '<div class="page-head"><h2>Inventory</h2><div class="toolbar" style="margin:0"><button class="btn btn-danger" id="inv-del" disabled>Delete selected</button><button class="btn btn-primary" id="inv-add">+ Add product</button></div></div>' +
    '<div class="toolbar"><input id="inv-q" class="grow" type="search" placeholder="Search name, SKU, barcode, ingredients…" value="' + esc(invQ) + '" autocomplete="off"></div>' +
    '<div class="chips" id="inv-chips"></div><div class="table-wrap" id="inv-table"></div>';
  $('#inv-q', c).oninput = e => { invQ = e.target.value; renderInv(); };
  $('#inv-add', c).onclick = () => productForm();
  $('#inv-del', c).onclick = async () => {
    const n = invSel.size; if (!n) return;
    if (!await confirmBox('Delete ' + n + ' product' + (n > 1 ? 's' : '') + '?', 'This cannot be undone. Past receipts are kept.', 'Delete', true)) return;
    D().products = D().products.filter(p => !invSel.has(p.id)); invSel.clear(); Store.save(); toast('Deleted'); renderInv();
  };
  renderInv();
}
function invFiltered() {
  const q = invQ.trim().toLowerCase();
  return D().products.filter(p => (invCat === 'all' || p.category === invCat) &&
    (!q || [p.name, p.sku, p.barcode, p.description, catName(p.category), p.allergens.join(' ')].join(' ').toLowerCase().includes(q)));
}
function renderInv() {
  const chips = $('#inv-chips'); if (!chips) return;
  if (invCat !== 'all' && !D().categories.some(k => k.id === invCat)) invCat = 'all';
  chips.innerHTML = [{ id: 'all', name: 'All' }].concat(D().categories).map(k => '<button class="chip ' + (k.id === invCat ? 'on' : '') + '" data-c="' + k.id + '">' + esc(k.name) + '</button>').join('');
  $$('.chip', chips).forEach(b => b.onclick = () => { invCat = b.dataset.c; renderInv(); });
  const list = invFiltered();
  const ids = new Set(D().products.map(p => p.id)); invSel.forEach(i => { if (!ids.has(i)) invSel.delete(i); });
  const allOn = list.length && list.every(p => invSel.has(p.id));
  $('#inv-table').innerHTML = '<table><thead><tr><th><input type="checkbox" id="inv-all" ' + (allOn ? 'checked' : '') + ' aria-label="Select all"></th><th>#</th><th>SKU</th><th>Barcode</th><th>Product Name</th><th>Description</th><th>Allergens</th><th class="num">Price</th><th class="num">Stock</th><th>Modification</th></tr></thead><tbody>' +
    (list.length ? list.map((p, i) =>
      '<tr><td><input type="checkbox" data-sel="' + p.id + '" ' + (invSel.has(p.id) ? 'checked' : '') + '></td><td>' + (i + 1) + '</td><td class="nowrap">' + esc(p.sku) + '</td>' +
      '<td class="bc">' + barcodeSVG(p.barcode) + esc(p.barcode) + '</td>' +
      '<td><b>' + esc(p.name) + '</b><div class="small muted">' + esc(catName(p.category)) + '</div></td><td class="desc">' + esc(p.description) + '</td>' +
      '<td>' + (p.allergens.length ? p.allergens.map(a => '<span class="tag">' + esc(a) + '</span>').join('') : '<span class="tag none">None detected</span>') + '</td>' +
      '<td class="num">' + peso(p.price) + '</td><td class="num">' + (+p.stock || 0) + '</td>' +
      '<td class="nowrap"><button class="btn btn-ghost btn-sm" data-edit="' + p.id + '">Edit</button> <button class="btn btn-danger btn-sm" data-del="' + p.id + '">Delete</button></td></tr>').join('')
      : '<tr><td colspan="10" class="empty">No products found.</td></tr>') + '</tbody></table>';
  const t = $('#inv-table');
  $('#inv-all', t).onchange = e => { list.forEach(p => e.target.checked ? invSel.add(p.id) : invSel.delete(p.id)); renderInv(); };
  $$('[data-sel]', t).forEach(cb => cb.onchange = () => { cb.checked ? invSel.add(cb.dataset.sel) : invSel.delete(cb.dataset.sel); updInvDel(); });
  $$('[data-edit]', t).forEach(b => b.onclick = () => productForm(b.dataset.edit));
  $$('[data-del]', t).forEach(b => b.onclick = async () => {
    const p = D().products.find(x => x.id === b.dataset.del);
    if (!await confirmBox('Delete product?', 'Delete <b>' + esc(p.name) + '</b>? This cannot be undone.', 'Delete', true)) return;
    D().products = D().products.filter(x => x.id !== p.id); invSel.delete(p.id); Store.save(); toast('Product deleted'); renderInv();
  });
  updInvDel();
}
function updInvDel() {
  const b = $('#inv-del'); if (!b) return;
  b.disabled = invSel.size === 0; b.textContent = invSel.size ? 'Delete selected (' + invSel.size + ')' : 'Delete selected';
}
function productForm(id) {
  const p = id ? D().products.find(x => x.id === id) : null;
  if (!D().categories.length) { toast('Create a category first'); return; }
  let n = D().counters.product + 1;
  const used = new Set(D().products.map(x => x.sku.toLowerCase()));
  while (used.has(('BUT-' + pad(n, 4)).toLowerCase())) n++;
  const sku = p ? p.sku : 'BUT-' + pad(n, 4);
  const o = openModal('<h3>' + (p ? 'Edit product' : 'Add product') + '</h3><div class="form-grid">' +
    '<div class="full"><label for="f-name">Product name *</label><input id="f-name" type="text" maxlength="60" value="' + esc(p ? p.name : '') + '"></div>' +
    '<div><label for="f-cat">Category *</label><select id="f-cat">' + D().categories.map(k => '<option value="' + k.id + '"' + (p && p.category === k.id ? ' selected' : '') + '>' + esc(k.name) + '</option>').join('') + '</select></div>' +
    '<div><label for="f-sku">SKU *</label><input id="f-sku" type="text" maxlength="24" value="' + esc(sku) + '"></div>' +
    '<div><label for="f-price">Price (₱) *</label><input id="f-price" type="number" inputmode="decimal" min="0" step="0.01" value="' + (p ? p.price : '') + '"></div>' +
    '<div><label for="f-cost">Cost (₱) <span class="muted small">for profit</span></label><input id="f-cost" type="number" inputmode="decimal" min="0" step="0.01" value="' + (p ? (p.cost || 0) : 0) + '"></div>' +
    '<div><label for="f-stock">Stock *</label><input id="f-stock" type="number" inputmode="numeric" min="0" step="1" value="' + (p ? p.stock : 0) + '"></div>' +
    '<div><label>Barcode (auto)</label><input type="text" value="' + (p ? esc(p.barcode) : 'Assigned on save') + '" disabled></div>' +
    '<div class="full"><label for="f-desc">Description / ingredients</label><textarea id="f-desc" placeholder="e.g. Espresso, steamed milk, caramel syrup">' + esc(p ? p.description : '') + '</textarea></div>' +
    '<div class="full"><label>Allergens (auto-detected)</label><div class="allergen-preview" id="f-all"></div></div></div>' +
    '<div id="f-err" class="error" hidden></div><div class="actions"><button class="btn btn-ghost" id="f-cancel">Cancel</button><button class="btn btn-primary" id="f-save">Save</button></div>', 'wide');
  const prev = () => { const a = detectAllergens($('#f-desc', o).value); $('#f-all', o).innerHTML = a.length ? a.map(x => '<span class="tag">' + esc(x) + '</span>').join('') : '<span class="tag none">None detected</span>'; };
  $('#f-desc', o).oninput = prev; prev();
  $('#f-cancel', o).onclick = () => closeModal(o);
  $('#f-save', o).onclick = () => {
    const name = $('#f-name', o).value.trim(), skuV = $('#f-sku', o).value.trim(), price = parseFloat($('#f-price', o).value),
          cost = parseFloat($('#f-cost', o).value) || 0, stock = parseInt($('#f-stock', o).value, 10), desc = $('#f-desc', o).value.trim(), cat = $('#f-cat', o).value;
    const err = m => { const e = $('#f-err', o); e.textContent = m; e.hidden = false; };
    if (!name) return err('Product name is required.');
    if (!skuV) return err('SKU is required.');
    if (D().products.some(x => x.sku.toLowerCase() === skuV.toLowerCase() && (!p || x.id !== p.id))) return err('That SKU already exists.');
    if (isNaN(price) || price < 0) return err('Enter a valid price.');
    if (isNaN(stock) || stock < 0) return err('Enter a valid stock quantity.');
    const data = { name, sku: skuV, price, cost, stock, description: desc, category: cat, allergens: detectAllergens(desc) };
    if (p) Object.assign(p, data);
    else {
      let seq = D().counters.product + 1, bc = ean13(seq);
      while (D().products.some(x => x.barcode === bc)) { seq++; bc = ean13(seq); }
      D().counters.product = seq;
      D().products.push(Object.assign({ id: 'p' + Store.uid(), barcode: bc }, data));
    }
    Store.save(); closeModal(o); toast(p ? 'Product updated' : 'Product added'); renderInv();
  };
}

/* ======================= CATEGORIES ======================= */
let catQ = '';
function pgCategories(c) {
  c.innerHTML = '<div class="page-head"><h2>Categories</h2><button class="btn btn-primary" id="cat-add">+ Add category</button></div>' +
    '<div class="toolbar"><input id="cat-q" class="grow" type="search" placeholder="Search categories…" value="' + esc(catQ) + '" autocomplete="off"></div><div class="table-wrap" id="cat-table"></div>';
  $('#cat-q', c).oninput = e => { catQ = e.target.value; renderCats(); };
  $('#cat-add', c).onclick = () => catForm();
  renderCats();
}
function renderCats() {
  const q = catQ.trim().toLowerCase();
  const list = D().categories.filter(k => !q || k.name.toLowerCase().includes(q));
  $('#cat-table').innerHTML = '<table style="min-width:420px"><thead><tr><th>#</th><th>Category</th><th class="num">Products</th><th>Modification</th></tr></thead><tbody>' +
    (list.length ? list.map((k, i) => '<tr><td>' + (i + 1) + '</td><td><b>' + esc(k.name) + '</b></td><td class="num">' + D().products.filter(p => p.category === k.id).length + '</td><td class="nowrap"><button class="btn btn-ghost btn-sm" data-e="' + k.id + '">Edit</button> <button class="btn btn-danger btn-sm" data-d="' + k.id + '">Delete</button></td></tr>').join('')
      : '<tr><td colspan="4" class="empty">No categories found.</td></tr>') + '</tbody></table>';
  $$('[data-e]', $('#cat-table')).forEach(b => b.onclick = () => catForm(b.dataset.e));
  $$('[data-d]', $('#cat-table')).forEach(b => b.onclick = async () => {
    const k = D().categories.find(x => x.id === b.dataset.d), n = D().products.filter(p => p.category === k.id).length;
    if (n) { await confirmBox('Cannot delete', '<b>' + esc(k.name) + '</b> still has ' + n + ' product(s). Move or delete them first.', 'OK'); return; }
    if (!await confirmBox('Delete category?', 'Delete <b>' + esc(k.name) + '</b>?', 'Delete', true)) return;
    D().categories = D().categories.filter(x => x.id !== k.id); Store.save(); toast('Category deleted'); renderCats();
  });
}
function catForm(id) {
  const k = id ? D().categories.find(x => x.id === id) : null;
  const o = openModal('<h3>' + (k ? 'Edit category' : 'Add category') + '</h3><label for="k-name">Category name</label><input id="k-name" type="text" maxlength="30" value="' + esc(k ? k.name : '') + '"><div id="k-err" class="error" hidden></div><div class="actions"><button class="btn btn-ghost" id="k-cancel">Cancel</button><button class="btn btn-primary" id="k-save">Save</button></div>');
  setTimeout(() => $('#k-name', o).focus(), 50);
  $('#k-cancel', o).onclick = () => closeModal(o);
  const save = () => {
    const v = $('#k-name', o).value.trim(), e = $('#k-err', o);
    if (!v) { e.textContent = 'Name is required.'; e.hidden = false; return; }
    if (D().categories.some(x => x.name.toLowerCase() === v.toLowerCase() && (!k || x.id !== k.id))) { e.textContent = 'That category already exists.'; e.hidden = false; return; }
    if (k) k.name = v; else D().categories.push({ id: 'c-' + Store.uid(), name: v });
    Store.save(); closeModal(o); toast('Category saved'); renderCats();
  };
  $('#k-save', o).onclick = save; $('#k-name', o).onkeydown = e => { if (e.key === 'Enter') save(); };
}

/* ======================= ACCOUNTS ======================= */
let accQ = '';
function pgAccounts(c) {
  c.innerHTML = '<div class="page-head"><h2>Staff Accounts</h2></div><div class="toolbar"><input id="acc-q" class="grow" type="search" placeholder="Search staff name or date…" value="' + esc(accQ) + '" autocomplete="off"></div><div class="table-wrap" id="acc-table"></div>';
  $('#acc-q', c).oninput = e => { accQ = e.target.value; renderAcc(); };
  renderAcc();
}
function renderAcc() {
  const q = accQ.trim().toLowerCase();
  const list = D().sessions.slice().sort((a, b) => new Date(b.timeIn) - new Date(a.timeIn))
    .filter(s => !q || (s.name + ' ' + fmtDT(s.timeIn) + ' ' + fmtDT(s.timeOut) + ' ' + dKey(s.timeIn)).toLowerCase().includes(q));
  $('#acc-table').innerHTML = '<table style="min-width:520px"><thead><tr><th>Time in</th><th>Time out</th><th>Staff Name</th></tr></thead><tbody>' +
    (list.length ? list.map(s => '<tr><td>' + fmtDT(s.timeIn) + '</td><td>' + (s.timeOut ? fmtDT(s.timeOut) + (s.auto ? ' <span class="small muted">(app closed)</span>' : '') : '<span class="badge paid">Active</span>') + '</td><td>' + esc(s.name) + '</td></tr>').join('')
      : '<tr><td colspan="3" class="empty">No staff logins recorded yet.</td></tr>') + '</tbody></table>';
}

/* ======================= REPORTS ======================= */
let rp = { q: '', from: '', to: '', period: 'all', sel: new Set() };
function reportRows() {
  const rows = [];
  activeSales().forEach(s => s.items.forEach((i, idx) => rows.push({
    key: s.id + ':' + idx, date: s.date, sku: i.sku, name: i.name, qty: i.qty, price: i.price, profit: (i.price - (i.cost || 0)) * i.qty, staff: s.staff })));
  rows.sort((a, b) => new Date(b.date) - new Date(a.date));
  const q = rp.q.trim().toLowerCase();
  return rows.filter(r => {
    const k = dKey(r.date);
    if (rp.from && k < rp.from) return false;
    if (rp.to && k > rp.to) return false;
    return !q || (r.sku + ' ' + r.name + ' ' + r.staff + ' ' + k + ' ' + fmtDT(r.date)).toLowerCase().includes(q);
  });
}
function pgReports(c) {
  c.innerHTML = '<div class="page-head"><h2>Reports</h2><button class="btn btn-accent" id="rp-dl">⬇ Download Excel</button></div>' +
    '<div class="toolbar"><input id="rp-q" class="grow" type="search" placeholder="Search SKU, product, staff…" value="' + esc(rp.q) + '" autocomplete="off"></div>' +
    '<div class="card"><div class="chips" id="rp-chips" style="margin-bottom:6px"></div><div class="row2"><div><label for="rp-from" style="margin-top:0">From</label><input id="rp-from" type="date" value="' + rp.from + '"></div><div><label for="rp-to" style="margin-top:0">To</label><input id="rp-to" type="date" value="' + rp.to + '"></div></div></div>' +
    '<div class="cards" id="rp-sum"></div><div class="table-wrap" id="rp-table"></div>';
  $('#rp-q', c).oninput = e => { rp.q = e.target.value; renderReports(); };
  const dateChange = () => { rp.from = $('#rp-from').value; rp.to = $('#rp-to').value; rp.period = 'custom'; rp.sel.clear(); renderReports(); };
  $('#rp-from', c).onchange = dateChange; $('#rp-to', c).onchange = dateChange;
  $('#rp-dl', c).onclick = downloadReport;
  renderReports();
}
function renderReports() {
  const chips = $('#rp-chips'); if (!chips) return;
  const P = [['all', 'All'], ['daily', 'Daily'], ['weekly', 'Weekly'], ['monthly', 'Monthly'], ['quarterly', 'Quarterly'], ['annual', 'Annual']];
  chips.innerHTML = P.map(([k, l]) => '<button class="chip ' + (rp.period === k ? 'on' : '') + '" data-p="' + k + '">' + l + '</button>').join('');
  $$('.chip', chips).forEach(b => b.onclick = () => {
    rp.period = b.dataset.p; const r = periodRange(rp.period); rp.from = r[0]; rp.to = r[1]; rp.sel.clear();
    $('#rp-from').value = rp.from; $('#rp-to').value = rp.to; renderReports();
  });
  const rows = reportRows();
  const keys = new Set(rows.map(r => r.key)); rp.sel.forEach(k => { if (!keys.has(k)) rp.sel.delete(k); });
  const tq = rows.reduce((a, r) => a + r.qty, 0), tp = rows.reduce((a, r) => a + r.profit, 0), ts = rows.reduce((a, r) => a + r.price * r.qty, 0);
  $('#rp-sum').innerHTML = '<div class="card stat"><div class="k">Units sold</div><div class="v">' + tq.toLocaleString() + '</div></div><div class="card stat"><div class="k">Gross sales</div><div class="v">' + peso(ts) + '</div></div><div class="card stat"><div class="k">Total profit</div><div class="v">' + peso(tp) + '</div></div>';
  const allOn = rows.length && rows.every(r => rp.sel.has(r.key));
  $('#rp-table').innerHTML = '<table><thead><tr><th><input type="checkbox" id="rp-all" ' + (allOn ? 'checked' : '') + ' aria-label="Select all"></th><th>Date</th><th>SKU</th><th>Product Sold</th><th class="num">Qty Sold</th><th class="num">Price per Product</th><th class="num">Total Profit</th><th>Sold By</th></tr></thead><tbody>' +
    (rows.length ? rows.map(r => '<tr><td><input type="checkbox" data-k="' + r.key + '" ' + (rp.sel.has(r.key) ? 'checked' : '') + '></td><td class="nowrap">' + fmtDT(r.date) + '</td><td class="nowrap">' + esc(r.sku) + '</td><td>' + esc(r.name) + '</td><td class="num">' + r.qty + '</td><td class="num">' + peso(r.price) + '</td><td class="num">' + peso(r.profit) + '</td><td>' + esc(r.staff) + '</td></tr>').join('')
      : '<tr><td colspan="8" class="empty">No sales in this range.</td></tr>') + '</tbody></table>';
  const t = $('#rp-table');
  $('#rp-all', t).onchange = e => { rows.forEach(r => e.target.checked ? rp.sel.add(r.key) : rp.sel.delete(r.key)); renderReports(); };
  $$('[data-k]', t).forEach(cb => cb.onchange = () => { cb.checked ? rp.sel.add(cb.dataset.k) : rp.sel.delete(cb.dataset.k); updDl(); });
  updDl();
}
function updDl() { const b = $('#rp-dl'); if (b) b.textContent = rp.sel.size ? '⬇ Download selected (' + rp.sel.size + ')' : '⬇ Download Excel'; }
async function downloadReport() {
  let rows = reportRows();
  if (rp.sel.size) rows = rows.filter(r => rp.sel.has(r.key));
  if (!rows.length) { toast('Nothing to download'); return; }
  const range = rp.from || rp.to ? (rp.from || '…') + ' to ' + (rp.to || '…') : 'All dates';
  const sheet = [
    [{ s: 'Butil by Salt & Pepperr — Sales Report', bold: true }],
    ['Range: ' + range + (rp.sel.size ? ' (selected rows only)' : '') + '   Generated: ' + fmtDT(new Date().toISOString())],
    [],
    ['Date', 'SKU', 'Product Sold', 'Quantity Sold', 'Price per Product', 'Total Profit', 'Sold By'].map(h => ({ s: h }))
  ];
  rows.forEach(r => sheet.push([fmtDT(r.date), r.sku, r.name, r.qty, { n: +r.price.toFixed(2) }, { n: +r.profit.toFixed(2) }, r.staff]));
  sheet.push([]);
  sheet.push([{ s: 'TOTAL' }, '', '', rows.reduce((a, r) => a + r.qty, 0), '', { n: +rows.reduce((a, r) => a + r.profit, 0).toFixed(2), bold: true }, '']);
  try {
    const bytes = XLSX_LITE.build('Sales Report', sheet, [22, 14, 28, 14, 18, 16, 20]);
    await XLSX_LITE.save(bytes, 'Butil_Sales_Report_' + todayKey() + '.xlsx');
    toast('Report ready');
  } catch (e) { console.error(e); toast('Could not save the file'); }
}

/* ======================= INIT ======================= */
document.addEventListener('DOMContentLoaded', () => {
  Store.load();
  $('#login-form').addEventListener('submit', doLogin);
  $('#show-pass').onchange = e => { $('#login-pass').type = e.target.checked ? 'text' : 'password'; };
  $('#logout-btn').onclick = async () => { if (await confirmBox('Log out?', 'You will need to sign in again.', 'Logout')) doLogout(); };
  $('#menu-btn').onclick = () => toggleNav(true);
  $('#scrim').onclick = () => toggleNav(false);

  // Android hardware back button
  try {
    const A = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.App;
    if (A && A.addListener) A.addListener('backButton', () => {
      const ov = $$('.overlay'); if (ov.length) { closeModal(ov[ov.length - 1]); return; }
      if ($('#sidenav').classList.contains('open')) { toggleNav(false); return; }
      const cartEl = $('#cart'); if (cartEl && cartEl.classList.contains('open')) { cartEl.classList.remove('open'); return; }
      if (S && rcOpen && page === 'receipts') { rcOpen = null; renderReceipts(); return; }
      if (S) { toast('Use Logout to sign out'); return; }
      A.exitApp();
    });
  } catch (e) {}
});
