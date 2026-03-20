#!/usr/bin/env python3
"""Export TWINT Wistitwint transactions from Supabase via REST API."""

import json
import urllib.request
import urllib.parse

import os

SUPABASE_URL = os.environ.get("SUPABASE_URL", "https://lkrzjwfwhiimpnsyeuxi.supabase.co")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or os.environ.get("SUPABASE_ANON_KEY", "")

if not SUPABASE_KEY:
    print("ERROR: Set SUPABASE_SERVICE_ROLE_KEY or SUPABASE_ANON_KEY env var")
    print("  export SUPABASE_SERVICE_ROLE_KEY='eyJ...'")
    exit(1)

DATE_FROM = "2026-03-14T16:07:00+00:00"
DATE_TO = "2026-03-20T23:59:59+00:00"

HEADERS = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "return=representation",
}


def supabase_get(endpoint, params=None):
    """Make a GET request to Supabase REST API."""
    url = f"{SUPABASE_URL}/rest/v1/{endpoint}"
    if params:
        url += "?" + "&".join(f"{k}={urllib.parse.quote(str(v), safe='(),.*')}" for k, v in params.items())
    req = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read().decode())


def main():
    print("=== Export Wistitwint Transactions ===\n")

    # Query transactions with joins via PostgREST select syntax
    select = (
        "id,created_at,amount,description,status,"
        "spender_id,model_id,chatter_id,"
        "spenders(id,name,tg_user_id,notes),"
        "models(id,name,tg_session_account),"
        "chatters(id,name)"
    )

    params = {
        "select": select,
        "created_at": f"gte.{DATE_FROM}",
        "and": f"(created_at.lte.{DATE_TO},description.ilike.*wistitwint*,or(status.eq.completed,status.eq.pending))",
        "order": "created_at.desc",
        "limit": "1000",
    }

    try:
        rows = supabase_get("transactions", params)
    except urllib.error.HTTPError as e:
        body = e.read().decode()
        print(f"HTTP {e.code}: {body}")
        # Fallback: try without the joins to see if relationship names differ
        print("\nRetrying without joins...")
        params["select"] = "*"
        try:
            rows = supabase_get("transactions", params)
        except urllib.error.HTTPError as e2:
            body2 = e2.read().decode()
            print(f"HTTP {e2.code}: {body2}")
            # Try even simpler - just get any transactions in range
            print("\nTrying simplest query (all transactions in date range)...")
            params2 = {
                "select": "*",
                "created_at": f"gte.{DATE_FROM}",
                "order": "created_at.desc",
                "limit": "5",
            }
            try:
                sample = supabase_get("transactions", params2)
                if sample:
                    print(f"Found {len(sample)} sample rows. Columns: {list(sample[0].keys())}")
                    for r in sample:
                        print(f"  desc={r.get('description','?')!r}  status={r.get('status','?')}  date={r.get('created_at','?')}")
                else:
                    print("No transactions in date range at all.")
            except urllib.error.HTTPError as e3:
                print(f"HTTP {e3.code}: {e3.read().decode()}")
            return

    if not rows:
        print("No transactions found with status filter. Trying without status filter...")
        params2 = {
            "select": select,
            "created_at": f"gte.{DATE_FROM}",
            "and": f"(created_at.lte.{DATE_TO},description.ilike.*wistitwint*)",
            "order": "created_at.desc",
            "limit": "1000",
        }
        try:
            rows = supabase_get("transactions", params2)
        except urllib.error.HTTPError:
            # Try without joins
            params2["select"] = "*"
            rows = supabase_get("transactions", params2)

    if not rows:
        print("No wistitwint transactions found in this period.")
        return

    # Format output
    export = []
    for row in rows:
        spender = row.get("spenders") or {}
        model = row.get("models") or {}
        chatter = row.get("chatters") or {}

        export.append({
            "transaction_id": row.get("id"),
            "date": row.get("created_at"),
            "spender_name": spender.get("name") if isinstance(spender, dict) else None,
            "spender_tg_id": spender.get("tg_user_id") if isinstance(spender, dict) else None,
            "spender_notes": spender.get("notes") if isinstance(spender, dict) else None,
            "model_name": model.get("name") if isinstance(model, dict) else None,
            "amount_eur": row.get("amount"),
            "description": row.get("description"),
            "status": row.get("status"),
            "chatter_assigned": chatter.get("name") if isinstance(chatter, dict) else None,
        })

    # Save to file
    output_path = "/tmp/wistitwint_export.json"
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(export, f, indent=2, ensure_ascii=False, default=str)

    # Print results
    print(f"TOTAL TRANSACTIONS: {len(export)}")
    print(f"Exported to: {output_path}\n")
    print(json.dumps(export, indent=2, ensure_ascii=False, default=str))


if __name__ == "__main__":
    main()
