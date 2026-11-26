"""Admin: the company — departments, the staff directory, the org chart and
which countries each person covers.

Role changes stay with the owner (Admins & Roles); this module manages
where people sit and what they cover. Every change is audited."""

import uuid
from datetime import date

from fastapi import APIRouter, Depends
from pydantic import Field
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.admin.deps import AdminContext, require
from app.core.errors import ApiError
from app.db.deps import get_db
from app.governance.permissions import ROLE_LABELS
from app.models.admin import AdminUser
from app.models.org import Department
from app.models.platform import Country
from app.schemas.base import CamelModel

router = APIRouter(tags=["admin-org"])


def _person(a: AdminUser, depts: dict) -> dict:
    role = str(getattr(a.role, "value", a.role))
    return {"id": str(a.id), "name": a.name, "email": a.email, "role": role, "roleLabel": ROLE_LABELS.get(role, role),
            "active": a.is_active, "mfa": a.mfa_enabled, "title": a.title, "phone": a.phone,
            "departmentId": str(a.department_id) if a.department_id else None,
            "department": depts.get(a.department_id), "managerId": str(a.manager_id) if a.manager_id else None,
            "countries": a.country_scope or [], "startedOn": a.started_on.isoformat() if a.started_on else None,
            "lastLoginAt": a.last_login_at.isoformat() if a.last_login_at else None}


def _dept(d: Department, people: list[AdminUser], admins: dict) -> dict:
    members = [p for p in people if p.department_id == d.id]
    return {"id": str(d.id), "code": d.code, "name": d.name, "description": d.description, "email": d.email,
            "headId": str(d.head_admin_id) if d.head_admin_id else None,
            "head": admins.get(d.head_admin_id), "members": len(members),
            "active": sum(1 for p in members if p.is_active)}


@router.get("/org")
async def overview(_=Depends(require("org.view")), db: AsyncSession = Depends(get_db)):
    depts = (await db.execute(select(Department).order_by(Department.name))).scalars().all()
    people = (await db.execute(select(AdminUser).order_by(AdminUser.name))).scalars().all()
    dept_names = {d.id: d.name for d in depts}
    names = {p.id: p.name or p.email for p in people}
    countries = (await db.execute(select(Country.code, Country.name, Country.status).where(Country.region == "Africa")
                                  .order_by(Country.name))).all()
    coverage = []
    for code, name, status in countries:
        who = [names[p.id] for p in people if p.is_active and code in (p.country_scope or [])]
        coverage.append({"code": code, "name": name, "status": status, "staff": who})
    return {
        "departments": [_dept(d, people, names) for d in depts],
        "people": [_person(p, dept_names) for p in people],
        "coverage": coverage,
        "unassigned": sum(1 for p in people if p.is_active and p.department_id is None),
        "roles": [{"value": k, "label": v} for k, v in ROLE_LABELS.items()],
    }


class DeptIn(CamelModel):
    code: str = Field(min_length=2, max_length=30, pattern=r"^[a-z0-9_]+$")
    name: str = Field(min_length=2, max_length=80)
    description: str | None = Field(default=None, max_length=1000)
    email: str | None = Field(default=None, max_length=120)
    head_id: str | None = None


def _uuid(v: str | None) -> uuid.UUID | None:
    if not v:
        return None
    try:
        return uuid.UUID(v)
    except ValueError as e:
        raise ApiError("Not found", status_code=404) from e


@router.post("/org/departments", status_code=201)
async def create_department(body: DeptIn, ctx: AdminContext = Depends(require("org.manage")),
                            db: AsyncSession = Depends(get_db)):
    if (await db.execute(select(Department.id).where(Department.code == body.code))).first():
        raise ApiError("A department with that code exists", status_code=409)
    d = Department(code=body.code, name=body.name, description=body.description, email=body.email,
                   head_admin_id=_uuid(body.head_id))
    db.add(d)
    await db.flush()
    await ctx.audit(db, "org.department.created", target_type="department", target_id=d.id, details={"name": d.name})
    return {"id": str(d.id)}


