#!/usr/bin/env python3
"""List every transaction on a source, following the cursor, as CSV on stdout.

    export QUARTERWISE_API_KEY=qw_live_...
    python3 list_transactions.py --source <source id> --from 2026-04-06 --to 2027-04-05 > entries.csv
"""
import argparse
import csv
import json
import os
import sys
import urllib.parse
import urllib.request

API = "https://quarterwise.co.uk/api/v1"


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--source", required=True)
    p.add_argument("--from", dest="from_")
    p.add_argument("--to")
    args = p.parse_args()
    key = os.environ.get("QUARTERWISE_API_KEY") or sys.exit("Set QUARTERWISE_API_KEY first")

    out = csv.writer(sys.stdout)
    out.writerow(["date", "type", "amount", "category", "description", "ref"])
    cursor = None
    while True:
        q = {"limit": 200, "from": args.from_, "to": args.to, "cursor": cursor}
        qs = urllib.parse.urlencode({k: v for k, v in q.items() if v})
        req = urllib.request.Request(f"{API}/sources/{args.source}/transactions?{qs}", headers={"Authorization": f"Bearer {key}"})
        with urllib.request.urlopen(req, timeout=60) as res:
            page = json.load(res)
        for t in page["transactions"]:
            pounds = f"{t['amountPence'] // 100}.{t['amountPence'] % 100:02d}"
            out.writerow([t["date"], t["type"], pounds, t["category"] or "", t["description"] or "", t["externalRef"] or ""])
        cursor = page["nextCursor"]
        if not cursor:
            break


if __name__ == "__main__":
    main()
