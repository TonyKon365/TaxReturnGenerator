# IRD Tax Filing Portal (Sri Lanka)

A small self-hosted web app that collects everything an accountant asks for — income, bank balances,
portfolios, vehicles, gold, gifts, loans, credit cards, solar invoice, expenses — with the supporting
images/PDFs, and produces an **Individual income tax filing summary laid out like the IRD RAMIS return**
(Parts A–D, Schedules 1–9, Statement of Assets & Liabilities) with every cage number, so you can type it
straight into <https://eservices.ird.gov.lk>.

Multi-user: each client signs in and sees only their own returns; admins see everyone's.

## Features

- **22 sections** generated from one schema file (`lib/sections.js`): taxpayer details, employment, business/freelance,
  business expenses breakup, foreign remittances (210A/406), investment income, AIT/WHT certificates, other income,
  solar panel, donations, self-assessment payments, other tax credits, bank balances, shares/CAL/unit trusts, vehicles,
  land & buildings, gold/gems/jewellery, cash & loans given, business capital, loans & credit cards, gifts received,
  disposals, and personal/household expenses.
- **Input three ways:** type values; import a CSV (template per section, headers matched by name or label,
  rows previewed before saving); or upload PDFs/images and optionally **Read with AI** (Claude) to propose rows you review.
- **Tax engine** (`lib/tax.js`) with per-year rates (`lib/rates.js`) for Y/A 2024/25 and 2025/26:
  personal relief, progressive slabs, the 15% cap on foreign-currency service/foreign-source income from 1 April 2025,
  rent relief (25%), solar relief (max Rs. 600,000/yr with carry-forward), qualifying payments, terminal benefits,
  10% CGT on investment-asset gains, final WHT, AIT/WHT credits, instalments, refund/balance payable.
- **Checks before filing:** interest declared vs WHT certificates, remittances vs foreign income, missing TIN,
  unmatched expenses, losses, and a **wealth reconciliation** (opening vs closing net worth vs income, gifts, taxes and living costs).
- **Document checklist** matching the usual accountant request list, with "not applicable" toggles.
- **Carry forward**: a new year copies taxpayer details, assets, liabilities, businesses, unused solar relief and opening net worth.
- **Outputs:** printable summary (Print → Save as PDF, A4), ZIP with data + CSV tables + all documents, JSON export/import.

## Run locally

```bash
cp .env.example .env      # set SESSION_SECRET
npm install
npm start                 # http://localhost:3000
```

The first account you register becomes **admin**. Set `ALLOW_REGISTRATION=false` afterwards if you want to create
client accounts yourself (Users → Add a client account).

## Deploy

**Docker**

```bash
cp .env.example .env   # set SESSION_SECRET, COOKIE_SECURE=true behind HTTPS
docker compose up -d --build
```

Data (SQLite DB + uploads) lives in the `portal-data` volume. **Back it up** — it contains clients' financial documents.

**Plain Node (VPS)** — Node 20+, then `npm ci --omit=dev && npm start` under pm2/systemd, behind nginx or Caddy with HTTPS.
Set `DATA_DIR` to a backed-up folder. Set nginx `client_max_body_size 100m;` for multi-file uploads.

## Security notes

Passwords are bcrypt-hashed; sessions stored in SQLite; CSRF tokens on every form; helmet headers with a strict
script CSP; login rate-limited; uploads restricted by type/size, stored outside the web root and served only to the
return's owner or an admin. Always serve over HTTPS and keep `SESSION_SECRET` private. With AI reading enabled,
uploaded documents are sent to the Anthropic API — tell your clients.

## Updating for a new tax year

Add a block to `YEARS` in `lib/rates.js` (copy the latest year and change what the Budget/Amendment Act changed).
It appears in the "new return" dropdown automatically. Add a test in `test/tax.test.js`.

## Tests

```bash
npm test                                   # tax engine unit tests (incl. reproducing a filed 2024/25 return)
npm start & npm run smoke -- http://localhost:3000   # end-to-end smoke test
```

## Assumptions to know

- For mixed income in 2025/26, reliefs are set against ordinary income first and ordinary income fills the lowest
  bands; foreign FX income above that is taxed at band rates capped at 15% (cage 809.B). RAMIS does the final
  calculation — compare its figure with the summary.
- Gains on realization of investment assets are included in investment income and taxed at 10% (cage 806); listed-share
  exemptions are not applied automatically.
- Partnership/trust income (209/214, 309/314), Schedule 6B and Schedule 10 losses are not modelled; the cages show 0.

This tool is a preparation aid, not tax advice.
