"""Apply BukkaPay's Supabase Auth settings through the Management API:
redirect URLs (Site URL + allow list) and branded templates for every auth
email Supabase sends.

    python scripts/supabase_auth_config.py            # show what would change
    python scripts/supabase_auth_config.py --apply    # apply it

Needs a Supabase personal access token (Dashboard → Account → Access Tokens)
in SUPABASE_ACCESS_TOKEN, or in the file named by SUPABASE_ACCESS_TOKEN_FILE.
The token is never printed.
"""

from __future__ import annotations

import json
import os
import sys
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.integrations.email_brand import supabase_templates  # noqa: E402

PROJECT_REF = os.environ.get("SUPABASE_PROJECT_REF", "jvsfdmoseeztjlfibvmm")
API = f"https://api.supabase.com/v1/projects/{PROJECT_REF}/config/auth"

SITE_URL = "https://app.bukkapay.com"
REDIRECTS = [
    "https://app.bukkapay.com/**",
    "https://merchant.bukkapay.com/**",
    "https://admin.bukkapay.com/**",
    "https://www.bukkapay.com/**",
    "https://bukkapay.com/**",
    "bukkapay://**",
    "http://localhost:8081/**",
    "http://localhost:3001/**",
]


def _token() -> str:
    tok = os.environ.get("SUPABASE_ACCESS_TOKEN", "").strip()
    if not tok and os.environ.get("SUPABASE_ACCESS_TOKEN_FILE"):
        tok = Path(os.environ["SUPABASE_ACCESS_TOKEN_FILE"]).read_text(encoding="utf-8").strip()
    import re

    m = re.search(r"sbp_[A-Za-z0-9]+", tok)  # tolerate extra words around the token
    if not m:
        sys.exit("No Supabase access token (sbp_...) found in SUPABASE_ACCESS_TOKEN(_FILE)")
    return m.group(0)


def _call(method: str, body: dict | None = None) -> dict:
    req = urllib.request.Request(API, method=method, data=json.dumps(body).encode() if body else None, headers={
        "Authorization": f"Bearer {_token()}", "Content-Type": "application/json",
        "User-Agent": "bukkapay-config-script",
    })
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return json.loads(r.read() or b"{}")
    except urllib.error.HTTPError as e:
        sys.exit(f"Supabase API {method} failed: HTTP {e.code} {e.read()[:300].decode(errors='replace')}")


def desired() -> dict:
    cfg: dict = {"site_url": SITE_URL, "uri_allow_list": ",".join(REDIRECTS)}
    for name, t in supabase_templates().items():
        cfg[f"mailer_subjects_{name}"] = t["subject"]
        cfg[f"mailer_templates_{name}_content"] = t["content"]
    return cfg


def main() -> None:
    current = _call("GET")
    want = desired()
    changes = {k: v for k, v in want.items() if current.get(k) != v}
    print(f"Project {PROJECT_REF}")
    print(f"  site_url: {current.get('site_url')!r} -> {SITE_URL!r}")
    print(f"  redirect allow list now: {current.get('uri_allow_list')!r}")
    print(f"  OTP length: {current.get('mailer_otp_length')}, expiry: {current.get('mailer_otp_exp')}s, "
          f"custom SMTP: {'on' if current.get('smtp_host') else 'off'} ({current.get('smtp_admin_email')})")
    print(f"  settings to change: {len(changes)} -> {sorted(changes)}")
    if "--apply" not in sys.argv:
        print("Dry run. Re-run with --apply to make these changes.")
        return
    if changes:
        _call("PATCH", changes)
    after = _call("GET")
    bad = [k for k, v in want.items() if after.get(k) != v]
    print("Applied." if not bad else f"Applied, but these didn't stick: {bad}")


if __name__ == "__main__":
    main()
