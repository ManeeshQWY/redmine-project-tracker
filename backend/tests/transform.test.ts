import { describe, it, expect } from "vitest";
import { transformIssue } from "../src/services/transform";
import { RedmineIssue } from "../src/types/redmine";

function baseRaw(overrides: Partial<RedmineIssue> = {}): RedmineIssue {
  return {
    id: 100,
    project: { id: 1, name: "Proj" },
    tracker: { id: 1, name: "Bug" },
    status: { id: 1, name: "New", is_closed: false },
    priority: { id: 2, name: "Normal" },
    author: { id: 1, name: "Author" },
    subject: "Subject",
    description: null,
    done_ratio: 0,
    created_on: "2026-01-01T00:00:00Z",
    updated_on: "2026-01-01T00:00:00Z",
    closed_on: null,
    ...overrides,
  } as RedmineIssue;
}

describe("transformIssue null handling", () => {
  it("converts null/undefined fields to null, never the strings 'null'/'undefined'/'NaN'", () => {
    const raw = baseRaw({
      assigned_to: undefined,
      fixed_version: undefined,
      estimated_hours: null,
      spent_hours: null,
      description: null,
    });
    const issue = transformIssue(raw, new Map());
    expect(issue.assignedTo).toBeNull();
    expect(issue.targetVersion).toBeNull();
    expect(issue.closedOn).toBeNull();
    expect(issue.estimatedHours).toBeNull();
    expect(issue.description).toBeNull();
    for (const value of Object.values(issue)) {
      expect(value).not.toBe("null");
      expect(value).not.toBe("undefined");
      expect(value).not.toBe("NaN");
    }
  });

  it("treats blank/whitespace strings as null", () => {
    const raw = baseRaw({ description: "   " });
    const issue = transformIssue(raw, new Map());
    expect(issue.description).toBeNull();
  });

  it("passes through NaN-producing numeric fields as null instead of NaN", () => {
    const raw = baseRaw({ estimated_hours: NaN });
    const issue = transformIssue(raw, new Map());
    expect(issue.estimatedHours).toBeNull();
  });
});

describe("transformIssue custom field resolution", () => {
  it("resolves a named custom field (Assigned QA) dynamically, not by hardcoded id", () => {
    const raw = baseRaw({
      custom_fields: [{ id: 999, name: "Assigned QA", value: ["42"], multiple: true }],
    });
    const userMap = new Map([[42, "Jane QA"]]);
    const issue = transformIssue(raw, userMap);
    expect(issue.assignedQA).toBe("Jane QA");
  });

  it("falls back to the raw value when the user id is not found in the membership map", () => {
    const raw = baseRaw({
      custom_fields: [{ id: 23, name: "Assigned QA", value: ["999"], multiple: true }],
    });
    const issue = transformIssue(raw, new Map());
    expect(issue.assignedQA).toBe("999");
  });

  it("returns null (blank) when a known custom field is absent from the issue", () => {
    const raw = baseRaw({ custom_fields: [] });
    const issue = transformIssue(raw, new Map());
    expect(issue.assignedQA).toBeNull();
    expect(issue.platform).toBeNull();
    expect(issue.additionalAssignee).toBeNull();
    expect(issue.estimatedTimeForQA).toBeNull();
  });

  it("treats an empty-string custom field value as blank", () => {
    const raw = baseRaw({
      custom_fields: [{ id: 6, name: "Estimated time for QA", value: "" }],
    });
    const issue = transformIssue(raw, new Map());
    expect(issue.estimatedTimeForQA).toBeNull();
  });

  it("preserves all raw custom fields in the customFields array for future extensibility", () => {
    const raw = baseRaw({
      custom_fields: [{ id: 1, name: "Testing Type", value: ["QA"], multiple: true }],
    });
    const issue = transformIssue(raw, new Map());
    expect(issue.customFields).toEqual([{ id: 1, name: "Testing Type", value: ["QA"] }]);
  });
});

describe("transformIssue status is_closed", () => {
  it("uses the status's is_closed flag rather than assuming a fixed status id", () => {
    const closedByNonstandardId = baseRaw({ status: { id: 10, name: "Not a Defect", is_closed: true } });
    const openWithHighId = baseRaw({ status: { id: 99, name: "Some Custom Status", is_closed: false } });
    expect(transformIssue(closedByNonstandardId, new Map()).statusIsClosed).toBe(true);
    expect(transformIssue(openWithHighId, new Map()).statusIsClosed).toBe(false);
  });
});
