import json

from app.user_roles import USER_ROLES_FILE, load_user_roles


def write(tmp_path, content) -> "Path":
    p = tmp_path / "user_roles.json"
    p.write_text(content if isinstance(content, str) else json.dumps(content), encoding="utf-8")
    return p


def test_reads_developers_and_qa(tmp_path):
    result = load_user_roles(write(tmp_path, {"Developer": ["Dev Dan", "Dev Dee"], "QA": ["Quinn QA"]}))
    assert result.developers == ["Dev Dan", "Dev Dee"]
    assert result.qa == ["Quinn QA"]
    assert result.conflicts == []
    assert result.error is None


def test_keys_are_case_insensitive_and_comment_keys_are_ignored(tmp_path):
    result = load_user_roles(write(tmp_path, {"_comment": "note", "developer": ["A"], "qa": ["B"]}))
    assert result.developers == ["A"]
    assert result.qa == ["B"]
    assert result.error is None


def test_trims_blanks_and_drops_duplicates_ignoring_case(tmp_path):
    result = load_user_roles(write(tmp_path, {"Developer": ["  Dev Dan ", "dev dan", ""], "QA": []}))
    assert result.developers == ["Dev Dan"]


def test_a_person_under_both_roles_is_a_conflict_and_has_no_role(tmp_path):
    result = load_user_roles(write(tmp_path, {"Developer": ["Both", "Dev Dan"], "QA": ["both", "Quinn"]}))
    assert result.conflicts == ["Both"]
    assert result.developers == ["Dev Dan"]
    assert result.qa == ["Quinn"]


def test_missing_file_degrades_to_empty_with_an_error(tmp_path):
    result = load_user_roles(tmp_path / "nope.json")
    assert result.developers == [] and result.qa == []
    assert "not found" in result.error


def test_malformed_json_degrades_instead_of_raising(tmp_path):
    result = load_user_roles(write(tmp_path, "{ not json"))
    assert result.developers == [] and result.qa == []
    assert "could not be read" in result.error


def test_wrong_shapes_report_a_clear_error(tmp_path):
    assert "must be a JSON object" in load_user_roles(write(tmp_path, ["A"])).error
    assert "list of names" in load_user_roles(write(tmp_path, {"Developer": "A"})).error
    assert "unknown key" in load_user_roles(write(tmp_path, {"Manager": ["A"]})).error


def test_the_shipped_master_file_is_valid():
    result = load_user_roles(USER_ROLES_FILE)
    assert result.error is None
