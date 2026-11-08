// Tax engine: turns the entries of a return into RAMIS cage values.
// Pure function — no DB access — so it is easy to unit test.

const { YEARS, yearBounds } = require('./rates');

const n = (v) => {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
};
const r2 = (x) => Math.round(x * 100) / 100;
const sum = (rows, f) => r2(rows.reduce((a, row) => a + n(typeof f === 'function' ? f(row) : row[f]), 0));

// Apply progressive slabs to two stacked slices of taxable income.
// The normal slice fills the lowest bands first; the foreign slice sits on top and its rate is capped.
function progressive(slabs, normalSlice, foreignSlice, cap) {
  let normalTax = 0;
  let foreignTax = 0;
  const bands = [];
  let lower = 0;
  for (const [width, rate] of slabs) {
    const upper = lower + width;
    const nPart = Math.max(0, Math.min(upper, normalSlice) - Math.max(lower, 0));
    const fStart = normalSlice;
    const fEnd = normalSlice + foreignSlice;
    const fPart = Math.max(0, Math.min(upper, fEnd) - Math.max(lower, fStart));
    const fRate = cap == null ? rate : Math.min(rate, cap);
    if (nPart || fPart) bands.push({ from: lower, to: upper, rate, normal: r2(nPart), foreign: r2(fPart), foreignRate: fRate, tax: r2(nPart * rate + fPart * fRate) });
    normalTax += nPart * rate;
    foreignTax += fPart * fRate;
    lower = upper;
    if (lower >= normalSlice + foreignSlice) break;
  }
  return { normalTax: r2(normalTax), foreignTax: r2(foreignTax), bands };
}

function banded(bands, amount) {
  let lower = 0;
  const parts = [];
  for (const [width, rate] of bands) {
    const part = Math.max(0, Math.min(lower + width, amount) - lower);
    parts.push({ income: r2(part), rate, tax: r2(part * rate) });
    lower += width;
  }
  return parts;
}

