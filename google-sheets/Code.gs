/**
 * Send rows from a Google Sheet to one Quarterwise property or business.
 *
 * Sheet layout, header in row 1:
 *   date | type | amount | category | description | ref
 * date as a date cell or YYYY-MM-DD, type income or expense, amount in pounds.
 * category and ref are optional. See README.md.
 *
 * Setup: Extensions > Apps Script, paste this file, then Project Settings >
 * Script properties: QUARTERWISE_API_KEY and QUARTERWISE_SOURCE_ID.
 * Reload the sheet and use the Quarterwise menu.
 */
const API = 'https://quarterwise.co.uk/api/v1';

function onOpen() {
  SpreadsheetApp.getUi().createMenu('Quarterwise').addItem('Send rows to Quarterwise', 'sendRows').addToUi();
}

function sendRows() {
  const props = PropertiesService.getScriptProperties();
  const key = props.getProperty('QUARTERWISE_API_KEY');
  const source = props.getProperty('QUARTERWISE_SOURCE_ID');
  const ui = SpreadsheetApp.getUi();
  if (!key || !source) return ui.alert('Add QUARTERWISE_API_KEY and QUARTERWISE_SOURCE_ID under Project Settings, Script properties.');

  const sheet = SpreadsheetApp.getActiveSheet();
  const [header, ...rows] = sheet.getDataRange().getValues();
  const col = Object.fromEntries(header.map((h, i) => [String(h).trim().toLowerCase(), i]));
  const tz = Session.getScriptTimeZone();
  const seen = {};
  const entries = [];
  rows.forEach((r, i) => {
    if (r.every((v) => v === '')) return;
    const line = i + 2;
    const raw = r[col.date];
    const date = raw instanceof Date ? Utilities.formatDate(raw, tz, 'yyyy-MM-dd') : String(raw).trim();
    const type = String(r[col.type]).trim().toLowerCase();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('Row ' + line + ': date must be a date or YYYY-MM-DD');
    if (type !== 'income' && type !== 'expense') throw new Error('Row ' + line + ': type must be income or expense');
    const amountPence = toPence(r[col.amount], line);
    const entry = { date: date, type: type, amountPence: amountPence };
    const category = col.category === undefined ? '' : String(r[col.category]).trim();
    const description = col.description === undefined ? '' : String(r[col.description]).trim();
    if (category) entry.category = category;
    if (description) entry.description = description.slice(0, 500);
    let ref = col.ref === undefined ? '' : String(r[col.ref]).trim();
    if (!ref) {
      // Derived from the row, so sending the sheet again adds nothing new.
      const k = [date, type, amountPence, description].join('|');
      seen[k] = (seen[k] || 0) + 1;
      const digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, k + '|' + seen[k]);
      ref = 'sheet-' + digest.map((b) => ((b + 256) % 256).toString(16).padStart(2, '0')).join('').slice(0, 32);
    }
    entry.externalRef = ref;
    entries.push(entry);
  });
  if (!entries.length) return ui.alert('No rows to send.');

  let created = 0, deduplicated = 0;
  for (let i = 0; i < entries.length; i += 500) {
    const res = UrlFetchApp.fetch(API + '/sources/' + source + '/transactions', {
      method: 'post',
      contentType: 'application/json',
      headers: { Authorization: 'Bearer ' + key },
      payload: JSON.stringify(entries.slice(i, i + 500)),
      muteHttpExceptions: true,
    });
    const body = JSON.parse(res.getContentText() || '{}');
    if (res.getResponseCode() >= 300) return ui.alert('Quarterwise said ' + res.getResponseCode() + ': ' + ((body.error && body.error.message) || res.getContentText()));
    created += body.created;
    deduplicated += body.deduplicated;
  }
  ui.alert(created + ' added, ' + deduplicated + ' already there.');
}

// 1250, "1,250.00" or "£42.50" to pence, without floating-point error.
function toPence(v, line) {
  const s = typeof v === 'number' ? v.toFixed(2) : String(v).trim().replace(/[£,]/g, '');
  const m = s.match(/^(\d+)(?:\.(\d{1,2}))?$/);
  if (!m) throw new Error('Row ' + line + ': amount must be a positive number of pounds');
  const pence = Number(m[1]) * 100 + Number((m[2] || '0').padEnd(2, '0'));
  if (pence < 1) throw new Error('Row ' + line + ': amount must be more than zero');
  return pence;
}
