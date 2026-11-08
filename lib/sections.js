// Config-driven section schema. Every data-entry page, CSV template, AI extraction prompt
// and edit form is generated from this file. Add a field here and it appears everywhere.
//
// field types: text | number | date | select | textarea | checkbox
// `sum` marks the money field that is totalled in the section table footer.

const YES_NO = ['Yes', 'No'];

const SECTIONS = [
  // ───────────────────────── Taxpayer ─────────────────────────
  {
    key: 'profile', group: 'Taxpayer', title: 'Taxpayer details', si: 'බදු ගෙවන්නාගේ විස්තර',
    singleton: true,
    help: 'Identity details shown on the RAMIS confirmation page and in the declaration (Part B).',
    fields: [
      { name: 'tin', label: 'Taxpayer Identification Number (TIN)', type: 'text', required: true },
      { name: 'full_name', label: 'Full name (as in RAMIS)', type: 'text', required: true },
      { name: 'nic', label: 'NIC number', type: 'text' },
      { name: 'residency', label: 'Residency status', type: 'select', options: ['Resident', 'Non-resident'], default: 'Resident',
        help: 'Resident = in Sri Lanka 183 days or more during the year.' },
      { name: 'citizen', label: 'Sri Lankan citizen', type: 'select', options: YES_NO, default: 'Yes' },
      { name: 'senior_citizen', label: 'Senior citizen (60+)', type: 'select', options: YES_NO, default: 'No' },
      { name: 'telephone', label: 'Telephone', type: 'text' },
      { name: 'mobile', label: 'Mobile', type: 'text' },
      { name: 'email', label: 'Email', type: 'text' },
      { name: 'address', label: 'Address', type: 'textarea' },
      { name: 'claim_wht', label: 'Claim AIT/WHT deducted by banks as a tax credit this year', type: 'select', options: YES_NO, default: 'Yes',
        help: 'If Yes, the WHT certificates total goes to cage 710/908 and reduces tax or creates a refund.' },
      { name: 'prepared_by_other', label: 'Return prepared by another person', type: 'select', options: YES_NO, default: 'No' },
      { name: 'preparer_name', label: 'Preparer name', type: 'text' },
      { name: 'preparer_designation', label: 'Preparer designation', type: 'text' },
      { name: 'preparer_phone', label: 'Preparer telephone / mobile', type: 'text' },
      { name: 'preparer_email', label: 'Preparer email', type: 'text' },
      { name: 'opening_net_worth', label: 'Net worth at start of year (assets − liabilities from last year\'s return)', type: 'number',
        help: 'Used only for the wealth reconciliation check. Leave blank if unknown.' },
    ],
  },

  // ───────────────────────── Income ─────────────────────────
  {
    key: 'employment', group: 'Income', title: 'Employment income', si: 'රැකියා ආදායම', schedule: 'Schedule 1',
    help: 'Salary, allowances and benefits. Attach APIT/T-10 certificates. Foreign employment paid in foreign currency and remitted through a Sri Lankan bank is flagged separately.',
    fields: [
      { name: 'type', label: 'Type', type: 'select', options: ['Primary', 'Secondary'], default: 'Primary' },
      { name: 'source', label: 'Source', type: 'select', options: ['Local', 'Foreign'], default: 'Local' },
      { name: 'employer', label: 'Employer / company name', type: 'text', required: true },
      { name: 'employer_tin', label: 'TIN of employer', type: 'text' },
      { name: 'remuneration', label: 'Remuneration (Rs.)', type: 'number', sum: true },
      { name: 'terminal_benefits', label: 'Terminal benefits (Rs.)', type: 'number' },
      { name: 'apit', label: 'APIT deducted (Rs.)', type: 'number' },
      { name: 'terminal_tax_paid', label: 'Tax paid on terminal benefits (Rs.)', type: 'number' },
      { name: 'foreign_fx', label: 'Received in foreign currency & remitted via SL bank', type: 'checkbox' },
      { name: 'notes', label: 'Notes', type: 'textarea' },
    ],
  },
  {
    key: 'business', group: 'Income', title: 'Business / freelance income', si: 'ව්‍යාපාරික / නිදහස් සේවා ආදායම', schedule: 'Schedule 2',
    help: 'One row per business activity (e.g. IT services to foreign clients via Upwork/Fiverr, local IT services). Expenses entered under "Business expenses" with the same business name are deducted automatically.',
    fields: [
      { name: 'activity_code', label: 'Activity code', type: 'text', default: '620100', help: '620100 = computer programming / IT services' },
      { name: 'nature', label: 'Nature of business', type: 'text', required: true, default: 'IT SERVICE PROVIDER' },
      { name: 'source', label: 'Source', type: 'select', options: ['Local', 'Foreign'], default: 'Local' },
      { name: 'turnover', label: 'Turnover / gross receipts (Rs.)', type: 'number', sum: true },
      { name: 'direct_expenses', label: 'Other expenses not itemised (Rs.)', type: 'number' },
      { name: 'foreign_fx', label: 'Service used abroad, paid in foreign currency & remitted via SL bank', type: 'checkbox',
        help: 'From 1 April 2025 this income is taxed at progressive rates capped at 15%. Before that it was exempt.' },
      { name: 'notes', label: 'Notes', type: 'textarea' },
    ],
  },
  {
    key: 'business_expenses', group: 'Income', title: 'Business expenses breakup', si: 'ව්‍යාපාරික වියදම් විස්තරය',
    help: 'Expenses wholly incurred to earn the business income. Keep invoices/receipts. "Business" must match the business name above.',
    fields: [
      { name: 'business', label: 'Business (nature)', type: 'text', default: 'IT SERVICE PROVIDER' },
      { name: 'category', label: 'Category', type: 'select', options: [
        'Platform / service fees (Upwork, Fiverr, PayPal)', 'Internet & telephone', 'Electricity', 'Software & subscriptions',
        'Hosting & domains', 'Computer equipment (capital allowance)', 'Office rent', 'Contractors / staff', 'Bank & FX charges',
        'Travel & transport', 'Training & books', 'Professional fees (accountant)', 'Other'] },
      { name: 'description', label: 'Description', type: 'text' },
      { name: 'date', label: 'Date', type: 'date' },
      { name: 'amount', label: 'Amount (Rs.)', type: 'number', sum: true },
    ],
  },
  {
    key: 'foreign_remittances', group: 'Income', title: 'Foreign income remittances', si: 'විදේශ ආදායම් ප්‍රේෂණ', schedule: 'Cage 210A / 406',
    help: 'Every foreign-currency receipt credited to a Sri Lankan bank (from the bank transaction history). Totals feed cage 406 (remitted amounts).',
    csv: true,
    fields: [
      { name: 'date', label: 'Date credited', type: 'date' },
      { name: 'bank', label: 'Bank', type: 'text' },
      { name: 'account_no', label: 'Account no.', type: 'text' },
      { name: 'payer', label: 'Payer / client / platform', type: 'text' },
      { name: 'currency', label: 'Currency', type: 'select', options: ['USD', 'AUD', 'GBP', 'EUR', 'NZD', 'CAD', 'AED', 'Other'], default: 'USD' },
      { name: 'fx_amount', label: 'Foreign amount', type: 'number' },
      { name: 'lkr_amount', label: 'LKR credited (Rs.)', type: 'number', sum: true },
      { name: 'category', label: 'Category', type: 'select', options: ['Business', 'Employment', 'Investment', 'Other'], default: 'Business' },
    ],
  },
  {
    key: 'investment', group: 'Income', title: 'Investment income', si: 'ආයෝජන ආදායම', schedule: 'Schedule 3',
    help: 'Interest, dividends, rent, unit-trust income and gains on sale of investment assets. Dividends that suffered a final WHT are reported in Schedule 6 instead of assessable income.',
    fields: [
      { name: 'income_type', label: 'Type of income', type: 'select', options: [
        'Interest', 'Dividend', 'Rent', 'Unit trust income', 'Gain on realization of investment assets', 'Royalty', 'Project income', 'Other'] },
      { name: 'activity_code', label: 'Activity code', type: 'text' },
      { name: 'payer', label: 'Payer / institution', type: 'text' },
      { name: 'gross_amount', label: 'Gross amount (Rs.)', type: 'number', sum: true },
      { name: 'wht', label: 'WHT / AIT deducted (Rs.)', type: 'number' },
      { name: 'final_wht', label: 'Final withholding payment (e.g. dividend WHT)', type: 'checkbox' },
      { name: 'foreign_fx', label: 'Foreign source, in FX & remitted via SL bank', type: 'checkbox' },
      { name: 'notes', label: 'Notes', type: 'textarea' },
    ],
  },
  {
    key: 'wht_certificates', group: 'Income', title: 'AIT / WHT certificates', si: 'රඳවා ගැනීමේ බදු සහතික', schedule: 'Schedule 7A',
    help: 'Advance income tax deducted on interest by banks (5% to 31.03.2025, 10% from 01.04.2025). Download the certificate list from RAMIS or bank and import as CSV.',
    csv: true,
    fields: [
      { name: 'source_type', label: 'Source / type', type: 'select', options: ['I-INTEREST', 'D-DIVIDEND', 'S-SERVICE FEE', 'R-RENT', 'O-OTHER'], default: 'I-INTEREST' },
      { name: 'agent_name', label: 'Withholding agent (bank)', type: 'text' },
      { name: 'agent_tin', label: 'TIN of withholding agent', type: 'text' },
      { name: 'certificate_no', label: 'AIT/WHT certificate no.', type: 'text' },
      { name: 'payment_date', label: 'Date of payment', type: 'date' },
      { name: 'amount_received', label: 'Amount received (Rs.)', type: 'number' },
      { name: 'wht', label: 'AIT/WHT deducted (Rs.)', type: 'number', sum: true },
    ],
  },
  {
    key: 'other_income', group: 'Income', title: 'Other income', si: 'වෙනත් ආදායම', schedule: 'Schedule 4',
    fields: [
      { name: 'type', label: 'Type of income', type: 'text', required: true },
      { name: 'amount', label: 'Gains and profits (Rs.)', type: 'number', sum: true },
      { name: 'turnover', label: 'Turnover (Rs.)', type: 'number' },
      { name: 'foreign_fx', label: 'Foreign source, in FX & remitted via SL bank', type: 'checkbox' },
      { name: 'notes', label: 'Notes', type: 'textarea' },
    ],
  },

  // ───────────────────────── Reliefs, deductions & tax paid ─────────────────────────
  {
    key: 'solar', group: 'Reliefs & tax paid', title: 'Solar panel', si: 'සූර්ය පැනල', schedule: 'Schedule 5C (cages 511–513)',
    help: 'Solar panels fixed on your premises and connected to the national grid. Deductible up to Rs. 600,000 per year; the balance carries forward. Attach the original invoice.',
    fields: [
      { name: 'invoice_date', label: 'Invoice date', type: 'date' },
      { name: 'supplier', label: 'Supplier', type: 'text' },
      { name: 'description', label: 'System (kW, panels, inverter)', type: 'text' },
      { name: 'total_cost', label: 'Total cost of acquisition (Rs.)', type: 'number', sum: true },
      { name: 'claimed_before', label: 'Already claimed in earlier years (Rs.)', type: 'number', default: 0 },
      { name: 'loan_funded', label: 'Funded by bank loan', type: 'select', options: YES_NO, default: 'No' },
    ],
  },
  {
    key: 'donations', group: 'Reliefs & tax paid', title: 'Donations / qualifying payments', si: 'පරිත්‍යාග', schedule: 'Schedule 5A',
    fields: [
      { name: 'category', label: 'Category', type: 'select', options: [
        'Approved charity', 'Government', 'Other specified institution', 'Shop for female of Samurdhi family', 'Film industry'] },
      { name: 'recipient', label: 'Recipient', type: 'text' },
      { name: 'date', label: 'Date', type: 'date' },
      { name: 'amount', label: 'Amount paid (Rs.)', type: 'number', sum: true },
    ],
  },
  {
    key: 'tax_payments', group: 'Reliefs & tax paid', title: 'Self-assessment tax payments', si: 'ගෙවූ බදු වාරික', schedule: 'Schedule 9B',
    fields: [
      { name: 'instalment', label: 'Instalment', type: 'select', options: ['1st installment', '2nd installment', '3rd installment', '4th installment', 'Final Payment'] },
      { name: 'date', label: 'Payment date', type: 'date' },
      { name: 'amount', label: 'Amount paid (Rs.)', type: 'number', sum: true },
      { name: 'reference', label: 'Payment reference', type: 'text' },
    ],
  },
  {
    key: 'other_credits', group: 'Reliefs & tax paid', title: 'Other tax credits', si: 'වෙනත් බදු බැර', schedule: 'Schedule 9',
    fields: [
      { name: 'type', label: 'Type', type: 'select', options: ['Foreign tax credit', 'CGT paid on investment assets', 'Partner\'s share of partnership tax', 'AIT from partnership', 'Other'] },
      { name: 'amount', label: 'Amount (Rs.)', type: 'number', sum: true },
      { name: 'notes', label: 'Notes', type: 'textarea' },
    ],
  },

  // ───────────────────────── Assets ─────────────────────────
  {
    key: 'bank_balances', group: 'Assets at 31 March', title: 'Bank balances', si: 'බැංකු ශේෂ', schedule: 'Assets B.ii',
    help: 'Balance of EVERY account (savings, current, FD, foreign currency) as at 31 March — from the mobile app, updated passbook, or a bank balance confirmation.',
    csv: true,
    fields: [
      { name: 'bank', label: 'Bank / financial institution', type: 'text', required: true },
      { name: 'account_no', label: 'Account no.', type: 'text' },
      { name: 'account_type', label: 'Account type', type: 'select', options: ['Savings', 'Current', 'Fixed deposit', 'Foreign currency', 'Other'] },
      { name: 'currency', label: 'Currency', type: 'text', default: 'LKR' },
      { name: 'amount_invested', label: 'Amount invested (Rs.)', type: 'number' },
      { name: 'interest', label: 'Interest (Rs.)', type: 'number' },
      { name: 'balance', label: 'Balance at 31 March (Rs.)', type: 'number', sum: true },
    ],
  },
  {
    key: 'shares', group: 'Assets at 31 March', title: 'Shares, unit trusts & securities', si: 'කොටස් සහ ආයෝජන', schedule: 'Assets B.iii',
    help: 'CSE share portfolio, CAL / unit-trust portfolio report and treasury bills/bonds as at 31 March.',
    csv: true,
    fields: [
      { name: 'portfolio', label: 'Portfolio / broker', type: 'select', options: ['CSE share portfolio', 'CAL / unit trust', 'Treasury bills / bonds', 'Other'] },
      { name: 'company', label: 'Company / fund', type: 'text', required: true },
      { name: 'quantity', label: 'No. of shares / units', type: 'number' },
      { name: 'acquisition_date', label: 'Date of acquisition', type: 'date' },
      { name: 'cost', label: 'Cost / market value if not acquired (Rs.)', type: 'number', sum: true },
      { name: 'market_value', label: 'Market value at 31 March (Rs.)', type: 'number' },
      { name: 'dividend', label: 'Net dividend income (Rs.)', type: 'number' },
    ],
  },
  {
    key: 'vehicles', group: 'Assets at 31 March', title: 'Motor vehicles', si: 'වාහන', schedule: 'Assets B.i',
    fields: [
      { name: 'model', label: 'Model / type', type: 'text', required: true },
      { name: 'reg_no', label: 'Registration number', type: 'text' },
      { name: 'acquired_on', label: 'Purchase date (or year)', type: 'text' },
      { name: 'how', label: 'Purchased or gifted', type: 'select', options: ['Purchased', 'Gifted', 'Inherited'], default: 'Purchased' },
      { name: 'gifted_by', label: 'Gifted by (if gifted)', type: 'text' },
      { name: 'value', label: 'Cost / market value (Rs.)', type: 'number', sum: true },
    ],
  },
  {
    key: 'immovable', group: 'Assets at 31 March', title: 'Land & buildings', si: 'ඉඩම් සහ ගොඩනැගිලි', schedule: 'Assets A',
    fields: [
      { name: 'situation', label: 'Situation / address of property', type: 'text', required: true },
      { name: 'deed', label: 'Deed / plan no.', type: 'text' },
      { name: 'acquired_on', label: 'Date of acquisition', type: 'date' },
      { name: 'how', label: 'Purchased or gifted', type: 'select', options: ['Purchased', 'Gifted', 'Inherited'], default: 'Purchased' },
      { name: 'cost', label: 'Cost (Rs.)', type: 'number', sum: true },
      { name: 'market_value', label: 'Market value (Rs.)', type: 'number' },
    ],
  },
  {
    key: 'gold_gems', group: 'Assets at 31 March', title: 'Gold, gems & jewellery', si: 'රත්‍රන්, මැණික් සහ ස්වර්ණාභරණ', schedule: 'Assets B.vi (cage 1021)',
    fields: [
      { name: 'description', label: 'Type / description', type: 'text', required: true },
      { name: 'quantity', label: 'Quantity / weight', type: 'text' },
      { name: 'acquired_year', label: 'Purchase year', type: 'text' },
      { name: 'how', label: 'Purchased or gifted', type: 'select', options: ['Purchased', 'Gifted', 'Inherited'], default: 'Purchased' },
      { name: 'value', label: 'Purchase amount / value (Rs.)', type: 'number', sum: true },
    ],
  },
  {
    key: 'other_assets', group: 'Assets at 31 March', title: 'Cash in hand & loans given', si: 'අතැති මුදල් සහ දුන් ණය', schedule: 'Assets B.iv–v (cages 1019–1020)',
    fields: [
      { name: 'type', label: 'Type', type: 'select', options: ['Cash in hand', 'Loan given / amount receivable'] },
      { name: 'description', label: 'Description (borrower etc.)', type: 'text' },
      { name: 'amount', label: 'Amount (Rs.)', type: 'number', sum: true },
    ],
  },
  {
    key: 'business_assets', group: 'Assets at 31 March', title: 'Business capital & current accounts', si: 'ව්‍යාපාරික ප්‍රාග්ධනය', schedule: 'Assets C',
    fields: [
      { name: 'business', label: 'Name of business', type: 'text', required: true },
      { name: 'current_balance', label: 'Current account balance (Rs.)', type: 'number' },
      { name: 'capital_balance', label: 'Capital account balance (Rs.)', type: 'number', sum: true },
    ],
  },

  // ───────────────────────── Liabilities ─────────────────────────
  {
    key: 'liabilities', group: 'Liabilities at 31 March', title: 'Loans & credit cards', si: 'ණය සහ ක්‍රෙඩිට් කාඩ්', schedule: 'Liabilities D',
    help: 'All loans, leases and credit card balances at 31 March. Use the March credit card statement for card balances.',
    fields: [
      { name: 'type', label: 'Type', type: 'select', options: ['Loan', 'Housing loan', 'Leasing', 'Credit card', 'Other'] },
      { name: 'lender', label: 'Bank / lender', type: 'text' },
      { name: 'description', label: 'Description of liability', type: 'text' },
      { name: 'security', label: 'Security on liability', type: 'text' },
      { name: 'start_date', label: 'Date of commencement', type: 'date' },
      { name: 'original_amount', label: 'Original amount (Rs.)', type: 'number' },
      { name: 'repaid', label: 'Amount repaid during the year (Rs.)', type: 'number' },
      { name: 'balance', label: 'Balance at 31 March (Rs.)', type: 'number', sum: true },
    ],
  },

  // ───────────────────────── Changes during the year ─────────────────────────
  {
    key: 'acquisitions', group: 'During the year', title: 'Gifts received & assets acquired', si: 'ලැබුණු තෑගි සහ අත්පත් කරගත් වත්කම්', schedule: 'Part 2A',
    help: 'Any gift (cash or asset) — e.g. a gift from your father — and any asset purchased during the year.',
    fields: [
      { name: 'description', label: 'Description of asset / gift', type: 'text', required: true },
      { name: 'date', label: 'Date of acquisition', type: 'date' },
      { name: 'method', label: 'Gift / exchange / purchase', type: 'select', options: ['Gift', 'Purchase', 'Exchange', 'Inheritance'], default: 'Gift' },
      { name: 'from_whom', label: 'From whom (relationship)', type: 'text' },
      { name: 'value', label: 'Cost / market value (Rs.)', type: 'number', sum: true },
    ],
  },
  {
    key: 'disposals', group: 'During the year', title: 'Assets sold or given away', si: 'විකුණූ / දුන් වත්කම්', schedule: 'Part 2B',
    fields: [
      { name: 'description', label: 'Description', type: 'text', required: true },
      { name: 'disposal_date', label: 'Date of disposal', type: 'date' },
      { name: 'proceeds', label: 'Sales proceeds (Rs.)', type: 'number', sum: true },
      { name: 'acquired_date', label: 'Date acquired', type: 'date' },
      { name: 'cost', label: 'Cost (Rs.)', type: 'number' },
    ],
  },
  {
    key: 'living_expenses', group: 'During the year', title: 'Personal & household expenses', si: 'පෞද්ගලික / ගෘහ වියදම්',
    help: 'Approximate yearly personal spending. Not entered in RAMIS, but your accountant uses it to reconcile the change in your wealth with your income.',
    fields: [
      { name: 'category', label: 'Category', type: 'select', options: [
        'Food & groceries', 'Utilities (electricity, water, gas)', 'Telephone & internet (personal)', 'Children\'s education',
        'Medical', 'Transport & fuel', 'Vehicle maintenance & insurance', 'Loan instalments (interest part)', 'Insurance premiums',
        'Clothing', 'Travel & leisure', 'Support to parents / family', 'Religious & social', 'Other'] },
      { name: 'description', label: 'Description', type: 'text' },
      { name: 'amount', label: 'Annual amount (Rs.)', type: 'number', sum: true },
    ],
  },
];