function compute(year, bySection) {
  const R = YEARS[year];
  if (!R) throw new Error(`No tax rates configured for ${year}`);
  const S = (k) => bySection[k] || [];
  const profile = (S('profile')[0] || {});
  const resident = (profile.residency || 'Resident') === 'Resident';
  const citizen = (profile.citizen || 'Yes') === 'Yes';
  const foreignExempt = R.foreignIncome === 'exempt';
  const c = {}; // cages
  const notes = [];
  const warnings = [];

  // ── Schedule 1: employment ──
  const emp = S('employment');
  const empTaxable = emp.filter((e) => !(foreignExempt && e.foreign_fx));
  const empExempt = emp.filter((e) => foreignExempt && e.foreign_fx);
  c[105] = sum(empTaxable, 'remuneration');
  c[110] = sum(empTaxable, 'terminal_benefits');
  c[111] = r2(c[105] + c[110]);
  c[115] = sum(empExempt, (e) => n(e.remuneration) + n(e.terminal_benefits));
  const empForeign = sum(empTaxable.filter((e) => e.foreign_fx), 'remuneration');

  // ── Schedule 2: business ──
  const expenses = S('business_expenses');
  const bizRows = S('business').map((b) => {
    const key = (b.nature || '').trim().toLowerCase();
    const linked = expenses.filter((x) => (x.business || '').trim().toLowerCase() === key);
    const exp = r2(sum(linked, 'amount') + n(b.direct_expenses));
    return { ...b, expenses_total: exp, profit: r2(n(b.turnover) - exp) };
  });
  const bizNames = new Set(bizRows.map((b) => (b.nature || '').trim().toLowerCase()));
  const orphanExp = expenses.filter((x) => !bizNames.has((x.business || '').trim().toLowerCase()));
  if (orphanExp.length) {
    if (bizRows.length === 1) {
      const extra = sum(orphanExp, 'amount');
      bizRows[0].expenses_total = r2(bizRows[0].expenses_total + extra);
      bizRows[0].profit = r2(bizRows[0].profit - extra);
      notes.push(`Business expenses of Rs. ${fmt(extra)} with a non-matching business name were applied to "${bizRows[0].nature}".`);
    } else {
      warnings.push(`Rs. ${fmt(sum(orphanExp, 'amount'))} of business expenses do not match any business name and were not deducted.`);
    }
  }
  const bizTaxable = bizRows.filter((b) => !(foreignExempt && b.foreign_fx));
  const bizExempt = bizRows.filter((b) => foreignExempt && b.foreign_fx);
  c[204] = sum(bizTaxable, 'profit');
  c['204A'] = sum(bizTaxable, 'turnover');
  c[209] = 0; c[214] = 0;
  c[215] = r2(c[204] + c[209] + c[214]);
  c[216] = sum(bizExempt, 'profit');
  const bizForeign = sum(bizTaxable.filter((b) => b.foreign_fx), 'profit');
  for (const b of bizRows) if (b.profit < 0) warnings.push(`Business "${b.nature}" shows a loss of Rs. ${fmt(-b.profit)}. Losses go in Schedule 10 — check with your accountant.`);

  // ── Schedule 3: investment ──
  const inv = S('investment');
  const invFinal = inv.filter((i) => i.final_wht);
  const invNonFinal = inv.filter((i) => !i.final_wht);
  const invTaxable = invNonFinal.filter((i) => !(foreignExempt && i.foreign_fx));
  const invExempt = invNonFinal.filter((i) => foreignExempt && i.foreign_fx);
  c[304] = sum(invTaxable, 'gross_amount');
  c[309] = 0; c[314] = 0;
  c[315] = r2(c[304] + c[309] + c[314]);
  const rentIncome = sum(invTaxable.filter((i) => i.income_type === 'Rent'), 'gross_amount');
  c[316] = resident ? r2(rentIncome * R.rentReliefRate) : 0;
  c[317] = sum(invExempt, 'gross_amount');
  const gains = sum(invTaxable.filter((i) => i.income_type === 'Gain on realization of investment assets'), 'gross_amount');
  const invForeign = sum(invTaxable.filter((i) => i.foreign_fx && i.income_type !== 'Gain on realization of investment assets'), 'gross_amount');

  // ── Schedule 4: other ──
  const oth = S('other_income');
  const othTaxable = oth.filter((o) => !(foreignExempt && o.foreign_fx));
  c[403] = sum(othTaxable, 'amount');
  c['403A'] = sum(othTaxable, (o) => n(o.turnover) || n(o.amount));
  const othExempt = sum(oth.filter((o) => foreignExempt && o.foreign_fx), 'amount');
  const othForeign = sum(othTaxable.filter((o) => o.foreign_fx), 'amount');

  // ── Part A ──
  c[10] = c[111]; c[20] = c[215]; c[30] = c[315]; c[40] = c[403];
  c[50] = r2(c[10] + c[20] + c[30] + c[40]);

  // ── Schedule 5C: solar ──
  const solar = S('solar');
  c[511] = sum(solar, 'total_cost');
  const solarRemaining = Math.max(0, r2(c[511] - sum(solar, 'claimed_before')));
  // ── Part B ──
  c[60] = c[316];
  let room = Math.max(0, c[50] - c[60]);
  c[512] = resident ? r2(Math.min(R.solarMaxPerYear, solarRemaining, room)) : 0;
  c[513] = r2(solarRemaining - c[512]);
  c[70] = c[512];
  room = Math.max(0, room - c[70]);
  c[80] = resident || citizen ? r2(Math.min(R.personalRelief, room)) : 0;
  c[90] = r2(c[60] + c[70] + c[80]);
  if (!resident && !citizen) notes.push('Non-resident non-citizen: no personal relief.');

  // ── Schedule 5A: qualifying payments ──
  const don = S('donations');
  const dsum = (cat) => sum(don.filter((d) => d.category === cat), 'amount');
  const preQp = Math.max(0, c[50] - c[90]);
  c['502.1'] = dsum('Approved charity');
  c['503.1'] = r2(Math.min(c['502.1'], R.charityCap, preQp / 3));
  c['502.2'] = dsum('Government'); c['503.2'] = c['502.2'];
  c['502.3'] = dsum('Other specified institution'); c['503.3'] = c['502.3'];
  c['502.4'] = dsum('Shop for female of Samurdhi family'); c['503.4'] = c['502.4'];
  c['502.5'] = dsum('Film industry'); c['503.5'] = c['502.5'];
  c[504] = r2(c['503.1'] + c['503.2'] + c['503.3'] + c['503.4'] + c['503.5']);
  c[510] = c[504];
  c[100] = r2(Math.min(c[510], preQp));
  // Part B total (cage 110 on the return) is stored as '110B' because Schedule 1 also uses cage 110.
  c['110B'] = r2(c[90] + c[100]);
  c[120] = r2(Math.max(0, c[50] - c['110B']));

  // ── Schedule 8: tax calculation ──
  c[801] = c[120];
  const terminal = Math.min(c[110], c[120]);
  c[802] = r2(terminal);
  const tb = banded(R.terminalBands, terminal);
  c['803a.1'] = tb[0].income; c['803a.3'] = tb[0].tax;
  c['803b.1'] = tb[1].income; c['803b.3'] = tb[1].tax;
  c['803c.1'] = tb[2].income; c['803c.3'] = tb[2].tax;
  c[805] = r2(tb.reduce((a, p) => a + p.tax, 0));
  const gainTaxable = Math.min(gains, Math.max(0, c[120] - terminal));
  c['806.1'] = r2(gainTaxable); c['806.3'] = r2(gainTaxable * R.cgtRate);
  c['807.3'] = 0;
  c['808.3'] = 0;

  const balance = Math.max(0, c[120] - terminal - gainTaxable);
  const foreignIncome = foreignExempt ? 0 : r2(empForeign + bizForeign + invForeign + othForeign);
  // Reliefs are absorbed by ordinary income first, so the 15%-capped foreign slice is as large as possible.
  const foreignSlice = r2(Math.min(balance, foreignIncome));
  const normalSlice = r2(balance - foreignSlice);
  const prog = progressive(R.slabs, normalSlice, foreignSlice, R.foreignCapRate);
  c['809.A.1'] = normalSlice; c['809.A.3'] = prog.normalTax;
  c['809.B.1'] = foreignSlice; c['809.B.3'] = prog.foreignTax;
  c[810] = r2(c['808.3'] + c['809.A.3'] + c['809.B.3']);

  // ── Schedule 6: final withholding payments ──
  c[605] = sum(invFinal, 'wht');
  c[612] = 0; c[614] = 0;
  c[811] = c[614];

  // ── Part C ──
  c[130] = c[805];
  c[140] = r2(c['806.3'] + c['807.3']);
  c[150] = c[810];
  c[160] = c[811];
  c[170] = r2(c[130] + c[140] + c[150] + c[160]);

  // ── Schedule 7A: AIT/WHT ──
  const wht = S('wht_certificates');
  c[706] = sum(wht, 'wht');
  c[707] = c[706];
  c[708] = 0;
  c[709] = r2(c[707] + c[708]);
  const claim = (profile.claim_wht || 'Yes') === 'Yes';
  c[710] = claim ? c[709] : 0;
  c[711] = r2(c[709] - c[710]);

  // ── Schedule 9B ──
  const pay = S('tax_payments');
  const inst = (label) => pay.filter((p) => p.instalment === label);
  const instRows = ['1st installment', '2nd installment', '3rd installment', '4th installment', 'Final Payment'].map((label, i) => ({
    label, cage: 927 + i, amount: sum(inst(label), 'amount'), date: inst(label).map((p) => p.date).filter(Boolean).join(', '),
  }));
  c[932] = sum(pay, 'amount');
  c[933] = 0;
  c[934] = r2(c[932] + c[933]);

  // ── Schedule 9: tax credits ──
  const oc = S('other_credits');
  const ocs = (t) => sum(oc.filter((x) => x.type === t), 'amount');
  c[901] = ocs('Foreign tax credit');
  c['903A'] = sum(emp.filter((e) => e.type !== 'Secondary'), 'apit');
  c['904A'] = sum(emp.filter((e) => e.type === 'Secondary'), 'apit');
  c[905] = sum(emp, 'terminal_tax_paid');
  c[906] = ocs("Partner's share of partnership tax");
  c[907] = ocs('AIT from partnership');
  c[908] = c[710];
  c[909] = ocs('CGT paid on investment assets');
  c[910] = 0;
  c[911] = c[934];
  c[912] = r2(c[901] + c['903A'] + c['904A'] + c[905] + c[906] + c[907] + c[908] + c[909] + c[910] + c[911] + ocs('Other'));
  c[180] = c[912];
  c[190] = c[170] > c[180] ? r2(c[170] - c[180]) : 0;
  c[200] = c[170] < c[180] ? r2(c[180] - c[170]) : 0;

  // ── Part D / 210A: exempt & remitted ──
  c[210] = r2(c[115] + c[216] + c[317] + othExempt);
  const rem = S('foreign_remittances');
  const remBy = (cat) => sum(rem.filter((x) => (x.category || 'Business') === cat), 'lkr_amount');
  c['406.1'] = remBy('Employment'); c['406.2'] = remBy('Business'); c['406.3'] = remBy('Investment'); c['406.4'] = remBy('Other');
  c['406.5'] = r2(c['406.1'] + c['406.2'] + c['406.3'] + c['406.4']);
  c['210A'] = c['406.5'];
  const fxEmp = emp.filter((e) => e.foreign_fx), fxBiz = bizRows.filter((b) => b.foreign_fx);
  const fxInv = invNonFinal.filter((i) => i.foreign_fx), fxOth = oth.filter((o) => o.foreign_fx);
  c['404.1'] = sum(fxEmp, 'remuneration'); c['404.2'] = sum(fxBiz, 'turnover'); c['404.3'] = sum(fxInv, 'gross_amount'); c['404.4'] = sum(fxOth, (o) => n(o.turnover) || n(o.amount));
  c['404.5'] = r2(c['404.1'] + c['404.2'] + c['404.3'] + c['404.4']);
  c['405.1'] = c['404.1']; c['405.2'] = sum(fxBiz, 'profit'); c['405.3'] = c['404.3']; c['405.4'] = sum(fxOth, 'amount');
  c['405.5'] = r2(c['405.1'] + c['405.2'] + c['405.3'] + c['405.4']);

  // ── Statement of assets & liabilities ──
  const A = {
    immovable: sum(S('immovable'), 'cost'),
    vehicles: sum(S('vehicles'), 'value'),
    bank: sum(S('bank_balances'), 'balance'),
    shares: sum(S('shares'), 'cost'),
    cash: sum(S('other_assets').filter((x) => x.type === 'Cash in hand'), 'amount'),
    loansGiven: sum(S('other_assets').filter((x) => x.type !== 'Cash in hand'), 'amount'),
    gold: sum(S('gold_gems'), 'value'),
    business: sum(S('business_assets'), (b) => n(b.capital_balance) + n(b.current_balance)),
  };
  A.total = r2(Object.values(A).reduce((a, b) => a + b, 0));
  c[1019] = A.cash; c[1020] = A.loansGiven; c[1021] = A.gold;
  const L = { total: sum(S('liabilities'), 'balance'), repaid: sum(S('liabilities'), 'repaid') };

  // ── Wealth reconciliation (accountant's sanity check, not part of RAMIS) ──
  const netWorth = r2(A.total - L.total);
  const opening = profile.opening_net_worth === '' || profile.opening_net_worth === undefined ? null : n(profile.opening_net_worth);
  const giftsIn = sum(S('acquisitions').filter((x) => ['Gift', 'Inheritance'].includes(x.method)), 'value');
  const cashIncome = r2(c[50] + c[210] + sum(invFinal, 'gross_amount') - sum(invFinal, 'wht') - gains);
  const taxPaid = r2(c[706] + c['903A'] + c['904A'] + c[905] + c[932]);
  const living = sum(S('living_expenses'), 'amount');
  const disposalGain = r2(sum(S('disposals'), 'proceeds') - sum(S('disposals'), 'cost'));
  const recon = opening == null ? null : (() => {
    const explained = r2(cashIncome + giftsIn + gains + disposalGain - taxPaid - living);
    const actual = r2(netWorth - opening);
    return { opening, closing: netWorth, actual, cashIncome, giftsIn, gains, disposalGain, taxPaid, living, explained, difference: r2(actual - explained) };
  })();
  if (recon && Math.abs(recon.difference) > Math.max(100_000, Math.abs(recon.actual) * 0.1)) {
    warnings.push(`Wealth reconciliation: net worth changed by Rs. ${fmt(recon.actual)} but income − expenses explains Rs. ${fmt(recon.explained)} (difference Rs. ${fmt(recon.difference)}). Check living expenses, gifts and missing assets.`);
  }

  // ── Cross-checks ──
  const interestDeclared = sum(invNonFinal.filter((i) => i.income_type === 'Interest'), 'gross_amount');
  const interestCerts = sum(wht.filter((w) => (w.source_type || '').startsWith('I')), 'amount_received');
  if (interestCerts && Math.abs(interestDeclared - interestCerts) > 1) {
    warnings.push(`Interest income declared (Rs. ${fmt(interestDeclared)}) differs from interest on WHT certificates (Rs. ${fmt(interestCerts)}). Interest without WHT (e.g. under self-declaration) is fine; otherwise add the missing interest.`);
  }
  const fxDeclared = c['404.5'];
  if (c['406.5'] && Math.abs(fxDeclared - c['406.5']) > Math.max(1000, c['406.5'] * 0.02)) {
    warnings.push(`Foreign remittances in bank (Rs. ${fmt(c['406.5'])}) differ from foreign income flagged on income entries (Rs. ${fmt(fxDeclared)}).`);
  }
  if (c['406.5'] && !fxDeclared) warnings.push('Foreign remittances recorded but no income entry is marked "foreign currency & remitted". Add the foreign business/employment income.');
  if (!profile.tin) warnings.push('TIN is missing in Taxpayer details.');
  if (c[200] > 0 && c[200] <= R.refundFastTrack) notes.push(`Refund of Rs. ${fmt(c[200])} is within the Rs. ${fmt(R.refundFastTrack)} limit that IRD processes before a tax audit.`);
  if (c[200] > 0 && !claim) notes.push('AIT/WHT is not being claimed (Taxpayer details); it is carried forward in cage 711.');
  if (!foreignExempt && foreignIncome > 0) notes.push(`Foreign currency income of Rs. ${fmt(foreignIncome)} is taxable from 1 April 2025 at progressive rates capped at ${R.foreignCapRate * 100}% (shown in 809.B). In earlier years it was exempt.`);
  if (foreignExempt && c[210] > 0) notes.push('Foreign currency income remitted through a Sri Lankan bank is exempt for this year and shown in Part D.');
  if (c[513] > 0) notes.push(`Solar relief balance of Rs. ${fmt(c[513])} carries forward to next year.`);
  if (c[110] > 0) notes.push('Terminal benefits are taxed using the 0% / 6% / 12% bands — verify with your T-13 certificate.');
  if (profile.senior_citizen === 'Yes') notes.push('Senior citizen: check whether any senior-citizen interest relief applies for this year.');

  return {
    year, rates: R, bounds: yearBounds(year), cages: c, profile, resident,
    bizRows, instRows, assets: A, liabilities: L, netWorth, recon, progressive: prog,
    foreignIncome, gains, rentIncome,
    notes: notes.filter(Boolean), warnings,
  };
}

function fmt(x) {
  return n(x).toLocaleString('en-LK', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

module.exports = { compute, fmt, progressive };