@router.patch("/org/departments/{dept_id}")
async def update_department(dept_id: str, body: DeptIn, ctx: AdminContext = Depends(require("org.manage")),
                            db: AsyncSession = Depends(get_db)):
    d = await db.get(Department, _uuid(dept_id))
    if d is None:
        raise ApiError("Department not found", status_code=404)
    d.name, d.description, d.email, d.head_admin_id = body.name, body.description, body.email, _uuid(body.head_id)
    if d.head_admin_id:  # the head belongs to the department
        head = await db.get(AdminUser, d.head_admin_id)
        if head is not None:
            head.department_id = d.id
    await db.flush()
    await ctx.audit(db, "org.department.updated", target_type="department", target_id=d.id, details={"name": d.name})
    return {"id": str(d.id)}


@router.delete("/org/departments/{dept_id}")
async def delete_department(dept_id: str, ctx: AdminContext = Depends(require("org.manage")),
                            db: AsyncSession = Depends(get_db)):
    d = await db.get(Department, _uuid(dept_id))
    if d is None:
        raise ApiError("Department not found", status_code=404)
    members = (await db.execute(select(func.count()).select_from(AdminUser).where(AdminUser.department_id == d.id))).scalar_one()
    if members:
        raise ApiError("Move this department's people to another department first", status_code=409)
    await db.delete(d)
    await ctx.audit(db, "org.department.deleted", target_type="department", target_id=dept_id)
    return {"deleted": True}


class PersonPatch(CamelModel):
    department_id: str | None = None
    title: str | None = Field(default=None, max_length=100)
    manager_id: str | None = None
    phone: str | None = Field(default=None, max_length=30)
    started_on: date | None = None
    countries: list[str] | None = None


@router.patch("/org/people/{admin_id}")
async def update_person(admin_id: str, body: PersonPatch, ctx: AdminContext = Depends(require("org.manage")),
                        db: AsyncSession = Depends(get_db)):
    a = await db.get(AdminUser, _uuid(admin_id))
    if a is None:
        raise ApiError("Person not found", status_code=404)
    is_owner = str(getattr(a.role, "value", a.role)) == "super_admin"
    caller_is_owner = ctx.admin is not None and str(getattr(ctx.admin.role, "value", ctx.admin.role)) == "super_admin"
    data = body.model_dump(exclude_unset=True)
    if "countries" in data:
        if is_owner:
            raise ApiError("The owner always covers every country", status_code=403)
        if ctx.admin is not None and a.id == ctx.admin.id and not caller_is_owner:
            raise ApiError("You can't change your own country coverage", status_code=403)
        codes = sorted({c.strip().upper() for c in (data["countries"] or []) if c.strip()})
        if codes:
            known = {c for (c,) in (await db.execute(select(Country.code).where(Country.code.in_(codes)))).all()}
            if bad := [c for c in codes if c not in known]:
                raise ApiError(f"Unknown country code: {', '.join(bad)}")
        a.country_scope = codes
    if "department_id" in data:
        a.department_id = _uuid(data["department_id"])
    if "manager_id" in data:
        mid = _uuid(data["manager_id"])
        if mid == a.id:
            raise ApiError("Someone can't be their own manager")
        # no loops in the reporting line
        seen, cur = {a.id}, mid
        while cur is not None:
            if cur in seen:
                raise ApiError("That would make a reporting loop")
            seen.add(cur)
            nxt = await db.get(AdminUser, cur)
            cur = nxt.manager_id if nxt else None
        a.manager_id = mid
    for k in ("title", "phone", "started_on"):
        if k in data:
            setattr(a, k, data[k] or None)
    await db.flush()
    await ctx.audit(db, "org.person.updated", target_type="admin", target_id=a.id,
                    details={k: (str(v) if v is not None else None) for k, v in data.items()})
    depts = {d.id: d.name for d in (await db.execute(select(Department))).scalars()}
    return _person(a, depts)
