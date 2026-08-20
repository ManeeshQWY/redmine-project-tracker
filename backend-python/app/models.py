"""Response models. Field names are deliberately camelCase (not idiomatic Python) so
the JSON they serialize to matches types/issue.ts on the frontend exactly — the existing
React app talks to this backend with zero changes."""

from pydantic import BaseModel


class CustomFieldValue(BaseModel):
    id: int
    name: str
    value: str | list[str] | None = None


class AssigneeRef(BaseModel):
    id: int
    name: str


class Issue(BaseModel):
    id: int
    parentId: int | None = None
    project: str
    tracker: str
    status: str
    statusIsClosed: bool
    priority: str
    author: str
    subject: str
    description: str | None = None
    doneRatio: int
    createdOn: str
    updatedOn: str
    assignedTo: str | None = None
    targetVersion: str | None = None
    startDate: str | None = None
    dueDate: str | None = None
    closedOn: str | None = None
    estimatedHours: float | None = None
    spentHours: float | None = None
    totalSpentHours: float | None = None
    totalEstimatedHours: float | None = None
    assignedQA: str | None = None
    platform: str | None = None
    additionalAssignee: str | None = None
    # Structured version of additionalAssignee, added for user-assignment analysis (needs
    # real ids to identify a user unambiguously). additionalAssignee (string) is kept
    # unchanged alongside this for backward compatibility with existing consumers
    # (TicketTable column, Excel export).
    additionalAssignees: list[AssigneeRef] = []
    estimatedTimeForQA: str | None = None
    customFields: list[CustomFieldValue] = []


class TimeEntry(BaseModel):
    id: int
    project: str
    issueId: int | None = None
    user: str
    activity: str
    hours: float
    comments: str | None = None
    spentOn: str


class StatusMeta(BaseModel):
    id: int
    name: str
    isClosed: bool


class TrackerMeta(BaseModel):
    id: int
    name: str


class PriorityMeta(BaseModel):
    id: int
    name: str


class ProjectMeta(BaseModel):
    id: int
    name: str
    identifier: str
    parent: str | None = None


class ProjectIssuesResult(BaseModel):
    issues: list[Issue]
    totalCount: int
    fetchedCount: int
    durationMs: int
    fetchedAt: str


class TimeEntriesResult(BaseModel):
    timeEntries: list[TimeEntry]
    totalCount: int
    durationMs: int
    fetchedAt: str


class MetaResult(BaseModel):
    statuses: list[StatusMeta]
    trackers: list[TrackerMeta]
    priorities: list[PriorityMeta]
    redmineBaseUrl: str


class CurrentUser(BaseModel):
    name: str
    login: str
    mail: str | None = None