const BY_KEY = Object.fromEntries(SECTIONS.map((s) => [s.key, s]));
const GROUPS = [...new Set(SECTIONS.map((s) => s.group))];

// Coerce raw form / CSV / AI input to a clean record for a section.
function normalize(section, input = {}) {
  const out = {};
  for (const f of section.fields) {
    let v = input[f.name];
    if (f.type === 'checkbox') {
      out[f.name] = v === true || v === 'on' || v === '1' || v === 1 || String(v).toLowerCase() === 'yes' || String(v).toLowerCase() === 'true';
      continue;
    }
    if (v === undefined || v === null) v = '';
    v = String(v).trim();
    if (f.type === 'number') {
      if (v === '') { out[f.name] = ''; continue; }
      const n = Number(v.replace(/[,\s]/g, '').replace(/^Rs\.?/i, '').replace(/^\((.*)\)$/, '-$1'));
      out[f.name] = Number.isFinite(n) ? Math.round(n * 100) / 100 : '';
    } else if (f.type === 'select' && v && f.options && !f.options.includes(v)) {
      const hit = f.options.find((o) => o.toLowerCase() === v.toLowerCase() || o.toLowerCase().startsWith(v.toLowerCase()));
      out[f.name] = hit || v;
    } else {
      out[f.name] = v.slice(0, 2000);
    }
  }
  return out;
}

function validate(section, data) {
  const errors = [];
  for (const f of section.fields) {
    if (f.required && (data[f.name] === '' || data[f.name] === undefined)) errors.push(`${f.label} is required`);
  }
  return errors;
}

module.exports = { SECTIONS, BY_KEY, GROUPS, normalize, validate };
