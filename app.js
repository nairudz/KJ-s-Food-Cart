// ---------- SETTINGS YOU CAN EDIT ----------
const SOCIALS = [  // replace the links with your real ones
  { name: 'Facebook',  icon: 'fa-brands fa-facebook-f',        url: 'https://facebook.com/YOUR_PAGE' },
  { name: 'Instagram', icon: 'fa-brands fa-instagram',         url: 'https://instagram.com/YOUR_PAGE' },
  { name: 'TikTok',    icon: 'fa-brands fa-tiktok',            url: 'https://tiktok.com/@YOUR_PAGE' },
  { name: 'Messenger', icon: 'fa-brands fa-facebook-messenger',url: 'https://m.me/YOUR_PAGE' },
  { name: 'Call us',   icon: 'fa-solid fa-phone',              url: 'tel:+639000000000' }
];
const DOWNPAYMENT = 500; // downpayment shown on the QR screen
const FB_URL = (SOCIALS.find(s => s.name === 'Messenger') || {}).url; // where customers send their receipt
const CUSTOM_UNIT = 25; // price per cone for the Custom ice cream package (change it in server.js too)
const COLORS = ['#ff7eb6', '#ffd34d', '#7fe5c4', '#b99cff', '#7cc8ff'];

// Product images: public/icecream.png, cottoncandy.png, popcorn.png, taho.png, fries.png
const PRODUCTS = {
  cottoncandy: { name: 'Cotton Candy', emoji: '🍭', color: '#c9b3ff', area: 'cc', tag: 'Standard blue and pink', qtyLabel: 'Quantity Selection', max: 0,
    pk: [{ id: 'cc-100', name: '100 Pieces', price: 2500 }], fl: [] },
  popcorn: { name: 'Popcorn', emoji: '🍿', color: '#ffe27a', area: 'po', qtyLabel: 'Package', max: 3,
    pk: [{ id: 'po-100', name: '100 Paper Boxes', price: 2500 }],
    fl: [{ n: 'Classic Butter', e: '🧈' }, { n: 'Cheese', e: '🧀' }, { n: 'BBQ', e: '🍖' }, { n: 'Sweet Caramel', e: '🍯' }] },
  icecream: { name: 'Ice Cream', emoji: '🍦', color: '#ff9ccb', area: 'ic', qtyLabel: 'Quantity & Package', max: 3,
    pk: [{ id: 'ic-50', name: '50 Cones', price: 1250 }, { id: 'ic-100', name: '100 Cones', price: 2500 },
         { id: 'ic-unli', name: 'UNLI', price: 6000 }, { id: 'ic-custom', name: 'Custom', price: 0, custom: true }],
    fl: [{ n: 'Charcoal', best: 1 }, { n: 'Durian', best: 1 }, { n: 'Dragon Fruit', best: 1 },
         { n: 'Mango' }, { n: 'Avocado' }, { n: 'Cookies & Cream' }, { n: 'Ube' }] },
  taho: { name: 'Taho', emoji: '🥤', color: '#ffd0a8', area: 'ta', tag: 'Classic hot taho', qtyLabel: 'Quantity Selection', max: 0,
    pk: [{ id: 'ta-100', name: '100 Pax', price: 2500 }], fl: [] },
  fries: { name: 'Fries', emoji: '🍟', color: '#ff9f8e', area: 'fr', qtyLabel: 'Package', max: 3,
    pk: [{ id: 'fr-100', name: '100 Pax', price: 2500 }],
    fl: [{ n: 'Cheese', e: '🧀' }, { n: 'BBQ', e: '🍖' }, { n: 'Sour Cream', e: '🥛' }] }
};

// ---------- HELPERS ----------
const $ = id => document.getElementById(id);
const peso = n => '₱' + Number(n).toLocaleString();
const peso2 = n => '₱' + Number(n).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtDate = d => { const x = new Date(d + 'T00:00'); return isNaN(x) ? d : x.toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' }); };
const fmtTime = t => { const [h, m] = String(t).split(':').map(Number); return isNaN(h) ? t : ((h % 12) || 12) + ':' + String(m).padStart(2, '0') + ' ' + (h < 12 ? 'AM' : 'PM'); };
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pop = (o = {}) => window.confetti && confetti({ particleCount: 70, spread: 75, origin: { y: .7 }, colors: COLORS, zIndex: 100, ...o });

let inv = {}, cart = [], S = { key: null, pk: 0, fl: [], qty: 100 }, dateFull = false, lastOrder = null;
const ok = k => !inv[k] || (inv[k].isEnabled && inv[k].quantity > 0);

async function loadInv() {
  try { inv = {}; (await (await fetch('/api/inventory')).json()).forEach(i => inv[i.itemKey] = i); } catch (_) {}
}

function toast(msg, withCart) {
  const t = $('toast');
  t.innerHTML = esc(msg) + (withCart ? ' <button onclick="openCart()">View cart</button>' : '');
  t.classList.remove('hidden');
  clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.add('hidden'), 3500);
}

