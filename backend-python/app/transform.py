import math
import re
from typing import Any

from .models import AssigneeRef, CustomFieldValue, Issue, TimeEntry

# Known custom fields we surface as first-class columns. Matched by NAME
# (case-insensitive), never by hardcoded id, since custom field ids are
# instance-specific and were confirmed to vary (see README "API investigation").
# To add a new named custom field column later, just add an entry here and a
# matching property on the Issue model.
KNOWN_CUSTOM_FIELD_NAMES = {
    "assignedQA": "assigned qa",
    "platform": "platform",
    "additionalAssignee": "additional assignee",
    "estimatedTimeForQA": "estimated time for qa",
}

_NUMERIC_ID_RE = re.compile(r"^\d+$")


def _is_numeric_id(v: str) -> bool:
    return bool(_NUMERIC_ID_RE.match(v.strip()))


def _resolve_custom_field_display(value: Any, user_map: dict[int, str]) -> str | None:
    """Resolves a raw custom field value to a display string, mapping numeric user ids
    to names where known."""
    if value is None:
        return None
    values = value if isinstance(value, list) else [value]
    resolved = [
        user_map.get(int(v), v) if isinstance(v, str) and _is_numeric_id(v) else v
        for v in values
        if v not in (None, "")
    ]
    return ", ".join(resolved) if resolved else None


def _resolve_custom_field_user_refs(value: Any, user_map: dict[int, str]) -> list[AssigneeRef]:
    """Like _resolve_custom_field_display, but keeps the numeric id alongside the
    resolved name instead of collapsing to a display string — needed to identify a user
    unambiguously (display names alone could collide) for user-assignment analysis.
    Values that aren't a resolvable numeric user id are skipped, since they can't be
    matched to a specific person."""
    if value is None:
        return []
    values = value if isinstance(value, list) else [value]
    refs: list[AssigneeRef] = []
    for v in values:
        if not isinstance(v, str) or v == "" or not _is_numeric_id(v):
            continue
        user_id = int(v)
        refs.append(AssigneeRef(id=user_id, name=user_map.get(user_id, v)))
    return refs


def _find_custom_field(fields: list[dict[str, Any]], target_name: str) -> dict[str, Any] | None:
    for f in fields or []:
        if f.get("name", "").strip().lower() == target_name:
            return f
    return None


def _blank(v: Any) -> str | None:
    if v is None:
        return None
    trimmed = str(v).strip()
    return trimmed if trimmed != "" else None


def _num(v: Any) -> float | None:
    if v is None:
        return None
    if isinstance(v, float) and math.isnan(v):
        return None
    return v


def transform_issue(raw: dict[str, Any], user_map: dict[int, str]) -> Issue:
    """Maps a raw Redmine issue to the normalized internal Issue model. user_map
    resolves user id -> display name for custom fields that store raw user ids
    (e.g. Assigned QA)."""
    raw_custom_fields = raw.get("custom_fields") or []
    custom_fields = [CustomFieldValue(id=cf["id"], name=cf["name"], value=cf.get("value")) for cf in raw_custom_fields]

    assigned_qa_field = _find_custom_field(raw_custom_fields, KNOWN_CUSTOM_FIELD_NAMES["assignedQA"])
    platform_field = _find_custom_field(raw_custom_fields, KNOWN_CUSTOM_FIELD_NAMES["platform"])
    additional_assignee_field = _find_custom_field(raw_custom_fields, KNOWN_CUSTOM_FIELD_NAMES["additionalAssignee"])
    estimated_qa_field = _find_custom_field(raw_custom_fields, KNOWN_CUSTOM_FIELD_NAMES["estimatedTimeForQA"])

    return Issue(
        id=raw["id"],
        project=(raw.get("project") or {}).get("name", ""),
        tracker=(raw.get("tracker") or {}).get("name", ""),
        status=(raw.get("status") or {}).get("name", ""),
        statusIsClosed=bool((raw.get("status") or {}).get("is_closed")),
        priority=(raw.get("priority") or {}).get("name", ""),
        author=(raw.get("author") or {}).get("name", ""),
        subject=raw.get("subject", ""),
        description=_blank(raw.get("description")),
        doneRatio=raw.get("done_ratio", 0),
        createdOn=raw["created_on"],
        updatedOn=raw["updated_on"],
        assignedTo=_blank((raw.get("assigned_to") or {}).get("name")),
        targetVersion=_blank((raw.get("fixed_version") or {}).get("name")),
        startDate=_blank(raw.get("start_date")),
        dueDate=_blank(raw.get("due_date")),
        closedOn=_blank(raw.get("closed_on")),
        estimatedHours=_num(raw.get("estimated_hours")),
        spentHours=_num(raw.get("spent_hours")),
        totalSpentHours=_num(raw.get("total_spent_hours")),
        totalEstimatedHours=_num(raw.get("total_estimated_hours")),
        assignedQA=_resolve_custom_field_display(assigned_qa_field["value"], user_map) if assigned_qa_field else None,
        platform=_resolve_custom_field_display(platform_field["value"], user_map) if platform_field else None,
        additionalAssignee=_resolve_custom_field_display(additional_assignee_field["value"], user_map)
        if additional_assignee_field
        else None,
        additionalAssignees=_resolve_custom_field_user_refs(additional_assignee_field["value"], user_map)
        if additional_assignee_field
        else [],
        estimatedTimeForQA=_resolve_custom_field_display(estimated_qa_field["value"], user_map)
        if estimated_qa_field
        else None,
        customFields=custom_fields,
    )


def transform_time_entry(raw: dict[str, Any]) -> TimeEntry:
    return TimeEntry(
        id=raw["id"],
        project=(raw.get("project") or {}).get("name", ""),
        issueId=(raw.get("issue") or {}).get("id"),
        user=(raw.get("user") or {}).get("name", ""),
        activity=(raw.get("activity") or {}).get("name", ""),
        hours=raw["hours"],
        comments=_blank(raw.get("comments")),
        spentOn=raw["spent_on"],
    )
