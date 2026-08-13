import { RedmineIssue, RedmineCustomField } from "../types/redmine";
import { CustomFieldValue, Issue } from "../types/issue";

// Known custom fields we surface as first-class columns. Matched by NAME
// (case-insensitive), never by hardcoded id, since custom field ids are
// instance-specific and were confirmed to vary (see README "API investigation").
// To add a new named custom field column later, just add an entry here and a
// matching property on the Issue type.
const KNOWN_CUSTOM_FIELD_NAMES = {
  assignedQA: "assigned qa",
  platform: "platform",
  additionalAssignee: "additional assignee",
  estimatedTimeForQA: "estimated time for qa",
} as const;

const isNumericId = (v: string) => /^\d+$/.test(v.trim());

/** Resolves a raw custom field value to a display string, mapping numeric user ids to names where known. */
function resolveCustomFieldDisplay(value: string | string[] | null, userMap: Map<number, string>): string | null {
  if (value === null || value === undefined) return null;
  const values = Array.isArray(value) ? value : [value];
  const resolved = values
    .filter((v) => v !== "" && v !== null && v !== undefined)
    .map((v) => (isNumericId(v) && userMap.has(Number(v)) ? userMap.get(Number(v))! : v));
  return resolved.length > 0 ? resolved.join(", ") : null;
}

function findCustomField(fields: RedmineCustomField[] | undefined, targetName: string): RedmineCustomField | undefined {
  return fields?.find((f) => f.name.trim().toLowerCase() === targetName);
}

function blank(v: string | null | undefined): string | null {
  if (v === null || v === undefined) return null;
  const trimmed = String(v).trim();
  return trimmed === "" ? null : trimmed;
}

function num(v: number | null | undefined): number | null {
  return v === null || v === undefined || Number.isNaN(v) ? null : v;
}

/** Maps a raw Redmine issue to the normalized internal Issue model. userMap resolves user id -> display name for custom fields that store raw user ids (e.g. Assigned QA). */
export function transformIssue(raw: RedmineIssue, userMap: Map<number, string>): Issue {
  const customFields: CustomFieldValue[] = (raw.custom_fields ?? []).map((cf) => ({
    id: cf.id,
    name: cf.name,
    value: cf.value,
  }));

  const assignedQAField = findCustomField(raw.custom_fields, KNOWN_CUSTOM_FIELD_NAMES.assignedQA);
  const platformField = findCustomField(raw.custom_fields, KNOWN_CUSTOM_FIELD_NAMES.platform);
  const additionalAssigneeField = findCustomField(raw.custom_fields, KNOWN_CUSTOM_FIELD_NAMES.additionalAssignee);
  const estimatedQAField = findCustomField(raw.custom_fields, KNOWN_CUSTOM_FIELD_NAMES.estimatedTimeForQA);

  return {
    id: raw.id,
    project: raw.project?.name ?? "",
    tracker: raw.tracker?.name ?? "",
    status: raw.status?.name ?? "",
    statusIsClosed: Boolean(raw.status?.is_closed),
    priority: raw.priority?.name ?? "",
    author: raw.author?.name ?? "",
    subject: raw.subject ?? "",
    description: blank(raw.description ?? null),
    doneRatio: raw.done_ratio ?? 0,
    createdOn: raw.created_on,
    updatedOn: raw.updated_on,
    assignedTo: blank(raw.assigned_to?.name ?? null),
    targetVersion: blank(raw.fixed_version?.name ?? null),
    startDate: blank(raw.start_date ?? null),
    dueDate: blank(raw.due_date ?? null),
    closedOn: blank(raw.closed_on ?? null),
    estimatedHours: num(raw.estimated_hours ?? null),
    spentHours: num(raw.spent_hours ?? null),
    totalSpentHours: num(raw.total_spent_hours ?? null),
    totalEstimatedHours: num(raw.total_estimated_hours ?? null),
    assignedQA: assignedQAField ? resolveCustomFieldDisplay(assignedQAField.value, userMap) : null,
    platform: platformField ? resolveCustomFieldDisplay(platformField.value, userMap) : null,
    additionalAssignee: additionalAssigneeField ? resolveCustomFieldDisplay(additionalAssigneeField.value, userMap) : null,
    estimatedTimeForQA: estimatedQAField ? resolveCustomFieldDisplay(estimatedQAField.value, userMap) : null,
    customFields,
  };
}