// ---------- CONFETTI RAIN ----------
if (!matchMedia('(prefers-reduced-motion: reduce)').matches) {
  setInterval(() => {
    if (document.hidden || !window.confetti) return;
    confetti({ particleCount: 3, angle: 90, spread: 40, startVelocity: 0, gravity: .5, ticks: 500, scalar: 1.1,
      origin: { x: Math.random(), y: -.05 }, colors: COLORS, zIndex: 5 });
  }, 350);
}

// ---------- MENU / SOCIALS ----------
const socHTML = SOCIALS.map(s => `<a class="soc" href="${s.url}" ${s.url.startsWith('http') ? 'target="_blank" rel="noopener noreferrer"' : ''} aria-label="${s.name}" title="${s.name}"><i class="${s.icon}"></i></a>`).join('');
$('menuSocials').innerHTML = socHTML; $('footSocials').innerHTML = socHTML;
function toggleMenu(e) {
  if (e) e.stopPropagation();
  const m = $('menu'); m.classList.toggle('hidden');
  $('burger').setAttribute('aria-expanded', !m.classList.contains('hidden'));
}
document.addEventListener('click', e => { if (!$('menu').classList.contains('hidden') && !$('menu').contains(e.target)) toggleMenu(); });

// ---------- CHOICE BOXES ----------
function renderBoxes() {
  $('boxes').innerHTML = ['cottoncandy', 'popcorn', 'icecream', 'taho', 'fries'].map(k => {
    const p = PRODUCTS[k], on = ok(k);
    return `<button class="box ${S.key === k ? 'on' : ''} ${on ? '' : 'off'}" style="--c:${p.color};grid-area:${p.area}" ${on ? '' : 'disabled'} onclick="pick('${k}')" aria-pressed="${S.key === k}">
      <span class="thumb">${p.emoji}<img src="${k}.png" alt="" onerror="this.remove()"></span>${p.name}${on ? '' : '<span class="ribbon">SOLD OUT</span>'}</button>`;
  }).join('');
}

function pick(k) {
  if (!k || S.key === k) { S.key = null; $('panel').classList.add('hidden'); return renderBoxes(); }
  S = { key: k, pk: 0, fl: [], qty: 100 };
  renderBoxes(); renderPanel();
  $('panel').classList.remove('hidden');
  $('panel').scrollIntoView({ behavior: 'smooth', block: 'start' });
  pop({ particleCount: 35, spread: 60, origin: { y: .5 } });
}

const calc = () => { const pk = PRODUCTS[S.key].pk[S.pk]; return pk.custom ? (S.qty || 0) * CUSTOM_UNIT : pk.price; };

