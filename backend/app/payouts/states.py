from app.core.state_machine import machine

# confirmed  = customer's money taken into payout-in-transit
# submitted  = the rail accepted our instruction (idempotency key)
# processing = the rail says it's on the way
# paid       = delivered; in-transit settled to the rail's float
# failed / returned → reversed: money back in the customer's wallet
PAYOUT = machine("payout", {
    "quoted": {"confirmed", "expired", "cancelled"},
    "confirmed": {"submitted", "failed"},
    "submitted": {"processing", "paid", "failed"},
    "processing": {"paid", "failed"},
    "paid": {"returned"},
    "failed": {"reversed"},
    "returned": {"reversed"},
}, terminal={"expired", "cancelled", "reversed"})
