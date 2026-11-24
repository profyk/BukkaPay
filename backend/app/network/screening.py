"""Sanctions and PEP screening through OpenSanctions' matching API.

The same `/match` API is served by OpenSanctions' hosted service and by
`yente`, its open-source server, so BukkaPay can start on the hosted API
and later self-host yente with a bulk data licence (cheapest at volume)
by changing `SCREENING_API_URL` only.

Nothing here is ever treated as a pass unless a provider actually answered:
no provider → `not_screened`; provider error → `error` (rescreened later).
"""

from dataclasses import dataclass, field

import httpx

from app.core.config import get_settings

MATCH_THRESHOLD = 0.95      # confident hit: block and review
POSSIBLE_THRESHOLD = 0.70   # possible hit: review


@dataclass
class Hit:
    name: str
    score: float
    topics: list[str]
    datasets: list[str]
    entity_id: str


@dataclass
class Outcome:
    provider: str
    sanctions: str  # not_screened / clear / potential_match / match / error
    pep: str
    hits: list[Hit] = field(default_factory=list)
    error: str | None = None


def configured() -> bool:
    return bool(get_settings().screening_api_url)


def _grade(score: float) -> str:
    if score >= MATCH_THRESHOLD:
        return "match"
    if score >= POSSIBLE_THRESHOLD:
        return "potential_match"
    return "clear"


async def screen(*, name: str, kind: str = "person", country: str | None = None,
                 birth_date: str | None = None) -> Outcome:
    """Screen one party. kind: "person" or "company"."""
    s = get_settings()
    if not s.screening_api_url:
        return Outcome(provider="none", sanctions="not_screened", pep="not_screened")
    props: dict[str, list[str]] = {"name": [name]}
    if country:
        props["country"] = [country.lower()]
    if birth_date and kind == "person":
        props["birthDate"] = [birth_date]
    body = {"queries": {"q": {"schema": "Person" if kind == "person" else "Company", "properties": props}}}
    headers = {"Authorization": f"ApiKey {s.screening_api_key}"} if s.screening_api_key else {}
    url = s.screening_api_url.rstrip("/") + f"/match/{s.screening_dataset}"
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            r = await client.post(url, json=body, headers=headers)
        r.raise_for_status()
        results = ((r.json().get("responses") or {}).get("q") or {}).get("results") or []
    except (httpx.HTTPError, ValueError) as e:
        return Outcome(provider="opensanctions", sanctions="error", pep="error", error=f"{type(e).__name__}: {e}"[:300])

    hits = [Hit(name=str(x.get("caption") or ""), score=float(x.get("score") or 0),
                topics=list((x.get("properties") or {}).get("topics") or []),
                datasets=list(x.get("datasets") or []), entity_id=str(x.get("id") or ""))
            for x in results]
    best_sanction = max((h.score for h in hits if "sanction" in h.topics or "sanction.linked" in h.topics), default=0.0)
    best_pep = max((h.score for h in hits if any(t.startswith("role.pep") or t == "role.rca" for t in h.topics)),
                   default=0.0)
    return Outcome(provider="opensanctions", sanctions=_grade(best_sanction), pep=_grade(best_pep),
                   hits=[h for h in hits if h.score >= POSSIBLE_THRESHOLD][:5])
