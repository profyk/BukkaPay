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
    seo_title: str = Field(default="BukkaPay — Get paid across Africa", max_length=70)
    seo_description: str = Field(
        default="Payment links, invoices, QR payments and a multi-currency wallet with a Visa card — built for Africa.",
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
    eyebrow: str = Field(default="Launching across Africa", max_length=60)
    title: str = Field(default="Get paid. Pay anywhere.", max_length=80)
    subtitle: str = Field(
        default="Payment links, invoices and QR codes for your business — and a multi-currency wallet with a Visa "
                "card for everyone. Every fee and exchange rate is shown before you confirm.",
        max_length=280,
    )
    benefits: list[str] = Field(default_factory=lambda: [
        "No more fake payment screenshots — links are marked paid only when the money arrives",
        "Street vendors start with just their ID",
        "Fees and exchange rates shown upfront",
    ], max_length=5)
    features: list[Feature] = Field(default_factory=lambda: [
        Feature(tag="Business", title="Payment links", body="Create a link in seconds, share it on WhatsApp, SMS or email, and see it marked paid the moment the money arrives."),
        Feature(tag="Business", title="Invoices & bills", body="Send bills for school fees, levies, rent or services. Every payment is matched to the right bill automatically."),
        Feature(tag="Business", title="QR codes", body="Print a QR code for your counter or stall — no card machine needed. Dynamic QR codes are signed and can't be tampered with."),
        Feature(tag="Wallet", title="Multi-currency wallet", body="Hold separate balances in the currencies available in your country. Balances are never mixed."),
        Feature(tag="Wallet", title="Visa card on every wallet", body="Pay online and tap to pay with your phone wherever Visa is accepted, once your ID is verified and cards launch in your country."),
        Feature(tag="Community", title="Contributions & bill splitting", body="Pool money for a family event or stokvel, or split a bill — with a clear record of who paid."),
    ], max_length=12)
    use_cases: list[UseCase] = Field(default_factory=lambda: [
        UseCase(audience="Freelancers", title="Send a link, get paid", body="Share a payment link with your client and get paid without sharing bank details."),
        UseCase(audience="Street vendors & tuck shops", title="Your phone is the till", body="Show your QR code and get paid on the spot. Sign up with just your ID — no business registration needed to start."),
        UseCase(audience="Landlords", title="Collect rent on time", body="Add your units and tenants, send rent links, and see who has paid."),
        UseCase(audience="Schools & clubs", title="Bills people actually pay", body="Send fee bills that parents pay from their wallet or bank, matched automatically."),
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
        ("What is BukkaPay?", "BukkaPay is a payments app for Africa: payment links, invoices and QR codes for businesses, and a multi-currency wallet with a Visa card for everyone."),
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
