#!/usr/bin/env python3
"""Import a CSV of income and expenses into one Quarterwise property or business.

Standard library only (Python 3.8+). Columns: date, type, amount, and
optionally category, description and ref. See ../README.md.

    export QUARTERWISE_API_KEY=qw_live_...
    python3 import_csv.py --source <source id> ../sample.csv
    python3 import_csv.py --source <source id> ../sample.csv --dry-run
"""
import argparse
import csv
import hashlib
import json
import os
import re
import sys
import time
import urllib.error
import urllib.request

API = "https://quarterwise.co.uk/api/v1"
BATCH = 500  # the most the API takes in one request


def to_pence(raw):
    """'£1,250.00' -> 125000. Exact: never goes through a float."""
    s = raw.strip().replace("£", "").replace(",", "")
    m = re.fullmatch(r"(\d+)(?:\.(\d{1,2}))?", s)
    if not m:
        raise ValueError(f"amount {raw!r} is not a positive number of pounds")
    pence = int(m.group(1)) * 100 + int((m.group(2) or "0").ljust(2, "0"))
    if pence < 1:
        raise ValueError("amount must be more than zero")
    return pence


def rows_to_entries(rows):
    seen = {}
    entries = []
    for n, row in enumerate(rows, start=2):  # line 1 is the header
        row = {k.strip().lower(): (v or "").strip() for k, v in row.items() if k}
        try:
            kind = row["type"].lower()
            if kind not in ("income", "expense"):
                raise ValueError("type must be income or expense")
            if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", row["date"]):
                raise ValueError("date must be YYYY-MM-DD")
            entry = {"date": row["date"], "type": kind, "amountPence": to_pence(row["amount"])}
        except (KeyError, ValueError) as e:
            sys.exit(f"Line {n}: {e}")
        if row.get("category"):
            entry["category"] = row["category"]
        if row.get("description"):
            entry["description"] = row["description"][:500]
        ref = row.get("ref")
        if not ref:
            # No id of your own: derive one from the row, so running the same
            # file twice adds nothing. Identical rows are told apart by order.
            key = "|".join([entry["date"], kind, str(entry["amountPence"]), entry.get("description", "")])
            seen[key] = seen.get(key, 0) + 1
            ref = "csv-" + hashlib.sha256(f"{key}|{seen[key]}".encode()).hexdigest()[:32]
        entry["externalRef"] = ref
        entries.append(entry)
    return entries


def post(source, key, batch):
    req = urllib.request.Request(
        f"{API}/sources/{source}/transactions",
        data=json.dumps(batch).encode(),
        method="POST",
        headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
    )
    for attempt in range(5):
        try:
            with urllib.request.urlopen(req, timeout=60) as res:
                return json.load(res)
        except urllib.error.HTTPError as e:
            body = json.loads(e.read() or b"{}")
            code = body.get("error", {}).get("code")
            if e.code == 429 and code == "rate_limited" and attempt < 4:
                time.sleep(60)  # the limit is per minute
                continue
            if e.code >= 500 and attempt < 4:
                time.sleep(2 ** attempt)
                continue
            sys.exit(f"HTTP {e.code}: {json.dumps(body, indent=2)}")
    sys.exit("Gave up after repeated retries")


def main():
    p = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    p.add_argument("csv")
    p.add_argument("--source", required=True, help="source id from GET /api/v1/sources")
    p.add_argument("--dry-run", action="store_true", help="print what would be sent, send nothing")
    args = p.parse_args()

    with open(args.csv, newline="", encoding="utf-8-sig") as f:
        entries = rows_to_entries(csv.DictReader(f))
    if not entries:
        sys.exit("No rows found")
    if args.dry_run:
        print(json.dumps(entries, indent=2))
        return

    key = os.environ.get("QUARTERWISE_API_KEY")
    if not key:
        sys.exit("Set QUARTERWISE_API_KEY first")
    created = deduplicated = 0
    for i in range(0, len(entries), BATCH):
        result = post(args.source, key, entries[i : i + BATCH])
        created += result["created"]
        deduplicated += result["deduplicated"]
    print(f"{created} added, {deduplicated} already there")


if __name__ == "__main__":
    main()
