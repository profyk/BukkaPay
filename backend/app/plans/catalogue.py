"""The draft plan catalogue BukkaPay starts with. Every plan is a draft until
an admin publishes it (Admin → Merchant plans), and the paid plans have no
prices yet: the owner sets them per currency before publishing.

Limits: None means unlimited. Only published plans are enforced, and only
when something new is created (an existing staff member or link is never
taken away by a limit).
"""

LIMIT_KEYS = {
    "staff_seats": "Team members (besides the owner)",
    "checkout_links": "Active checkout links",
    "qr_codes": "Active QR codes",
    "api_access": "Developer API keys and webhooks",
    "settlement": "Payout schedule",
    "fee_discount_bps": "Discount on transaction fees (basis points)",
    "priority_support": "Priority support",
    "custom_branding": "Your logo and colours on checkout",
    "multi_currency": "Accept and hold several currencies",
    "advanced_insights": "Advanced insights and exports",
}

DRAFT_PLANS: list[dict] = [
    {
        "code": "starter", "name": "Starter", "sort_order": 10, "is_default": True,
        "tagline": "Everything you need to start getting paid.",
        "description": "For street vendors, spaza shops and new businesses. No monthly fee: you only pay per transaction.",
        "prices": {"ZAR": {"monthly": "0.00", "yearly": "0.00"}, "BWP": {"monthly": "0.00", "yearly": "0.00"},
                   "USD": {"monthly": "0.00", "yearly": "0.00"}},
        "features": ["QR code and checkout link payments", "BukkaPay wallet and bank payments",
                     "Weekly payouts to your bank", "Sales overview and transaction history", "Email support"],
        "limits": {"staff_seats": 2, "checkout_links": 5, "qr_codes": 2, "api_access": False, "settlement": "weekly",
                   "fee_discount_bps": 0, "priority_support": False, "custom_branding": False,
                   "multi_currency": False, "advanced_insights": False},
    },
    {
        "code": "growth", "name": "Growth", "sort_order": 20, "highlighted": True, "trial_days": 14,
        "tagline": "For growing shops with a team.",
        "description": "More staff, more links and faster payouts for busy shops, restaurants and service businesses.",
        "prices": {},
        "features": ["Everything in Starter", "Up to 5 team members with roles", "50 checkout links and 10 QR codes",
                     "Daily payouts", "Advanced insights and CSV exports", "Developer API and webhooks",
                     "Lower transaction fees"],
        "limits": {"staff_seats": 5, "checkout_links": 50, "qr_codes": 10, "api_access": True, "settlement": "daily",
                   "fee_discount_bps": 10, "priority_support": False, "custom_branding": True,
                   "multi_currency": False, "advanced_insights": True},
    },
    {
        "code": "pro", "name": "Pro", "sort_order": 30, "trial_days": 14,
        "tagline": "For established businesses selling across borders.",
        "description": "Multi-branch teams, multi-currency and priority support for businesses trading across Africa.",
        "prices": {},
        "features": ["Everything in Growth", "Up to 20 team members", "Unlimited checkout links, 50 QR codes",
                     "Hold and settle in several currencies", "Priority support", "Lowest standard transaction fees"],
        "limits": {"staff_seats": 20, "checkout_links": None, "qr_codes": 50, "api_access": True, "settlement": "daily",
                   "fee_discount_bps": 25, "priority_support": True, "custom_branding": True,
                   "multi_currency": True, "advanced_insights": True},
    },
    {
        "code": "enterprise", "name": "Enterprise", "sort_order": 40,
        "tagline": "Custom pricing for high volume.",
        "description": "Unlimited everything, a dedicated account manager and negotiated rates. Priced per agreement.",
        "prices": {},
        "features": ["Everything in Pro", "Unlimited team members and QR codes", "Dedicated account manager",
                     "Negotiated transaction rates", "Service-level agreement"],
        "limits": {"staff_seats": None, "checkout_links": None, "qr_codes": None, "api_access": True,
                   "settlement": "daily", "fee_discount_bps": 0, "priority_support": True, "custom_branding": True,
                   "multi_currency": True, "advanced_insights": True},
    },
]
