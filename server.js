const express = require('express');
const path = require('path');
const crypto = require('crypto');

// --- Database config -------------------------------------------------------
// Windows login (default): needs msnodesqlv8 + "ODBC Driver 17 for SQL Server".
// SQL login: set DB_USER and DB_PASSWORD environment variables.
// Named instance: set DB_SERVER=DESKTOP-QEFRP98\SQLEXPRESS
const useWindowsAuth = !process.env.DB_USER;
const sql = useWindowsAuth ? require('mssql/msnodesqlv8') : require('mssql');
const SERVER = process.env.DB_SERVER || 'DESKTOP-QEFRP98';
const DB = process.env.DB_NAME || 'OnlineStore';
const config = useWindowsAuth
  ? { connectionString: `Driver={${process.env.DB_DRIVER || 'ODBC Driver 17 for SQL Server'}};Server=${SERVER};Database=${DB};Trusted_Connection=Yes;` }
  : { server: SERVER, database: DB, user: process.env.DB_USER, password: process.env.DB_PASSWORD, options: { trustServerCertificate: true } };

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '1234';
const MAX_PER_DAY = 3;

// Prices live on the server so customers can't change them in the browser.
const PKG = {
  'ic-50': ['Ice Cream', '50 Cones', 1250], 'ic-100': ['Ice Cream', '100 Cones', 2500],
  'ic-unli': ['Ice Cream', 'UNLI', 6000], 'ic-custom': ['Ice Cream', 'Custom', 25], // 25 per cone
  'cc-100': ['Cotton Candy', '100 Pieces', 2500], 'po-100': ['Popcorn', '100 Paper Boxes', 2500],
  'ta-100': ['Taho', '100 Pax', 2500], 'fr-100': ['Fries', '100 Pax', 2500]
};
const PKEY = { ic: 'icecream', cc: 'cottoncandy', po: 'popcorn', ta: 'taho', fr: 'fries' };

const poolPromise = new sql.ConnectionPool(config).connect()
  .then(p => { console.log('Connected to MS SQL:', SERVER, DB); return p; })
  .catch(e => { console.error('DB connection failed:', e.message); process.exit(1); });

const app = express();
app.use(express.json({ limit: '100kb' }));
app.use(express.static(__dirname));

// --- Root Route (Fixes "Cannot GET /") ---
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
  });

// --- Admin auth (token in memory, 8 hours) -------------------------------------
const tokens = new Map();
let fails = { n: 0, until: 0 };
const adminOnly = (req, res, next) => {
  const exp = tokens.get(req.get('x-admin-token'));
  if (exp && exp > Date.now()) return next();
  res.status(401).json({ error: 'Not authorized' });
};
app.post('/api/admin/login', (req, res) => {
  if (Date.now() < fails.until) return res.status(429).json({ success: false, error: 'Too many tries. Wait a few minutes.' });
  const given = Buffer.from(String(req.body.password || ''));
  const real = Buffer.from(ADMIN_PASSWORD);
  if (given.length === real.length && crypto.timingSafeEqual(given, real)) {
    fails = { n: 0, until: 0 };
    const t = crypto.randomBytes(24).toString('hex');
    tokens.set(t, Date.now() + 8 * 3600 * 1000);
    return res.json({ success: true, token: t });
  }
  if (++fails.n >= 5) fails = { n: 0, until: Date.now() + 5 * 60 * 1000 };
  res.status(401).json({ success: false, error: 'Wrong password' });
});

// --- Public API ----------------------------------------------------------------
app.get('/api/inventory', async (req, res) => {
  try {
    const r = await (await poolPromise).request().query('SELECT ItemKey AS itemKey, Quantity AS quantity, IsEnabled AS isEnabled FROM Inventory');
    res.json(r.recordset);
  } catch (e) { console.error(e); res.status(500).json([]); }
});

