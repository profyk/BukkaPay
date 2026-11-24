"""Explicit state machines with an audit trail.

Every status change of a card, card transaction or payout goes through
`StateMachine.move`, which refuses transitions that aren't declared and
writes an audit row in the same transaction. Terminal states have no exits.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from sqlalchemy.ext.asyncio import AsyncSession

from app.governance import audit


class InvalidTransition(Exception):
    def __init__(self, machine: str, current: str, target: str):
        super().__init__(f"{machine}: can't go from {current!r} to {target!r}")
        self.machine, self.current, self.target = machine, current, target


@dataclass(frozen=True)
class StateMachine:
    name: str
    transitions: dict[str, frozenset[str]]
    terminal: frozenset[str] = field(default_factory=frozenset)

    def __post_init__(self) -> None:
        known = set(self.transitions) | {s for targets in self.transitions.values() for s in targets}
        for t in self.terminal:
            if self.transitions.get(t):
                raise ValueError(f"{self.name}: terminal state {t} has exits")
        missing = known - set(self.transitions) - set(self.terminal)
        if missing:
            raise ValueError(f"{self.name}: states without a declaration: {sorted(missing)}")

    @property
    def states(self) -> frozenset[str]:
        return frozenset(self.transitions) | self.terminal

    def can(self, current: str, target: str) -> bool:
        return target in self.transitions.get(current, frozenset())

    async def move(self, db: AsyncSession, obj, target: str, *, attr: str = "status", actor: str = "system",
                   reason: str | None = None, details: dict | None = None) -> bool:
        """Move `obj.<attr>` to `target`. Returns False (and does nothing) if
        it's already there, so replayed events are harmless."""
        current = getattr(obj, attr)
        if current == target:
            return False
        if not self.can(current, target):
            raise InvalidTransition(self.name, current, target)
        setattr(obj, attr, target)
        await audit.record(
            db, actor_type="system" if actor == "system" else "user", actor_id=None if actor == "system" else actor,
            actor_email=None, action=f"{self.name}.{target}", target_type=self.name,
            target_id=str(getattr(obj, "id", "")), details={"from": current, "to": target, "reason": reason, **(details or {})},
        )
        return True


def machine(name: str, spec: dict[str, set[str] | tuple[str, ...]], terminal: set[str]) -> StateMachine:
    return StateMachine(name, {k: frozenset(v) for k, v in spec.items()}, frozenset(terminal))
