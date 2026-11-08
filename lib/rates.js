// Tax parameters per Year of Assessment (1 April – 31 March).
// Sources: Inland Revenue Act No. 24 of 2017 and Inland Revenue (Amendment) Act No. 2 of 2025.
// To support a new year, copy the latest block, adjust, and it appears in the "new return" dropdown.
//
// slabs: [band width, rate] applied to taxable income after reliefs.
// foreignIncome:
//   'exempt'  – service/foreign-source income received in FX and remitted via a Sri Lankan bank is exempt
//   'capped'  – that income is taxed at progressive rates but at no more than foreignCapRate

const YEARS = {
  '2024/2025': {
    personalRelief: 1_200_000,
    slabs: [[500_000, 0.06], [500_000, 0.12], [500_000, 0.18], [500_000, 0.24], [500_000, 0.30], [Infinity, 0.36]],
    foreignIncome: 'exempt',
    foreignCapRate: null,
    aitOnInterest: 0.05,
    rentReliefRate: 0.25,
    solarMaxPerYear: 600_000,
    cgtRate: 0.10,
    charityCap: 75_000,
    terminalBands: [[10_000_000, 0], [10_000_000, 0.06], [Infinity, 0.12]],
    refundFastTrack: 60_000,
    filingDeadline: '2025-11-30',
  },
  '2025/2026': {
    personalRelief: 1_800_000,
    slabs: [[1_000_000, 0.06], [500_000, 0.18], [500_000, 0.24], [500_000, 0.30], [Infinity, 0.36]],
    foreignIncome: 'capped',
    foreignCapRate: 0.15,
    aitOnInterest: 0.10,
    rentReliefRate: 0.25,
    solarMaxPerYear: 600_000,
    cgtRate: 0.10,
    charityCap: 75_000,
    terminalBands: [[10_000_000, 0], [10_000_000, 0.06], [Infinity, 0.12]],
    refundFastTrack: 180_000,
    filingDeadline: '2026-11-30',
  },
};

// Default year: the one whose return is due next (Y/A ends 31 March, due 30 November).
function currentFilingYear(now = new Date()) {
  const y = now.getFullYear();
  const m = now.getMonth(); // 0 = Jan
  const end = m >= 3 ? y : y - 1; // Y/A that ended most recently on 31 March
  const key = `${end - 1}/${end}`;
  return YEARS[key] ? key : Object.keys(YEARS).at(-1);
}

function yearBounds(key) {
  const [a, b] = key.split('/').map(Number);
  return { start: `${a}-04-01`, end: `${b}-03-31`, endLabel: `31.03.${b}` };
}

module.exports = { YEARS, currentFilingYear, yearBounds, yearKeys: Object.keys(YEARS) };
