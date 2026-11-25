from decimal import Decimal

import pytest

from app.core.money import Minor, MoneyError, apply_bps, convert
from app.core.state_machine import InvalidTransition, machine


def test_minor_units_round_trip_exactly():
    assert Minor.from_decimal("12.34", "ZAR") == Minor(1234, "ZAR")
    assert Minor(1234, "BWP").to_decimal() == Decimal("12.34")
    assert Minor.from_decimal(Decimal("100"), "UGX") == Minor(100, "UGX")  # zero-decimal currency
    assert Minor(5, "USD").to_decimal() == Decimal("0.05")


def test_minor_units_refuse_floats_rounding_and_unknown_currencies():
    with pytest.raises(MoneyError):
        Minor.from_decimal(12.34, "ZAR")  # type: ignore[arg-type]
    with pytest.raises(MoneyError):
        Minor.from_decimal("12.345", "ZAR")
    with pytest.raises(MoneyError):
        Minor(10, "XYZ")
    with pytest.raises(MoneyError):
        Minor(1.5, "ZAR")  # type: ignore[arg-type]
    with pytest.raises(MoneyError):
        Minor(100, "ZAR") + Minor(100, "BWP")


def test_basis_points_and_conversion_never_overpay():
    assert apply_bps(10_000, 150) == 150
    assert apply_bps(333, 150) == 5  # 4.995 rounds half-up
    assert convert(Minor(10_000, "ZAR"), Decimal("0.7391"), "BWP") == Minor(7391, "BWP")
    assert convert(Minor(1, "ZAR"), Decimal("0.7399"), "BWP") == Minor(0, "BWP")  # rounds down


class Obj:
    def __init__(self, status):
        self.id = "x"
        self.status = status


@pytest.mark.asyncio
async def test_state_machine_refuses_undeclared_moves_and_is_idempotent():
    m = machine("demo", {"a": {"b"}, "b": {"c"}}, terminal={"c"})

    class FakeDb:
        added = []

        def add(self, obj):
            self.added.append(obj)

        async def flush(self):
            pass

    db = FakeDb()
    o = Obj("a")
    assert await m.move(db, o, "b") is True
    assert await m.move(db, o, "b") is False  # replay: no-op
    with pytest.raises(InvalidTransition):
        await m.move(db, o, "a")
    assert await m.move(db, o, "c") is True
    with pytest.raises(InvalidTransition):
        await m.move(db, o, "b")  # terminal
    assert len(db.added) == 2  # one audit row per real transition


def test_state_machine_definition_is_checked():
    with pytest.raises(ValueError):
        machine("bad", {"a": {"b"}}, terminal=set())  # b undeclared
    with pytest.raises(ValueError):
        machine("bad", {"a": {"b"}, "b": {"a"}}, terminal={"b"})  # terminal with exits
