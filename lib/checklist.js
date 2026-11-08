// The document request list an accountant typically sends, mapped to portal sections.
// An item is "done" when its section has entries or uploads, or the user marked it not applicable.

const CHECKLIST = [
  { id: 'profile', title: 'Taxpayer details (TIN, NIC, contact)', sections: ['profile'], needs: 'entries' },
  { id: 'cal', title: 'CAL / unit trust portfolio report as at 31 March', sections: ['shares'] },
  { id: 'cse', title: 'Share market (CSE) portfolio as at 31 March', sections: ['shares'] },
  { id: 'solar', title: 'Solar panel – original invoice', sections: ['solar'] },
  { id: 'foreign', title: 'Bank transaction history – foreign income', sections: ['foreign_remittances'] },
  { id: 'business', title: 'Business / freelance income and turnover', sections: ['business'] },
  { id: 'expenses', title: 'Expenses breakup (business and personal)', sections: ['business_expenses', 'living_expenses'] },
  { id: 'vehicles', title: 'Vehicle details (model, reg. no., year, amount / gifted)', sections: ['vehicles'] },
  { id: 'gift', title: 'Gifts received (e.g. from father)', sections: ['acquisitions'] },
  { id: 'gold', title: 'Gold, gems and other assets', sections: ['gold_gems', 'immovable', 'other_assets'] },
  { id: 'bank', title: 'Bank balance confirmations – all accounts at 31 March', sections: ['bank_balances'] },
  { id: 'cc', title: 'Credit card statement for March', sections: ['liabilities'] },
  { id: 'loans', title: 'Loan statements – balance at 31 March', sections: ['liabilities'] },
  { id: 'wht', title: 'AIT / WHT certificates on interest', sections: ['wht_certificates'] },
  { id: 'interest', title: 'Interest, dividend and rent income', sections: ['investment'] },
  { id: 'employment', title: 'Employment income & APIT (T-10) certificates', sections: ['employment'] },
  { id: 'payments', title: 'Self-assessment tax payments made', sections: ['tax_payments'] },
];

function status(item, counts, skipped) {
  if (skipped.includes(item.id)) return 'na';
  const has = item.sections.some((s) => (counts[s]?.entries || 0) + (item.needs === 'entries' ? 0 : counts[s]?.docs || 0) > 0);
  return has ? 'done' : 'todo';
}

module.exports = { CHECKLIST, status };
