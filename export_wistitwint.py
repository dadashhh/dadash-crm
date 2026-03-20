#!/usr/bin/env python3
"""Export ALL Twint transactions from Supabase (Wistiti Twint period)."""

import json
import os
import ssl
import urllib.request
import urllib.parse

SUPABASE_URL = os.environ.get("SUPABASE_URL", "https://lkrzjwfwhiimpnsyeuxi.supabase.co")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or os.environ.get("SUPABASE_ANON_KEY", "")

if not SUPABASE_KEY:
    print("ERROR: Set SUPABASE_SERVICE_ROLE_KEY or SUPABASE_ANON_KEY env var")
    exit(1)

DATE_FROM = "2026-03-14T16:07:00+00:00"
DATE_TO = "2026-03-20T23:59:59+00:00"

HEADERS = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
}

CTX = ssl.create_default_context()
CTX.check_hostname = False
CTX.verify_mode = ssl.CERT_NONE


def api_get(qs):
    url = f"{SUPABASE_URL}/rest/v1/transactions?{qs}"
    req = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(req, context=CTX) as resp:
        return json.loads(resp.read().decode())


def main():
    print("=== Export Twint (Wistiti) Transactions ===")
    print(f"Period: {DATE_FROM} -> {DATE_TO}\n")

    date_from = urllib.parse.quote(DATE_FROM)
    date_to = urllib.parse.quote(DATE_TO)

    # With spenders + models joins
    select = (
        "id,date,created_at,amount,currency,payment_method,product,tag,"
        "status,notes,spender_handle,spender_id,model_id,chatter_id,"
        "provider_id,net_amount,provider_fee,dada_fee,chatter_commission,margin,"
        "amount_original,currency_original,channel,validated_at,"
        "spenders(id,name,tg_user_id,handle,notes),"
        "models(id,name)"
    )

    qs = (
        f"select={urllib.parse.quote(select)}"
        f"&created_at=gte.{date_from}"
        f"&created_at=lte.{date_to}"
        f"&payment_method=eq.Twint"
        f"&status=neq.cancelled"
        f"&order=created_at.desc"
        f"&limit=1000"
    )

    try:
        rows = api_get(qs)
    except urllib.error.HTTPError as e:
        body = e.read().decode()
        print(f"Join query failed: {body}")
        # Fallback: no joins
        qs2 = (
            f"select=*"
            f"&created_at=gte.{date_from}"
            f"&created_at=lte.{date_to}"
            f"&payment_method=eq.Twint"
            f"&status=neq.cancelled"
            f"&order=created_at.desc"
            f"&limit=1000"
        )
        rows = api_get(qs2)

    if not rows:
        print("No Twint transactions found.")
        return

    # Format
    export = []
    for row in rows:
        spender = row.get("spenders") if isinstance(row.get("spenders"), dict) else {}
        model = row.get("models") if isinstance(row.get("models"), dict) else {}

        export.append({
            "transaction_id": row.get("id"),
            "date": row.get("created_at"),
            "spender_name": spender.get("name") or row.get("spender_handle"),
            "spender_tg_id": spender.get("tg_user_id"),
            "spender_notes": spender.get("notes"),
            "spender_handle": row.get("spender_handle"),
            "model_name": model.get("name"),
            "amount_eur": row.get("amount"),
            "currency": row.get("currency"),
            "amount_original": row.get("amount_original"),
            "currency_original": row.get("currency_original"),
            "product": row.get("product"),
            "payment_method": row.get("payment_method"),
            "status": row.get("status"),
            "notes": row.get("notes"),
            "net_amount": row.get("net_amount"),
            "provider_fee": row.get("provider_fee"),
            "dada_fee": row.get("dada_fee"),
            "chatter_commission": row.get("chatter_commission"),
            "margin": row.get("margin"),
            "channel": row.get("channel"),
            "validated_at": row.get("validated_at"),
            "chatter_id": row.get("chatter_id"),
        })

    # Save
    output_path = "/tmp/wistitwint_export.json"
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(export, f, indent=2, ensure_ascii=False, default=str)

    # Summary
    print(f"TOTAL TRANSACTIONS: {len(export)}")
    total = sum(r.get("amount_eur") or 0 for r in export)
    currencies = set(r.get("currency") for r in export)
    print(f"TOTAL AMOUNT: {total} ({'/'.join(c for c in currencies if c)})")
    statuses = {}
    for r in export:
        s = r.get("status", "unknown")
        statuses[s] = statuses.get(s, 0) + 1
    print(f"BY STATUS: {statuses}")
    print(f"Exported to: {output_path}\n")
    print(json.dumps(export, indent=2, ensure_ascii=False, default=str))


if __name__ == "__main__":
    main()
