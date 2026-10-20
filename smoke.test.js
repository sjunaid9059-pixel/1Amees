/**
 * Smoke tests – run with: npm test
 * Requires server already running on PORT (default 3000)
 */

const BASE = process.env.TEST_URL || 'http://127.0.0.1:3000';

async function fetchJSON(path, opts = {}) {
  const r = await fetch(BASE + path, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      ...(opts.headers || {})
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined
  });
  const text = await r.text();
  let json;
  try { json = JSON.parse(text); } catch { json = { raw: text }; }
  return { status: r.status, ...json };
}

async function run() {
  let passed = 0, failed = 0;

  async function test(name, fn) {
    process.stdout.write(`▶️  ${name} … `);
    try {
      await fn();
      console.log('✅');
      passed++;
    } catch (e) {
      console.log('❌', e.message);
      failed++;
    }
  }

  await test('Health', async () => {
    const d = await fetchJSON('/api/health');
    if (!d.ok) throw new Error(JSON.stringify(d));
  });

  await test('Signup config', async () => {
    const d = await fetchJSON('/api/signup/config');
    if (!d.ok || !d.enabled) throw new Error(JSON.stringify(d));
  });

  await test('Frontend HTML', async () => {
    const r = await fetch(BASE + '/');
    const html = await r.text();
    if (!html.includes('Meesho Loot')) throw new Error('missing title');
  });

  let token = null;

  await test('Signup', async () => {
    const mobile = '9' + String(Date.now()).slice(-9);
    const d = await fetchJSON('/api/auth/signup', {
      method: 'POST',
      body: { mobile, name: 'Test User' }
    });
    if (!d.ok || !d.token) throw new Error(JSON.stringify(d));
    token = d.token;
  });

  await test('Bootstrap (auth)', async () => {
    const d = await fetchJSON('/api/bootstrap', {
      headers: { Authorization: 'Bearer ' + token }
    });
    if (!d.ok) throw new Error(JSON.stringify(d));
  });

  await test('Products', async () => {
    const d = await fetchJSON('/api/meesho/for-you?limit=5', {
      headers: { Authorization: 'Bearer ' + token }
    });
    if (!d.ok || !Array.isArray(d.products)) throw new Error(JSON.stringify(d));
  });

  await test('Add to cart + create order + payment QR', async () => {
    const products = await fetchJSON('/api/meesho/for-you?limit=1', {
      headers: { Authorization: 'Bearer ' + token }
    });
    const pid = products.products[0].id;
    await fetchJSON('/api/cart/add', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + token },
      body: { productId: pid, qty: 1 }
    });
    const order = await fetchJSON('/api/orders/create', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + token },
      body: {}
    });
    if (!order.ok || !order.payment || !order.payment.qrUrl) {
      throw new Error(JSON.stringify(order));
    }
    if (!order.payment.upiLink.startsWith('upi://pay')) {
      throw new Error('bad upi link');
    }
  });

  console.log('\n════════════════════════════');
  console.log(`Results: ${passed} passed, ${failed} failed`);
  console.log('════════════════════════════\n');
  process.exit(failed > 0 ? 1 : 0);
}

run().catch(e => {
  console.error(e);
  process.exit(1);
});
