import math

from app.transform import transform_issue


def base_raw(**overrides):
    raw = {
        "id": 100,
        "project": {"id": 1, "name": "Proj"},
        "tracker": {"id": 1, "name": "Bug"},
        "status": {"id": 1, "name": "New", "is_closed": False},
        "priority": {"id": 2, "name": "Normal"},
        "author": {"id": 1, "name": "Author"},
        "subject": "Subject",
        "description": None,
        "done_ratio": 0,
        "created_on": "2026-01-01T00:00:00Z",
        "updated_on": "2026-01-01T00:00:00Z",
        "closed_on": None,
    }
    raw.update(overrides)
    return raw


class TestNullHandling:
    def test_converts_null_fields_to_none_never_string_placeholders(self):
        raw = base_raw(assigned_to=None, fixed_version=None, estimated_hours=None, spent_hours=None, description=None)
        issue = transform_issue(raw, {})
        assert issue.assignedTo is None
        assert issue.targetVersion is None
        assert issue.closedOn is None
        assert issue.estimatedHours is None
        assert issue.description is None
        for value in issue.model_dump().values():
            assert value != "null"
            assert value != "undefined"
            assert value != "NaN"

    def test_treats_blank_whitespace_strings_as_none(self):
        raw = base_raw(description="   ")
        issue = transform_issue(raw, {})
        assert issue.description is None

    def test_passes_through_nan_as_none_instead_of_nan(self):
        raw = base_raw(estimated_hours=math.nan)
        issue = transform_issue(raw, {})
        assert issue.estimatedHours is None


class TestCustomFieldResolution:
    def test_resolves_named_custom_field_dynamically_not_by_hardcoded_id(self):
        raw = base_raw(custom_fields=[{"id": 999, "name": "Assigned QA", "value": ["42"], "multiple": True}])
        issue = transform_issue(raw, {42: "Jane QA"})
        assert issue.assignedQA == "Jane QA"

    def test_falls_back_to_raw_value_when_user_id_not_in_membership_map(self):
        raw = base_raw(custom_fields=[{"id": 23, "name": "Assigned QA", "value": ["999"], "multiple": True}])
        issue = transform_issue(raw, {})
        assert issue.assignedQA == "999"

    def test_returns_none_when_known_custom_field_absent(self):
        raw = base_raw(custom_fields=[])
        issue = transform_issue(raw, {})
        assert issue.assignedQA is None
        assert issue.platform is None
        assert issue.additionalAssignee is None
        assert issue.estimatedTimeForQA is None

    def test_treats_empty_string_custom_field_value_as_blank(self):
        raw = base_raw(custom_fields=[{"id": 6, "name": "Estimated time for QA", "value": ""}])
        issue = transform_issue(raw, {})
        assert issue.estimatedTimeForQA is None

    def test_preserves_all_raw_custom_fields_for_future_extensibility(self):
        raw = base_raw(custom_fields=[{"id": 1, "name": "Testing Type", "value": ["QA"], "multiple": True}])
        issue = transform_issue(raw, {})
        assert len(issue.customFields) == 1
        assert issue.customFields[0].id == 1
        assert issue.customFields[0].name == "Testing Type"
        assert issue.customFields[0].value == ["QA"]

    def test_additional_assignees_structured_list_resolves_ids_and_names(self):
        raw = base_raw(custom_fields=[{"id": 3, "name": "Additional Assignee", "value": ["42", "99"], "multiple": True}])
        issue = transform_issue(raw, {42: "Jane QA", 99: "Amal Prasad"})
        assert [(r.id, r.name) for r in issue.additionalAssignees] == [(42, "Jane QA"), (99, "Amal Prasad")]
        # the existing comma-joined string stays intact alongside the new structured field
        assert issue.additionalAssignee == "Jane QA, Amal Prasad"

    def test_additional_assignees_empty_list_when_field_absent(self):
        raw = base_raw(custom_fields=[])
        issue = transform_issue(raw, {})
        assert issue.additionalAssignees == []

    def test_additional_assignees_skips_non_numeric_values(self):
        raw = base_raw(custom_fields=[{"id": 3, "name": "Additional Assignee", "value": ["not-a-user-id"], "multiple": True}])
        issue = transform_issue(raw, {})
        assert issue.additionalAssignees == []


class TestStatusIsClosed:
    def test_uses_status_is_closed_flag_not_fixed_status_id(self):
        closed_by_nonstandard_id = base_raw(status={"id": 10, "name": "Not a Defect", "is_closed": True})
        open_with_high_id = base_raw(status={"id": 99, "name": "Some Custom Status", "is_closed": False})
        assert transform_issue(closed_by_nonstandard_id, {}).statusIsClosed is True
        assert transform_issue(open_with_high_id, {}).statusIsClosed is False
