#!/usr/bin/env node
// Import a CSV of income and expenses into one Quarterwise property or business.
// Node 18+, no dependencies. Columns: date, type, amount, and optionally
// category, description and ref. See ../README.md.
//
//   export QUARTERWISE_API_KEY=qw_live_...
//   node import-csv.mjs --source <source id> ../sample.csv
//   node import-csv.mjs --source <source id> ../sample.csv --dry-run

import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const API = 'https://quarterwise.co.uk/api/v1';
const BATCH = 500; // the most the API takes in one request

// Minimal CSV reader: quoted fields, doubled quotes, CRLF.
function parseCsv(text) {
  const rows = [];
  let row = [], field = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.some((f) => f !== '')) rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.some((f) => f !== '')) rows.push(row);
  return rows;
}

// '£1,250.00' -> 125000. Exact: never goes through a float.
function toPence(raw) {
  const m = raw.trim().replace(/[£,]/g, '').match(/^(\d+)(?:\.(\d{1,2}))?$/);
  if (!m) throw new Error(`amount "${raw}" is not a positive number of pounds`);
  const pence = Number(m[1]) * 100 + Number((m[2] ?? '0').padEnd(2, '0'));
  if (pence < 1) throw new Error('amount must be more than zero');
  return pence;
}

function toEntries(text) {
  const [header, ...rows] = parseCsv(text.replace(/^﻿/, ''));
  const cols = header.map((h) => h.trim().toLowerCase());
  const seen = new Map();
  return rows.map((cells, i) => {
    const row = Object.fromEntries(cols.map((c, j) => [c, (cells[j] ?? '').trim()]));
    const line = i + 2;
    const type = (row.type ?? '').toLowerCase();
    if (type !== 'income' && type !== 'expense') throw new Error(`Line ${line}: type must be income or expense`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(row.date ?? '')) throw new Error(`Line ${line}: date must be YYYY-MM-DD`);
    let amountPence;
    try { amountPence = toPence(row.amount ?? ''); } catch (e) { throw new Error(`Line ${line}: ${e.message}`); }
    const entry = { date: row.date, type, amountPence };
    if (row.category) entry.category = row.category;
    if (row.description) entry.description = row.description.slice(0, 500);
    let ref = row.ref;
    if (!ref) {
      // No id of your own: derive one from the row, so running the same file
      // twice adds nothing. Identical rows are told apart by order.
      const key = [entry.date, type, amountPence, entry.description ?? ''].join('|');
      const n = (seen.get(key) ?? 0) + 1;
      seen.set(key, n);
      ref = 'csv-' + createHash('sha256').update(`${key}|${n}`).digest('hex').slice(0, 32);
    }
    entry.externalRef = ref;
    return entry;
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function post(source, key, batch) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const res = await fetch(`${API}/sources/${source}/transactions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(batch),
    });
    const body = await res.json().catch(() => ({}));
    if (res.ok) return body;
    if (res.status === 429 && body.error?.code === 'rate_limited' && attempt < 4) { await sleep(60_000); continue; }
    if (res.status >= 500 && attempt < 4) { await sleep(2 ** attempt * 1000); continue; }
    throw new Error(`HTTP ${res.status}: ${JSON.stringify(body, null, 2)}`);
  }
}

const args = process.argv.slice(2);
const flag = (name) => { const i = args.indexOf(name); return i === -1 ? undefined : args.splice(i, 2)[1]; };
const dryRun = args.includes('--dry-run') && args.splice(args.indexOf('--dry-run'), 1);
const source = flag('--source');
const file = args[0];
if (!source || !file) { console.error('Usage: node import-csv.mjs --source <source id> <file.csv> [--dry-run]'); process.exit(1); }

try {
  const entries = toEntries(readFileSync(file, 'utf8'));
  if (!entries.length) throw new Error('No rows found');
  if (dryRun) { console.log(JSON.stringify(entries, null, 2)); process.exit(0); }
  const key = process.env.QUARTERWISE_API_KEY;
  if (!key) throw new Error('Set QUARTERWISE_API_KEY first');
  let created = 0, deduplicated = 0;
  for (let i = 0; i < entries.length; i += BATCH) {
    const r = await post(source, key, entries.slice(i, i + BATCH));
    created += r.created;
    deduplicated += r.deduplicated;
  }
  console.log(`${created} added, ${deduplicated} already there`);
} catch (e) {
  console.error(e.message);
  process.exit(1);
}
