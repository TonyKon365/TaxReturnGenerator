// End-to-end smoke test against a running server: node scripts/smoke.js http://localhost:3000
const base = process.argv[2] || 'http://localhost:3000';
let cookie = '';
async function req(method, path, body, headers = {}) {
  const r = await fetch(base + path, { method, body, redirect: 'manual', headers: { cookie, ...headers } });
  const sc = r.headers.get('set-cookie'); if (sc) cookie = sc.split(';')[0];
  return r;
}
const csrfOf = async (path) => { const t = await (await req('GET', path)).text(); return t.match(/name="_csrf" value="([^"]+)"/)[1]; };
const form = (o) => new URLSearchParams(o);
(async () => {
  let csrf = await csrfOf('/register');
  let r = await req('POST', '/register', form({ _csrf: csrf, name: 'Demo User', email: `demo${Date.now()}@example.com`, password: 'password123' }), { 'content-type': 'application/x-www-form-urlencoded' });
  console.log('register', r.status, r.headers.get('location'));
  csrf = await csrfOf('/');
  r = await req('POST', '/returns', form({ _csrf: csrf, year: '2025/2026', label: 'smoke' }), { 'content-type': 'application/x-www-form-urlencoded' });
  const rid = r.headers.get('location').split('/').pop();
  console.log('return', rid);
  const add = async (section, data) => {
    const c = await csrfOf(`/returns/${rid}/s/${section}`);
    const res = await req('POST', `/returns/${rid}/s/${section}/entries`, form({ _csrf: c, ...data }), { 'content-type': 'application/x-www-form-urlencoded' });
    if (res.status !== 302) throw new Error(`${section} -> ${res.status} ${(await res.text()).slice(0, 300)}`);
  };
  await add('profile', { tin: '100000001', full_name: 'Demo Taxpayer', nic: '900000000V', residency: 'Resident', citizen: 'Yes', senior_citizen: 'No', claim_wht: 'Yes', prepared_by_other: 'No', opening_net_worth: '6,000,000' });
  await add('business', { activity_code: '620100', nature: 'IT SERVICE PROVIDER', source: 'Foreign', turnover: '9,800,000', foreign_fx: 'on' });
  await add('business', { activity_code: '620100', nature: 'LOCAL WEB DEVELOPMENT', source: 'Local', turnover: '650,000' });
  await add('business_expenses', { business: 'IT SERVICE PROVIDER', category: 'Platform / service fees (Upwork, Fiverr, PayPal)', amount: '980,000' });
  await add('business_expenses', { business: 'IT SERVICE PROVIDER', category: 'Internet & telephone', amount: '96,000' });
  await add('foreign_remittances', { date: '2025-06-30', bank: 'Sampath', payer: 'Upwork', currency: 'USD', fx_amount: '32000', lkr_amount: '9,800,000', category: 'Business' });
  await add('investment', { income_type: 'Interest', payer: 'DFCC', gross_amount: '420,000', wht: '42,000' });
  await add('solar', { invoice_date: '2025-08-10', supplier: 'SunPower Lanka', description: '5 kW on-grid', total_cost: '1,150,000', claimed_before: '0', loan_funded: 'No' });
  await add('vehicles', { model: 'Dongfeng EV', reg_no: 'CBA-1234', acquired_on: '2025', how: 'Purchased', value: '7,500,000' });
  await add('bank_balances', { bank: 'Sampath', account_no: '1204xxxx', account_type: 'Savings', balance: '3,200,000' });
  await add('gold_gems', { description: 'Gold necklace 2 sovereigns', acquired_year: '2019', how: 'Gifted', value: '480,000' });
  await add('liabilities', { type: 'Credit card', lender: 'NTB', balance: '210,000' });
  await add('acquisitions', { description: 'Cash gift', date: '2025-12-01', method: 'Gift', from_whom: 'Father', value: '500,000' });
  await add('living_expenses', { category: 'Food & groceries', amount: '1,200,000' });
  // CSV import preview -> bulk add
  const c = await csrfOf(`/returns/${rid}/s/wht_certificates`);
  const fd = new FormData();
  fd.append('file', new Blob(['Source / type,Withholding agent (bank),agent_tin,certificate_no,payment_date,amount_received,wht\nI-INTEREST,DFCC,409000088,1020,2025-05-20,"200,000.00",20000\nI-INTEREST,DFCC,409000088,1021,2025-11-20,220000,22000\n'], { type: 'text/csv' }), 'wht.csv');
  r = await req('POST', `/returns/${rid}/s/wht_certificates/csv?_csrf=${c}`, fd);
  const html = await r.text();
  const rows = html.match(/name="rows" value="([^"]+)"/)[1].replace(/&#34;/g, '"').replace(/&quot;/g, '"');
  const b = new URLSearchParams({ _csrf: c, rows });
  JSON.parse(rows).forEach((_, i) => b.append('include', String(i)));
  r = await req('POST', `/returns/${rid}/s/wht_certificates/bulk`, b, { 'content-type': 'application/x-www-form-urlencoded' });
  console.log('csv import', r.status, JSON.parse(rows).length, 'rows');
  // upload a PNG
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
  const up = new FormData(); up.append('files', new Blob([png], { type: 'image/png' }), 'solar-invoice.png'); up.append('note', 'original invoice');
  const c2 = await csrfOf(`/returns/${rid}/s/solar`);
  r = await req('POST', `/returns/${rid}/s/solar/upload?_csrf=${c2}`, up);
  console.log('upload', r.status);
  r = await req('GET', `/returns/${rid}/summary`);
  const s = await r.text();
  const cage = (n) => (s.match(new RegExp(`<td class="cage">${n}</td><td class="amt">([^<]*)<`)) || [])[1];
  console.log('summary', r.status, { 50: cage(50), 120: cage(120), 150: cage(150), 170: cage(170), 180: cage(180), 190: cage(190), 200: cage(200) });
  r = await req('GET', `/returns/${rid}/export.zip`);
  console.log('zip', r.status, (await r.arrayBuffer()).byteLength, 'bytes');
  r = await req('GET', `/returns/${rid}`);
  console.log('overview', r.status);
  console.log(`RID=${rid}`);
  console.log(`COOKIE=${cookie}`);
})().catch((e) => { console.error(e); process.exit(1); });
