#!/usr/bin/env node
// List every transaction on a source, following the cursor, as CSV on stdout.
//
//   export QUARTERWISE_API_KEY=qw_live_...
//   node list-transactions.mjs --source <source id> --from 2026-04-06 --to 2027-04-05 > entries.csv

const API = 'https://quarterwise.co.uk/api/v1';
const args = process.argv.slice(2);
const flag = (name) => { const i = args.indexOf(name); return i === -1 ? undefined : args[i + 1]; };
const source = flag('--source');
const key = process.env.QUARTERWISE_API_KEY;
if (!source || !key) { console.error('Set QUARTERWISE_API_KEY and pass --source <source id>'); process.exit(1); }

const csv = (v) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
console.log('date,type,amount,category,description,ref');
let cursor = null;
do {
  const q = new URLSearchParams({ limit: '200' });
  for (const [k, v] of [['from', flag('--from')], ['to', flag('--to')], ['cursor', cursor]]) if (v) q.set(k, v);
  const res = await fetch(`${API}/sources/${source}/transactions?${q}`, { headers: { Authorization: `Bearer ${key}` } });
  if (!res.ok) { console.error(`HTTP ${res.status}: ${await res.text()}`); process.exit(1); }
  const page = await res.json();
  for (const t of page.transactions) {
    const pounds = `${Math.floor(t.amountPence / 100)}.${String(t.amountPence % 100).padStart(2, '0')}`;
    console.log([t.date, t.type, pounds, t.category ?? '', t.description ?? '', t.externalRef ?? ''].map(csv).join(','));
  }
  cursor = page.nextCursor;
} while (cursor);
