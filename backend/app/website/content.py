"""Website content model: sections, their schemas and honest defaults.

Admins edit each section in the admin app. The website reads the merged
result from GET /api/v1/public/site and falls back to these defaults if the
API is unreachable. Defaults make no claim the platform can't back up
(no licences, uptime, country counts or settlement times that aren't true).
"""

from typing import Literal

from pydantic import Field, HttpUrl, field_validator

from app.schemas.base import CamelModel


class Link(CamelModel):
    label: str = Field(min_length=1, max_length=40)
    href: str = Field(min_length=1, max_length=300)


class Announcement(CamelModel):
    enabled: bool = False
    text: str = Field(default="", max_length=200)
    link: Link | None = None
    tone: Literal["info", "success", "warning"] = "info"


class Settings(CamelModel):
    # "waitlist": pre-launch, the main call to action is joining the waitlist.
    # "live": the app is available; the call to action is downloading it.
    launch_mode: Literal["waitlist", "live"] = "waitlist"
    announcement: Announcement = Announcement()
    ios_url: HttpUrl | None = None
    android_url: HttpUrl | None = None
    support_email: str = Field(default="hello@bukkapay.com", max_length=120)
    sales_email: str = Field(default="hello@bukkapay.com", max_length=120)
    press_email: str = Field(default="marketing@bukkapay.com", max_length=120)
    socials: list[Link] = Field(default_factory=list, max_length=8)
    seo_title: str = Field(default="BukkaPay — Cash-free payments and trade across Africa", max_length=70)
    seo_description: str = Field(
        default="Pay, get paid and trade across borders in ZAR, BWP and USD: free wallet transfers, scan-to-pay, "
                "supplier payments and flights.",
        max_length=160,
    )

    @field_validator("support_email", "sales_email", "press_email")
    @classmethod
    def _email(cls, v: str) -> str:
        if "@" not in v:
            raise ValueError("must be an email address")
        return v.strip().lower()


class Feature(CamelModel):
    tag: str = Field(default="", max_length=20)
    title: str = Field(min_length=1, max_length=60)
    body: str = Field(min_length=1, max_length=240)


class UseCase(CamelModel):
    audience: str = Field(min_length=1, max_length=40)
    title: str = Field(min_length=1, max_length=80)
    body: str = Field(min_length=1, max_length=260)


class Home(CamelModel):
    eyebrow: str = Field(default="Cash-free Africa · ZAR · BWP · USD", max_length=60)
    title: str = Field(default="Money that moves the way Africa trades.", max_length=80)
    subtitle: str = Field(
        default="Send money to anyone in seconds, pay any shop with a scan, and pay suppliers across borders — "
                "with every rate and fee shown before you confirm. One wallet for everyday life and cross-border trade.",
        max_length=280,
    )
    benefits: list[str] = Field(default_factory=lambda: [
        "Free transfers between BukkaPay wallets",
        "Scan to pay at spaza shops, taxis and market stalls — no card machine",
        "ZAR, BWP and USD side by side — never mixed",
        "Supplier payments protected by escrow, with border-ready receipts (coming soon)",
    ], max_length=5)
    features: list[Feature] = Field(default_factory=lambda: [
        Feature(tag="Everyday", title="Zero-fee transfers", body="Pay friends and family by @username, phone number or QR. Money moves between BukkaPay wallets instantly — and free."),
        Feature(tag="Everyday", title="Scan to pay", body="One scan at the counter, the taxi rank or the market stall. The merchant is paid instantly into their BukkaPay balance."),
        Feature(tag="Wallet", title="ZAR, BWP and USD wallets", body="Keep a separate balance in each currency and switch in a tap. You see the exchange rate before you swap or pay."),
        Feature(tag="Trade · soon", title="Pay suppliers across borders", body="Pay a wholesaler in Gaborone from Johannesburg — instantly, or protected by escrow until your goods are collected or delivered."),
        Feature(tag="Trade · soon", title="Border-ready trade receipts", body="Every supplier payment comes with a tamper-evident receipt naming buyer and seller, the invoice and the rate — for customs and credit."),
        Feature(tag="Travel", title="Fly with your wallet", body="Search fares across airlines and pay from your ZAR, BWP or USD wallet with your PIN. Your booking reference arrives instantly."),
        Feature(tag="Cards", title="Virtual Visa card", body="Pay online and tap to pay once your ID is verified and cards launch in your country. Freeze it any time from the app."),
        Feature(tag="Business", title="Payment links & invoices", body="Share a link or an itemised invoice on WhatsApp and watch it marked paid the moment the money arrives."),
        Feature(tag="Community", title="Stokvels & contributions", body="Pool money for a family event or a stokvel — with a clear, shared record of who paid."),
    ], max_length=12)
    use_cases: list[UseCase] = Field(default_factory=lambda: [
        UseCase(audience="Spaza shops & vendors", title="Your phone is the till", body="Show your QR code and get paid on the spot, at a low merchant fee. Start with just your ID — no business registration needed."),
        UseCase(audience="Cross-border traders", title="Buy stock without carrying cash", body="Pay suppliers across the border from your wallet, keep the receipt for the border post, and leave the cash risk behind."),
        UseCase(audience="Wholesalers", title="Invoice buyers in their currency", body="Send itemised invoices to buyers in neighbouring countries and get settled in your own currency."),
        UseCase(audience="Taxi owners & drivers", title="Fares without the cash box", body="Passengers scan and pay; you see every fare as it lands, and cash never has to change hands."),
        UseCase(audience="Families", title="Send home in seconds", body="Support family across town or across the border — free between BukkaPay wallets, with the rate shown upfront."),
        UseCase(audience="Landlords", title="Collect rent on time", body="Add your units and tenants, send rent links, and see who has paid."),
    ], max_length=8)


