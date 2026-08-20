from app.routers.chat import _to_suggested_filter


class TestToSuggestedFilter:
    def test_empty_recorder_returns_none(self):
        assert _to_suggested_filter({}) is None

    def test_all_none_values_returns_none(self):
        recorder = {"assignee": None, "tracker": None, "status": None, "priority": None, "search": None}
        assert _to_suggested_filter(recorder) is None

    def test_maps_assignee_directly(self):
        recorder = {"assignee": "Alice", "tracker": None, "status": None, "priority": None, "search": None}
        assert _to_suggested_filter(recorder) == {"assignee": "Alice"}

    def test_wraps_tracker_as_single_item_list(self):
        recorder = {"assignee": None, "tracker": "Bug", "status": None, "priority": None, "search": None}
        assert _to_suggested_filter(recorder) == {"trackers": ["Bug"]}

    def test_combines_multiple_set_fields(self):
        recorder = {"assignee": "Alice", "tracker": "Bug", "status": "New", "priority": "High", "search": None}
        assert _to_suggested_filter(recorder) == {"assignee": "Alice", "trackers": ["Bug"], "status": "New", "priority": "High"}
