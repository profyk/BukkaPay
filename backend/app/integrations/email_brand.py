"""The one BukkaPay email look. Every email the API sends goes through
`resend_client.send_resend_email`, which wraps its content in `layout()` —
so no email can go out unbranded. The same layout (as static HTML with
Supabase's {{ .Token }} placeholder) is used for Supabase's auth emails; see
`supabase_templates()`.

Email-client safe: tables, inline styles, no web fonts or scripts.
"""

from __future__ import annotations

import html as _html

BRAND = "#7C3AED"
BRAND_DARK = "#5B21B6"
INK = "#1A1A2E"
MUTED = "#6B7280"
BG = "#F5F3FF"
LOGO_URL = "https://www.bukkapay.com/logo.png"
SITE_URL = "https://www.bukkapay.com"
SUPPORT_EMAIL = "support@bukkapay.com"


def esc(text: str | None) -> str:
    return _html.escape(text or "", quote=True)


def heading(text: str) -> str:
    return (f'<h1 style="margin:0 0 16px;font-size:22px;line-height:1.3;color:{INK};'
            f'font-weight:700;">{esc(text)}</h1>')


def paragraph(text_html: str) -> str:
    """`text_html` must already be escaped (use esc() for user values)."""
    return f'<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:{INK};">{text_html}</p>'


def button(label: str, url: str) -> str:
    u = esc(url)
    return (
        '<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 24px;"><tr>'
        f'<td style="border-radius:10px;background:{BRAND};">'
        f'<a href="{u}" style="display:inline-block;padding:14px 28px;font-size:15px;font-weight:600;'
        f'color:#FFFFFF;text-decoration:none;border-radius:10px;">{esc(label)}</a></td></tr></table>'
        f'<p style="margin:0 0 16px;font-size:12px;line-height:1.5;color:{MUTED};">'
        f'If the button doesn\'t work, copy this link into your browser:<br>'
        f'<a href="{u}" style="color:{BRAND_DARK};word-break:break-all;">{u}</a></p>'
    )


def code_box(code: str) -> str:
    return (f'<div style="margin:8px 0 24px;padding:18px;border-radius:12px;background:{BG};text-align:center;'
            f'font-size:32px;letter-spacing:8px;font-weight:700;color:{INK};font-family:Menlo,Consolas,monospace;">'
            f'{esc(code)}</div>')


def note(text_html: str) -> str:
    return f'<p style="margin:0 0 8px;font-size:13px;line-height:1.5;color:{MUTED};">{text_html}</p>'


def layout(content_html: str, *, preheader: str = "") -> str:
    """Wrap email content in the BukkaPay frame (logo header, card, footer)."""
    pre = (f'<div style="display:none;max-height:0;overflow:hidden;opacity:0;">{esc(preheader)}</div>'
           if preheader else "")
    return f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light"><title>BukkaPay</title></head>
<body style="margin:0;padding:0;background:{BG};font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
{pre}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:{BG};padding:32px 16px;">
<tr><td align="center">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">
    <tr><td style="padding:0 8px 20px;">
      <a href="{SITE_URL}" style="text-decoration:none;">
        <img src="{LOGO_URL}" width="40" height="40" alt="" style="vertical-align:middle;border:0;border-radius:10px;">
        <span style="vertical-align:middle;margin-left:10px;font-size:20px;font-weight:700;color:{INK};">BukkaPay</span>
      </a>
    </td></tr>
    <tr><td style="background:#FFFFFF;border-radius:16px;padding:32px 28px;border-top:4px solid {BRAND};">
      {content_html}
    </td></tr>
    <tr><td style="padding:20px 8px 0;font-size:12px;line-height:1.6;color:{MUTED};">
      BukkaPay &middot; One Africa. One Payment Network.<br>
      We'll never ask for your password, PIN or codes by email, phone or chat.<br>
      Questions? <a href="mailto:{SUPPORT_EMAIL}" style="color:{BRAND_DARK};">{SUPPORT_EMAIL}</a>
      &middot; <a href="{SITE_URL}/legal/privacy-policy" style="color:{BRAND_DARK};">Privacy</a>
    </td></tr>
  </table>
</td></tr></table>
</body></html>"""


def is_branded(html_doc: str) -> bool:
    return LOGO_URL in html_doc and "One Africa. One Payment Network." in html_doc


# ─── Supabase Auth email templates (Go templates: {{ .Token }} etc.) ────────

def _supabase_code_email(title: str, intro: str, outro: str) -> str:
    return layout(
        heading(title) + paragraph(intro) + code_box("{{ .Token }}") + note(outro),
        preheader=f"{title}: your BukkaPay code",
    ).replace(esc("{{ .Token }}"), "{{ .Token }}")


def supabase_templates() -> dict[str, dict[str, str]]:
    """Subject + HTML for every Supabase Auth email, keyed by Management API
    template name. BukkaPay uses 6-digit codes, not links."""
    expiry = "This code expires in 10 minutes and can be used once. If you didn't ask for it, you can ignore this email."
    return {
        "confirmation": {
            "subject": "Confirm your BukkaPay email",
            "content": _supabase_code_email("Confirm your email", "Welcome to BukkaPay! Enter this code to confirm your email address:", expiry),
        },
        "magic_link": {
            "subject": "Your BukkaPay confirmation code",
            "content": _supabase_code_email("Your confirmation code", "Enter this code in BukkaPay to confirm your email address:", expiry),
        },
        "email_change": {
            "subject": "Confirm your new BukkaPay email",
            "content": _supabase_code_email("Confirm your new email", "Enter this code to confirm this as your new BukkaPay email address:", expiry),
        },
        "recovery": {
            "subject": "Reset your BukkaPay password",
            "content": _supabase_code_email("Reset your password", "Enter this code to reset your BukkaPay password:", expiry),
        },
        "invite": {
            "subject": "You're invited to BukkaPay",
            "content": _supabase_code_email("You're invited", "Enter this code to accept your invitation to BukkaPay:", expiry),
        },
        "reauthentication": {
            "subject": "Your BukkaPay verification code",
            "content": _supabase_code_email("Verify it's you", "Enter this code to confirm this action in BukkaPay:", expiry),
        },
    }
