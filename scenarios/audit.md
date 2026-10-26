# Audit Log

Every audit entry records the actor, time, action, and before and after values.

### AUDIT-001: Match changes are audited
- **Given** a group
- **When** a match is created, edited, or deleted
- **Then** an audit entry is recorded for that match

### AUDIT-007: Batches are audited per match
- **Given** a batch of 6 matches
- **When** it is saved
- **Then** 6 audit entries are recorded, one per match

### AUDIT-008: Player and role changes are audited
- **Given** a group
- **When** a player is added, renamed, removed, or has their role changed
- **Then** an audit entry is recorded

### AUDIT-009: Settings and invite changes are audited
- **Given** a group
- **When** settings change or the invite link is created, regenerated, or revoked
- **Then** an audit entry is recorded

### AUDIT-010: Membership and ownership changes are audited
- **Given** a group
- **When** a player is claimed, created through joining, unlinked, or left, or ownership is transferred
- **Then** an audit entry is recorded

### AUDIT-002: Audit entries are written atomically with the change
- **Given** a change that fails or is rejected
- **When** the request completes
- **Then** no audit entry exists for it
- **And** every successful change has its audit entry

### AUDIT-003: Members can view the audit log
- **Given** a member of a group, of any role
- **When** they open the audit log
- **Then** they see entries newest first, described in plain language (e.g. "Alice changed the score of a match on Oct 12 from 11–7 to 11–8")

### AUDIT-004: The audit log is paginated
- **Given** a group with hundreds of audit entries
- **When** a member views the audit log
- **Then** entries are returned in pages, with older pages available on request

### AUDIT-005: The audit log is not public
- **Given** a public group
- **When** a non-member requests its audit log
- **Then** access is denied

### AUDIT-006: Audit entries cannot be edited or deleted
- **Given** any user, including the owner
- **When** they try to change or remove an audit entry
- **Then** there is no way to do so
