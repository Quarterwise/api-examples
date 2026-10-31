#!/bin/sh
# Each call on its own. Copy the one you need, or run the file to try them all
# in order. Needs QUARTERWISE_API_KEY and, for the last three, SOURCE_ID.
set -eu
API=https://quarterwise.co.uk/api/v1
AUTH="Authorization: Bearer $QUARTERWISE_API_KEY"

# Who the key belongs to and what it can do
curl -sS "$API/me" -H "$AUTH"

# Your properties and businesses. Copy an id into SOURCE_ID.
curl -sS "$API/sources" -H "$AUTH"

# Category keys for a UK property
curl -sS "$API/categories?sourceType=uk-property" -H "$AUTH"

: "${SOURCE_ID:?Set SOURCE_ID to an id from /sources}"

# Add one entry. Running this twice adds it once, thanks to externalRef.
curl -sS -X POST "$API/sources/$SOURCE_ID/transactions" -H "$AUTH" -H "Content-Type: application/json" -d '{
  "date": "2026-10-06",
  "type": "income",
  "amountPence": 125000,
  "category": "periodAmount",
  "description": "October rent",
  "externalRef": "rent-2026-10"
}'

# Add several at once (up to 500). No category: it waits in the review queue.
curl -sS -X POST "$API/sources/$SOURCE_ID/transactions" -H "$AUTH" -H "Content-Type: application/json" -d '[
  { "date": "2026-10-12", "type": "expense", "amountPence": 18000, "category": "repairsAndMaintenance", "description": "Boiler service", "externalRef": "inv-1042" },
  { "date": "2026-10-20", "type": "expense", "amountPence": 9600, "description": "Letting agent fee", "externalRef": "inv-1043" }
]'

# This tax year so far, 200 at a time. Pass nextCursor back as cursor for the next page.
curl -sS "$API/sources/$SOURCE_ID/transactions?from=2026-04-06&to=2027-04-05&limit=200" -H "$AUTH"