function renderPanel() {
  const p = PRODUCTS[S.key], pk = p.pk[S.pk];
  $('panel').style.setProperty('--c', p.color);
  let fl = '';
  if (p.fl.length) {
    const chip = f => { const off = !ok(`${S.key}:${f.n}`);
      return `<button class="chip ${S.fl.includes(f.n) ? 'sel' : ''}" data-n="${esc(f.n)}" ${off ? 'disabled' : ''} onclick="togFl(this.dataset.n)">${esc(f.n)} ${f.e || ''}${off ? '<small>Sold out</small>' : ''}</button>`; };
    const best = p.fl.filter(f => f.best), rest = p.fl.filter(f => !f.best);
    fl = `<div class="fhead"><h3>Flavors</h3><span class="badge">Select up to ${p.max}</span></div>` +
      (best.length ? `<h4>★ Best sellers</h4><div class="chips">${best.map(chip).join('')}</div><h4>Basic flavors</h4><div class="chips">${rest.map(chip).join('')}</div>`
                   : `<div class="chips">${p.fl.map(chip).join('')}</div>`);
  }
  $('panel').innerHTML = `
    <button class="x" onclick="pick(null)" aria-label="Close">✕</button>
    <h2 class="ph"><span>${p.emoji}</span>${p.name}</h2>${p.tag ? `<p class="tag">${p.tag}</p>` : ''}
    <div class="card"><h3>${p.qtyLabel}</h3>
      ${p.pk.length === 1 ? `<div class="single"><b>${pk.name}</b><em>${peso(pk.price)}</em></div>`
        : `<div class="chips">${p.pk.map((k, i) => `<button class="chip ${i === S.pk ? 'sel' : ''}" onclick="selPk(${i})">${k.name}<small>${k.custom ? '100+' : peso(k.price)}</small></button>`).join('')}</div>`}
      ${pk.custom ? `<label class="qty">How many cones? <input type="number" min="100" max="5000" step="10" value="${S.qty}" oninput="setQty(this.value)"></label>` : ''}
    </div>${fl}
    <div class="pfoot"><span>Price: <b id="pPrice">${peso(calc())}</b></span><button class="btn" onclick="addToCart()">Add to Cart</button></div>`;
}
const selPk = i => { S.pk = i; renderPanel(); };
const setQty = v => { S.qty = parseInt(v, 10) || 0; $('pPrice').textContent = peso(calc()); };
function togFl(n) {
  const p = PRODUCTS[S.key], i = S.fl.indexOf(n);
  if (i > -1) S.fl.splice(i, 1);
  else if (S.fl.length >= p.max) return toast(`You can pick up to ${p.max} flavors`);
  else S.fl.push(n);
  renderPanel();
}

function addToCart() {
  const p = PRODUCTS[S.key], pk = p.pk[S.pk];
  if (p.fl.length && !S.fl.length) return toast('Pick at least one flavor first');
  if (pk.custom && S.qty < 100) return toast('Custom orders start at 100 cones');
  cart.push({ key: S.key, pkgId: pk.id, qty: S.qty, flavors: [...S.fl], price: calc(),
    name: `${p.name} (${pk.custom ? S.qty + ' Cones, Custom' : pk.name})` });
  $('cartCount').textContent = cart.length;
  pop({ particleCount: 120, spread: 100 });
  toast('Added to cart! 🎉', true);
  pick(null);
}

// ---------- CART & CHECKOUT ----------
function openCart() { renderCart(); goStep(1); $('cartModal').classList.remove('hidden'); }
function closeCart() { $('cartModal').classList.add('hidden'); }
function renderCart() {
  const total = cart.reduce((s, i) => s + i.price, 0);
  $('cartList').innerHTML = cart.length ? cart.map((i, n) => `<div class="line"><div><b>${esc(i.name)}</b>${i.flavors.length ? `<small>${esc(i.flavors.join(', '))}</small>` : ''}</div>
    <span>${peso(i.price)}</span><button class="rm" onclick="rm(${n})" aria-label="Remove">🗑</button></div>`).join('')
    : '<p class="empty">Your cart is empty. Tap a box to start your party order!</p>';
  $('cartTotal').textContent = peso(total); $('toDetails').disabled = !cart.length;
  $('cartCount').textContent = cart.length;
}
function rm(n) { cart.splice(n, 1); renderCart(); }
function goStep(n) {
  [1, 2, 3, 4].forEach(i => $('step' + i).classList.toggle('hidden', i !== n));
  document.querySelector('#cartModal .sheet').scrollTop = 0;
  if (n === 2) { const d = new Date(); $('eDate').min = new Date(d - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10); }
}

async function checkDate(v) {
  const m = $('dateMsg'), b = $('toPay');
  m.className = 'dmsg'; m.textContent = '';
  if (!v) return;
  try {
    const r = await (await fetch('/api/availability?date=' + v)).json();
    dateFull = !!r.full; b.disabled = dateFull;
    if (r.full !== undefined) {
      m.className = 'dmsg ' + (dateFull ? 'bad' : 'good');
      m.textContent = dateFull ? '🚫 ORDER FULL: this date already has 3 orders. Please order for another day.' : '✅ This date is open!';
    }
  } catch (_) { dateFull = false; b.disabled = false; } // can't check right now: stay quiet and let them continue
}

