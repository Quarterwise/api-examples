# Quarterwise API examples

Small, runnable examples for the [Quarterwise API](https://quarterwise.co.uk/developers/docs): getting rental and self-employment income and expenses into your books from a CSV file, a Google Sheet or your own system, and reading them back out.

Nothing here files anything with HMRC. The API writes to your records only. You review each quarter and send it yourself in the app.

| Folder | What's in it |
|---|---|
| [`curl/`](curl/examples.sh) | Every endpoint as a single curl command |
| [`python/`](python/) | `import_csv.py` and `list_transactions.py`, standard library only |
| [`node/`](node/) | The same two scripts for Node 18+, no dependencies |
| [`google-sheets/`](google-sheets/Code.gs) | An Apps Script that adds a "Send rows to Quarterwise" menu to a sheet |

## Before you start

1. You need a Pro plan. In the app, go to Account, then API access, and create a key. It starts `qw_live_`. Anyone with the key can write to your books, so keep it out of code you share.
2. Find the property or business you want to write to:

   ```sh
   export QUARTERWISE_API_KEY=qw_live_...
   curl -sS https://quarterwise.co.uk/api/v1/sources -H "Authorization: Bearer $QUARTERWISE_API_KEY"
   ```

   Each source has an `id`. The scripts take it as `--source`.

## Importing a CSV

The scripts read a file with a header row like [`sample.csv`](sample.csv):

| Column | Required | Notes |
|---|---|---|
| `date` | yes | `YYYY-MM-DD` |
| `type` | yes | `income` or `expense` |
| `amount` | yes | Pounds, positive: `1250`, `1,250.00` and `£42.50` all work |
| `category` | no | A key from `GET /api/v1/categories`, such as `periodAmount` (rent) or `repairsAndMaintenance`. Leave it empty and the entry waits in the app's review queue |
| `description` | no | Up to 500 characters |
| `ref` | no | Your own id for the row, such as an invoice or bank reference |

Check what would be sent, then send it:

```sh
python3 python/import_csv.py --source <id> sample.csv --dry-run
python3 python/import_csv.py --source <id> sample.csv
# or
node node/import-csv.mjs --source <id> sample.csv
```

Running the same file again is safe. Every entry goes with an `externalRef`: your `ref` if the row has one, otherwise a fingerprint of the row. Quarterwise returns the existing entry for a ref it has already seen instead of adding it twice. If you edit a row that has no `ref`, its fingerprint changes and it's added as a new entry, so give rows a `ref` if you expect to change them.

## Things worth knowing

- Amounts are whole pence in the API (`45000` is £450.00). The scripts convert pounds to pence without floating-point arithmetic, so £0.10 never turns into 9p.
- Up to 500 entries go in one request; the scripts batch larger files.
- Limits are 120 requests a minute per key and 5,000 entries written a day. The scripts wait and retry on the per-minute limit and stop on the daily one.
- Errors come back as `{"error": {"code": "...", "message": "..."}}`. A bad category returns `invalid_category` along with the list of valid keys.
- Properties and businesses are set up in the app. The API can't create or rename them.

The full specification is in [quarterwise/openapi](https://github.com/quarterwise/openapi).

## Support

support@quarterwise.co.uk

Licensed under MIT. Quarterwise is a trading name of Malden Ltd.