app.get('/api/availability', async (req, res) => {
  const d = String(req.query.date || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return res.status(400).json({ error: 'Bad date' });
  try {
    const r = await (await poolPromise).request().input('d', sql.VarChar(10), d)
      .query("SELECT COUNT(*) n FROM Orders WHERE EventDate = CONVERT(date,@d,23) AND Status <> 'Cancelled'");
    const count = r.recordset[0].n;
    res.json({ count, full: count >= MAX_PER_DAY });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Server error' }); }
});

app.post('/api/orders', async (req, res) => {
  const b = req.body || {};
  const str = (v, max) => String(v || '').trim().slice(0, max);
  const name = str(b.customerName, 100), phone = str(b.phone, 20), eventName = str(b.eventName, 150);
  const time = str(b.eventTime, 10), notes = str(b.instructions, 1000), date = str(b.eventDate, 10);
  if (!name || !phone || !eventName || !time || !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
      !Array.isArray(b.items) || !b.items.length || b.items.length > 20)
    return res.status(400).json({ success: false, error: 'Please complete all required details.' });

  const items = []; let total = 0;
  for (const it of b.items) {
    const pkg = PKG[it.pkgId];
    if (!pkg) return res.status(400).json({ success: false, error: 'Invalid package.' });
    let price = pkg[2], desc = `${pkg[0]} (${pkg[1]})`;
    if (it.pkgId === 'ic-custom') {
      const q = parseInt(it.qty, 10);
      if (!(q >= 100 && q <= 5000)) return res.status(400).json({ success: false, error: 'Custom orders start at 100 cones.' });
      price = q * pkg[2]; desc = `${pkg[0]} (${q} Cones, Custom)`;
    }
    const productKey = PKEY[it.pkgId.split('-')[0]];
    const flavors = (Array.isArray(it.flavors) ? it.flavors : []).slice(0, 3).map(f => str(f, 60));
    items.push({ productKey, desc, price, flavors });
    total += price;
  }

  const pool = await poolPromise;
  const tx = new sql.Transaction(pool);
  const orderId = 'ORD-' + crypto.randomInt(100000, 999999);
  try {
    await tx.begin();
    const q = () => new sql.Request(tx);
    const stop = async (status, code, error) => { await tx.rollback(); return res.status(status).json({ success: false, code, error }); };

    // 1. Daily limit (locked so two customers can't grab the last slot together)
    const c = await q().input('d', sql.VarChar(10), date)
      .query("SELECT COUNT(*) n FROM Orders WITH (UPDLOCK, HOLDLOCK) WHERE EventDate = CONVERT(date,@d,23) AND Status <> 'Cancelled'");
    if (c.recordset[0].n >= MAX_PER_DAY)
      return stop(409, 'DATE_FULL', 'Order full for this date. Please order for another day.');

    // 2. Inventory: each package uses 1 of the cart and 1 of every flavor picked
    for (const it of items) {
      for (const key of [it.productKey, ...it.flavors.map(f => `${it.productKey}:${f}`)]) {
        const r = await q().input('k', sql.NVarChar(100), key)
          .query('UPDATE Inventory SET Quantity = Quantity - 1 WHERE ItemKey = @k AND IsEnabled = 1 AND Quantity >= 1');
        if (!r.rowsAffected[0])
          return stop(409, 'SOLD_OUT', `Sorry, "${key.split(':').pop()}" is no longer available.`);
      }
    }

    // 3. Save customer, order, items
    const cust = await q().input('n', sql.NVarChar(100), name).input('p', sql.NVarChar(20), phone)
      .query('INSERT INTO Customers (FullName, PhoneNumber) OUTPUT INSERTED.CustomerID VALUES (@n, @p)');
    await q().input('id', sql.NVarChar(20), orderId).input('c', sql.Int, cust.recordset[0].CustomerID)
      .input('d', sql.VarChar(10), date).input('t', sql.Decimal(10, 2), total)
      .input('en', sql.NVarChar(150), eventName).input('et', sql.NVarChar(10), time).input('ins', sql.NVarChar(1000), notes)
      .query(`INSERT INTO Orders (OrderID, CustomerID, EventDate, Subtotal, BalanceDue, EventName, EventTime, Instructions, Status)
              VALUES (@id, @c, CONVERT(date,@d,23), @t, @t, @en, @et, @ins, 'Pending Payment')`);
    for (const it of items) {
      await q().input('id', sql.NVarChar(20), orderId).input('d', sql.NVarChar(150), it.desc)
        .input('f', sql.NVarChar(255), it.flavors.join(', ')).input('p', sql.Decimal(10, 2), it.price)
        .query('INSERT INTO OrderItems (OrderID, PackageDescription, SelectedFlavors, Price) VALUES (@id, @d, @f, @p)');
    }
    await tx.commit();
    res.json({ success: true, orderId, total });
  } catch (e) {
    try { await tx.rollback(); } catch (_) {}
    console.error('Order error:', e);
    if (!res.headersSent) res.status(500).json({ success: false, error: 'Could not save your order. Please try again.' });
  }
});

app.post('/api/orders/:id/paid', async (req, res) => {
  try {
    const r = await (await poolPromise).request()
      .input('id', sql.NVarChar(20), req.params.id).input('ref', sql.NVarChar(60), String(req.body.reference || '').slice(0, 60))
      .query("UPDATE Orders SET Status='Payment Submitted', PaymentRef=@ref WHERE OrderID=@id AND Status='Pending Payment'");
    res.json({ success: r.rowsAffected[0] > 0 });
  } catch (e) { console.error(e); res.status(500).json({ success: false }); }
});

// --- Admin API -----------------------------------------------------------------
app.get('/api/admin/inventory', adminOnly, async (req, res) => {
  const r = await (await poolPromise).request().query(
    "SELECT ItemKey AS itemKey, Label AS label, ItemType AS itemType, Quantity AS quantity, IsEnabled AS isEnabled FROM Inventory ORDER BY CASE ItemType WHEN 'product' THEN 0 ELSE 1 END, ItemKey");
  res.json(r.recordset);
});

app.put('/api/admin/inventory', adminOnly, async (req, res) => {
  const qty = parseInt(req.body.quantity, 10);
  if (!req.body.itemKey || !(qty >= 0 && qty <= 100000)) return res.status(400).json({ success: false });
  const r = await (await poolPromise).request().input('k', sql.NVarChar(100), req.body.itemKey)
    .input('q', sql.Int, qty).input('e', sql.Bit, req.body.isEnabled ? 1 : 0)
    .query('UPDATE Inventory SET Quantity=@q, IsEnabled=@e WHERE ItemKey=@k');
  res.json({ success: r.rowsAffected[0] > 0 });
});

app.get('/api/admin/orders', adminOnly, async (req, res) => {
  const pool = await poolPromise;
  const o = await pool.request().query(`SELECT o.OrderID id, c.FullName name, c.PhoneNumber phone, o.EventName eventName,
      CONVERT(varchar(10), o.EventDate, 23) eventDate, o.EventTime eventTime, o.Instructions instructions,
      o.Subtotal total, o.Status status, o.PaymentRef paymentRef
      FROM Orders o JOIN Customers c ON c.CustomerID = o.CustomerID ORDER BY o.EventDate DESC, o.CreatedAt DESC`);
  const it = await pool.request().query('SELECT OrderID id, PackageDescription pkg, SelectedFlavors flavors FROM OrderItems');
  const by = {}; it.recordset.forEach(i => (by[i.id] = by[i.id] || []).push(i));
  res.json(o.recordset.map(r => ({ ...r, items: by[r.id] || [] })));
});

app.patch('/api/admin/orders', adminOnly, async (req, res) => {
  const ok = ['Pending Payment', 'Payment Submitted', 'Confirmed', 'Cancelled'];
  if (!ok.includes(req.body.status)) return res.status(400).json({ success: false });
  const r = await (await poolPromise).request().input('id', sql.NVarChar(20), req.body.orderId)
    .input('s', sql.NVarChar(30), req.body.status).query('UPDATE Orders SET Status=@s WHERE OrderID=@id');
  res.json({ success: r.rowsAffected[0] > 0 });
});

app.listen(5000, () => console.log('Open http://localhost:5000'));