async function submitOrder(e) {
  e.preventDefault();
  if (dateFull || !cart.length) return;
  $('formErr').textContent = ''; $('toPay').disabled = true;
  const details = { customerName: $('cName').value.trim(), phone: $('cPhone').value.trim(), eventName: $('eName').value.trim(),
    eventDate: $('eDate').value, eventTime: $('eTime').value, instructions: $('eNotes').value.trim() };
  let id = '', total = cart.reduce((s, i) => s + i.price, 0);
  try {
    const res = await fetch('/api/orders', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
      ...details, items: cart.map(i => ({ pkgId: i.pkgId, qty: i.qty, flavors: i.flavors })) }) });
    const d = await res.json();
    if (d.success) { id = d.orderId; total = d.total; }
    else if (d.code === 'DATE_FULL' || d.code === 'SOLD_OUT') {
      $('formErr').textContent = d.error;
      if (d.code === 'DATE_FULL') checkDate(details.eventDate); else { await loadInv(); renderBoxes(); }
      if (!dateFull) $('toPay').disabled = false;
      return;
    }
  } catch (_) {}
  // No server reply: keep going with a local order number. The invoice is what the admin receives on Facebook.
  if (!id) id = 'ORD-' + (100000 + Math.floor(Math.random() * 900000));
  lastOrder = { id, total, ...details, issued: new Date(),
    items: cart.map(i => ({ name: i.name, flavors: [...i.flavors], price: i.price })) };
  $('orderIdTxt').textContent = id; $('payTotal').textContent = peso(total);
  $('dpAmt').textContent = peso2(Math.min(DOWNPAYMENT, total));
  goStep(3); pop();
  if (!dateFull) $('toPay').disabled = false;
}

function buildInvoice(o) {
  const dp = Math.min(DOWNPAYMENT, o.total), bal = o.total - dp;
  return `<div class="inv">
    <div class="inv-head">
      <div><h3>Kenneth Jay's Fun Food Carts</h3><p>Roxas Night Market, Davao City</p></div>
      <div class="inv-tag">NON-VAT<br>INVOICE</div>
    </div>
    <div class="inv-meta">
      <div><small>Invoice no.</small><b>${esc(o.id)}</b></div>
      <div><small>Date issued</small><b>${esc(o.issued.toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' }))}</b></div>
    </div>
    <div class="inv-sec">
      <h4>Customer</h4>
      <p><b>${esc(o.customerName)}</b><br>${esc(o.phone)}</p>
    </div>
    <div class="inv-sec">
      <h4>Event</h4>
      <p><b>${esc(o.eventName)}</b><br>${esc(fmtDate(o.eventDate))} · ${esc(fmtTime(o.eventTime))}</p>
      ${o.instructions ? `<p class="inv-notes"><small>Instructions</small><br>${esc(o.instructions)}</p>` : ''}
    </div>
    <div class="inv-sec">
      <h4>Orders</h4>
      ${o.items.map(i => `<div class="inv-line"><div><b>${esc(i.name)}</b>${i.flavors.length ? `<small>${esc(i.flavors.join(', '))}</small>` : ''}</div><span>${peso2(i.price)}</span></div>`).join('')}
    </div>
    <div class="inv-tot">
      <div><span>Total</span><b>${peso2(o.total)}</b></div>
      <div><span>Downpayment sent</span><b>− ${peso2(dp)}</b></div>
      <div class="due"><span>Balance due</span><b>${peso2(bal)}</b></div>
    </div>
    <div class="inv-sign">
      <span class="sig">Kenneth Jay</span>
      <small>Signed by Kenneth Jay</small>
    </div>
  </div>`;
}

async function confirmPaid() {
  if (!lastOrder) return;
  try { await fetch(`/api/orders/${lastOrder.id}/paid`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reference: '' }) }); } catch (_) {}
  $('invoice').innerHTML = buildInvoice(lastOrder);
  if (FB_URL) $('fbHit').href = FB_URL;
  cart = []; renderCart(); $('step2').reset(); $('dateMsg').textContent = '';
  goStep(4); pop({ particleCount: 250, spread: 140 }); setTimeout(() => pop({ particleCount: 150, angle: 60, origin: { x: 0, y: .7 } }), 300);
  setTimeout(() => pop({ particleCount: 150, angle: 120, origin: { x: 1, y: .7 } }), 300);
}

// ---------- ABOUT ----------
function openAbout() { $('aboutModal').classList.remove('hidden'); }
function closeAbout() { $('aboutModal').classList.add('hidden'); }

// ---------- START ----------
renderBoxes();
loadInv().then(renderBoxes);
setInterval(() => loadInv().then(renderBoxes), 60000);