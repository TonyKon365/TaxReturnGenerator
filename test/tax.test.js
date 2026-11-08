const test = require('node:test');
const assert = require('node:assert');
const { compute } = require('../lib/tax');

// Reproduces the filed 2024/2025 RAMIS summary.
test('2024/2025 return matches the filed RAMIS summary', () => {
  const r = compute('2024/2025', {
    profile: [{ tin: '103897475', residency: 'Resident', claim_wht: 'No' }],
    business: [{ nature: 'IT SERVICE PROVIDER', activity_code: '620100', turnover: 671497 }],
    investment: [{ income_type: 'Project income', activity_code: '000151', gross_amount: 326118 }],
    employment: [{ type: 'Primary', employer: 'Foreign', remuneration: 10609975, foreign_fx: true }],
    foreign_remittances: [{ lkr_amount: 10609975, category: 'Employment' }],
    wht_certificates: [{ source_type: 'I-INTEREST', amount_received: 258589.45, wht: 14055.97 }],
  });
  const c = r.cages;
  assert.equal(c[20], 671497);
  assert.equal(c[30], 326118);
  assert.equal(c[50], 997615);
  assert.equal(c[80], 997615); // personal relief limited to assessable income
  assert.equal(c[120], 0);
  assert.equal(c[170], 0);
  assert.equal(c[210], 10609975);
  assert.equal(c['406.5'], 10609975);
  assert.equal(c[711], 14055.97); // not claimed -> carried forward
});

test('2025/2026: foreign service income capped at 15%', () => {
  const r = compute('2025/2026', {
    profile: [{ residency: 'Resident' }],
    business: [{ nature: 'IT', turnover: 5000000, foreign_fx: true }],
  });
  const c = r.cages;
  assert.equal(c[50], 5000000);
  assert.equal(c[80], 1800000);
  assert.equal(c[120], 3200000);
  // 1,000,000 @6% + 2,200,000 @15% (18/24/30/36 capped)
  assert.equal(c[150], 60000 + 330000);
});

test('2025/2026: ordinary income uses full progressive rates and relief first', () => {
  const r = compute('2025/2026', {
    business: [{ nature: 'Local', turnover: 2000000 }, { nature: 'Foreign', turnover: 2000000, foreign_fx: true }],
  });
  const c = r.cages;
  assert.equal(c[120], 2200000);
  assert.equal(c['809.A.1'], 200000);
  assert.equal(c['809.B.1'], 2000000);
  assert.equal(c[150], 12000 + 48000 + 1200000 * 0.15);
});

test('expenses, rent relief, solar cap, WHT refund', () => {
  const r = compute('2025/2026', {
    business: [{ nature: 'IT SERVICE PROVIDER', turnover: 3000000 }],
    business_expenses: [{ business: 'IT SERVICE PROVIDER', amount: 200000 }],
    investment: [{ income_type: 'Rent', gross_amount: 400000 }, { income_type: 'Interest', gross_amount: 100000 }],
    solar: [{ total_cost: 1500000, claimed_before: 600000 }],
    wht_certificates: [{ source_type: 'I-INTEREST', amount_received: 100000, wht: 10000 }],
  });
  const c = r.cages;
  assert.equal(c[20], 2800000);
  assert.equal(c[60], 100000);
  assert.equal(c[70], 600000);
  assert.equal(c[513], 300000);
  assert.equal(c[120], 3300000 - 100000 - 600000 - 1800000);
  assert.equal(c[150], 800000 * 0.06);
  assert.equal(c[180], 10000);
  assert.equal(c[190], 38000);
});

test('low income -> refund of WHT', () => {
  const r = compute('2025/2026', {
    investment: [{ income_type: 'Interest', gross_amount: 500000 }],
    wht_certificates: [{ source_type: 'I-INTEREST', amount_received: 500000, wht: 50000 }],
  });
  assert.equal(r.cages[170], 0);
  assert.equal(r.cages[200], 50000);
});
