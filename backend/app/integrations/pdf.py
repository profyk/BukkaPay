"""Invoice/receipt PDF generation — reportlab port of the old pdfkit-based
generator in routes.ts (GET /api/payment-links/:linkId/invoice/pdf).
"""

import io
from datetime import datetime

from reportlab.lib.colors import HexColor
from reportlab.lib.pagesizes import letter
from reportlab.pdfgen import canvas

PRIMARY = HexColor("#7C3AED")
DARK = HexColor("#1A1A2E")
GRAY = HexColor("#374151")
LIGHT_GRAY = HexColor("#9CA3AF")
MUTED = HexColor("#6B7280")
GREEN = HexColor("#10B981")
RED = HexColor("#EF4444")
HEADER_BG = HexColor("#F3F0FF")
BORDER = HexColor("#E5E7EB")


def _fmt_date(value) -> str:
    if isinstance(value, str):
        value = datetime.fromisoformat(value)
    return value.strftime("%m/%d/%Y")


def generate_invoice_pdf(*, link, invoice, sender, payments: list) -> bytes:
    buf = io.BytesIO()
    width, height = letter
    c = canvas.Canvas(buf, pagesize=letter)

    # header band
    c.setFillColor(PRIMARY)
    c.rect(0, height - 80, width, 80, fill=1, stroke=0)
    c.setFillColor(HexColor("#FFFFFF"))
    c.setFont("Helvetica-Bold", 24)
    c.drawString(50, height - 55, "BukkaPay")
    c.setFont("Helvetica", 10)
    doc_type = (invoice.type.value if hasattr(invoice.type, "value") else invoice.type).upper() if invoice else "PAYMENT RECEIPT"
    c.drawString(50, height - 75, doc_type)

    y = height - 110
    c.setFillColor(DARK)
    c.setFont("Helvetica-Bold", 11)
    c.drawString(50, y, f"Document #: {str(link.id)[:8].upper()}")
    c.drawString(50, y - 18, f"Date: {_fmt_date(link.created_at)}")
    next_y = y - 36
    if invoice and invoice.due_date:
        c.drawString(50, next_y, f"Due Date: {_fmt_date(invoice.due_date)}")
        next_y -= 18
    status = link.status.value if hasattr(link.status, "value") else link.status
    c.drawString(50, next_y, f"Status: {status.upper()}")

    c.setFont("Helvetica-Bold", 11)
    c.drawString(350, y, "From:")
    c.setFont("Helvetica", 11)
    c.drawString(350, y - 18, sender.name if sender else "BukkaPay User")
    if sender and sender.email:
        c.drawString(350, y - 36, sender.email)

    if invoice:
        by = y - 100
        c.setFont("Helvetica-Bold", 11)
        c.drawString(50, by, "Bill To:")
        c.setFont("Helvetica", 11)
        c.drawString(50, by - 18, invoice.customer_name)
        if invoice.customer_email:
            c.drawString(50, by - 36, invoice.customer_email)
        if invoice.customer_phone:
            c.drawString(50, by - 54, invoice.customer_phone)

    table_top = height - 310
    if invoice and invoice.items:
        c.setFillColor(HEADER_BG)
        c.rect(50, table_top - 22, width - 100, 22, fill=1, stroke=0)
        c.setFillColor(DARK)
        c.setFont("Helvetica-Bold", 10)
        c.drawString(60, table_top - 16, "Item")
        c.drawString(280, table_top - 16, "Qty")
        c.drawString(340, table_top - 16, "Unit Price")
        c.drawString(450, table_top - 16, "Total")

        row_y = table_top - 50
        for item in invoice.items:
            c.setFillColor(GRAY)
            c.setFont("Helvetica", 10)
            c.drawString(60, row_y, str(item.get("name", ""))[:40])
            c.drawString(280, row_y, str(item.get("quantity", 1)))
            c.drawString(340, row_y, f"{link.currency} {float(item.get('unitPrice', 0)):.2f}")
            c.drawString(450, row_y, f"{link.currency} {float(item.get('total', 0)):.2f}")
            c.setStrokeColor(BORDER)
            c.line(50, row_y - 6, width - 50, row_y - 6)
            row_y -= 20

        row_y -= 10
        c.setFillColor(DARK)
        c.setFont("Helvetica-Bold", 10)
        c.drawString(340, row_y, "Total Amount:")
        c.drawString(450, row_y, f"{link.currency} {link.amount:.2f}")
        row_y -= 20
        c.setFillColor(GREEN)
        c.drawString(340, row_y, "Amount Paid:")
        c.drawString(450, row_y, f"{link.currency} {link.amount_paid:.2f}")
        row_y -= 20
        remaining = link.remaining_balance or 0
        if remaining > 0:
            c.setFillColor(RED)
            c.drawString(340, row_y, "Remaining:")
            c.drawString(450, row_y, f"{link.currency} {remaining:.2f}")
    else:
        py = height - 280
        c.setFillColor(DARK)
        c.setFont("Helvetica-Bold", 11)
        c.drawString(50, py, "Payment Details")
        py -= 20
        c.setFont("Helvetica", 11)
        c.drawString(50, py, f"Description: {link.description or 'Payment'}")
        py -= 20
        c.drawString(50, py, f"Amount: {link.currency} {link.amount:.2f}")
        py -= 20
        c.setFillColor(GREEN)
        c.drawString(50, py, f"Paid: {link.currency} {link.amount_paid:.2f}")
        remaining = link.remaining_balance or 0
        if remaining > 0:
            py -= 20
            c.setFillColor(RED)
            c.drawString(50, py, f"Remaining: {link.currency} {remaining:.2f}")

    completed_payments = [p for p in payments if (p.status.value if hasattr(p.status, "value") else p.status) == "completed"][:5]
    if completed_payments:
        hy = 180
        c.setFillColor(MUTED)
        c.setFont("Helvetica", 9)
        c.drawString(50, hy, "Payment History:")
        hy -= 16
        for p in completed_payments:
            method = p.method.value if hasattr(p.method, "value") else p.method
            c.drawString(50, hy, f"• {_fmt_date(p.created_at)} — {method.upper()} — {link.currency} {p.amount:.2f}")
            hy -= 14

    c.setFillColor(LIGHT_GRAY)
    c.setFont("Helvetica", 8)
    c.drawCentredString(width / 2, 40, "Generated by BukkaPay | bukkapay.com")

    c.showPage()
    c.save()
    return buf.getvalue()
