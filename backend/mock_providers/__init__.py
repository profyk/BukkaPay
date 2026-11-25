"""Mock card processor (Paymentology stand-in) and mock payout rail (Onafriq
stand-in) for tests and local development. See mock_providers/server.py.

They speak BukkaPay's own signed formats, because the real providers'
formats are TODO(vendor-docs). When the docs arrive the real adapters
translate to the same normalized calls these mocks exercise.
"""