class Plan(CamelModel):
    name: str = Field(min_length=1, max_length=30)
    price: str = Field(min_length=1, max_length=20)
    period: str = Field(default="", max_length=20)
    description: str = Field(default="", max_length=140)
    features: list[str] = Field(default_factory=list, max_length=10)
    cta: Link | None = None
    highlighted: bool = False


class Pricing(CamelModel):
    # Off until the business confirms prices; the site then shows a notice.
    enabled: bool = False
    intro: str = Field(default="Start free. You only pay a fee when you get paid.", max_length=200)
    plans: list[Plan] = Field(default_factory=list, max_length=4)
    footnote: str = Field(default="Transaction fees are shown before every payment.", max_length=200)


class FaqItem(CamelModel):
    question: str = Field(min_length=3, max_length=160)
    answer: str = Field(min_length=3, max_length=1200)


class Faq(CamelModel):
    items: list[FaqItem] = Field(default_factory=lambda: [FaqItem(question=q, answer=a) for q, a in [
        ("What is BukkaPay?", "BukkaPay is a cash-free wallet for Africa. Send money free between wallets, pay shops and taxis with a QR scan, hold ZAR, BWP and USD, book flights, and — soon — pay suppliers across borders with escrow protection and border-ready receipts."),
        ("Which currencies can I hold?", "South African rand (ZAR), Botswana pula (BWP) and US dollars (USD) to start, each in its own balance. Balances are never mixed, and every exchange rate is shown before you swap or pay."),
        ("What is Protected Escrow Pay?", "When you pay a supplier with escrow, your money is held safely by BukkaPay — not by the seller — until you confirm you've received the goods (or delivery is verified). If something goes wrong, our team reviews the dispute and the money goes back to you or on to the seller. Escrow is coming soon."),
        ("Can I book flights with BukkaPay?", "Yes. Search fares, add passengers exactly as on their ID or passport, and pay from a wallet in the fare's currency with your PIN. You get a booking reference straight away."),
        ("Is it available in my country?", "See the Countries page — it shows exactly where BukkaPay is live, piloting or planned, straight from our live configuration."),
        ("Who holds my money?", "Customer funds are held by licensed financial institutions in each country where BukkaPay operates. BukkaPay runs the technology on top."),
        ("How do I get a Visa card?", "Every wallet gets its own virtual Visa card once you've verified your ID and cards are available in your country. You can add it to Apple Pay or Google Pay to tap to pay."),
        ("Can I accept payments without a registered business?", "Yes. Street vendors, tuck shops and individual landlords can start with just their verified ID, up to individual seller limits. Registered businesses verify once and have higher limits."),
        ("What does it cost?", "Every fee and exchange rate is shown before you confirm a payment. There are no hidden charges."),
        ("Is BukkaPay a bank?", "No. BukkaPay is a payment technology company. Customer funds are held and settled by licensed local financial institutions in each country where we operate."),
        ("What happens if a cross-border transfer fails?", "If it can't be delivered, the full amount, including the fee, is returned to your wallet."),
        ("Why do I need to verify my identity?", "Regulations require it, and it protects you. Your limits increase as you complete verification."),
        ("How do businesses get paid out?", "Businesses request payouts to a verified bank account. A payout shows as settled only once the bank confirms it."),
        ("Are community contributions an investment?", "No. They collect money for a shared purpose and are not a savings, deposit or investment product."),
    ]], max_length=30)


SECTIONS: dict[str, type[CamelModel]] = {"settings": Settings, "home": Home, "pricing": Pricing, "faq": Faq}


def defaults() -> dict[str, dict]:
    return {key: model().model_dump(mode="json", by_alias=True) for key, model in SECTIONS.items()}


def validate(key: str, data: dict) -> dict:
    model = SECTIONS.get(key)
    if model is None:
        raise KeyError(key)
    return model.model_validate(data).model_dump(mode="json", by_alias=True)
