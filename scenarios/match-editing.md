# Match Editing

### EDIT-001: Changing participants updates ratings

- **Given** matches M1, M2, M3 in order, with Dave in M1
- **When** an admin replaces Dave with Dan in M1
- **Then** ratings equal replaying the corrected history from scratch

### EDIT-002: Changing the winner updates ratings

- **Given** a match without scores won by team A
- **When** an admin changes the winner to team B
- **Then** ratings equal replaying the history with B as the winner

### EDIT-003: Score edits that keep the same winner leave ratings unchanged

- **Given** a match A beat B 11–7
- **When** the score is corrected to 11–8
- **Then** the score is saved
- **And** all ratings are unchanged

### EDIT-004: Score edits that flip the winner update ratings

- **Given** a match A beat B 11–7
- **When** the score is corrected to 7–11
- **Then** B is ranked first
- **And** ratings equal replaying the history with B as the winner

### EDIT-005: Changing the date-time reorders matches

- **Given** matches M1, M2, M3 in order
- **When** M3's date-time is moved before M1
- **Then** ratings equal replaying the matches in the order M3, M1, M2

### EDIT-006: Editing notes leaves ratings unchanged

- **Given** a match
- **When** its notes are edited
- **Then** all ratings are unchanged

### EDIT-007: Deleting a match updates ratings

- **Given** matches M1, M2, M3
- **When** an admin deletes M2
- **Then** M2 is removed
- **And** ratings equal replaying M1 and M3 only

### EDIT-008: Changed fields are validated against current settings

- **Given** an existing match
- **When** an edit changes teams, scores, or placement in a way that breaks the current team format, scoring mode, or ties rule
- **Then** the edit is rejected and the match is unchanged

### EDIT-011: Unchanged fields don't need to meet newer settings

- **Given** a tied match recorded before ties were disallowed
- **When** an admin edits only its notes or date-time
- **Then** the edit is accepted

### EDIT-010: Stale edits are rejected

- **Given** two admins viewing the same version of a match
- **When** the first saves an edit and the second then saves a different edit
- **Then** the second edit is rejected because the match has changed
- **And** the second admin sees the current version

### EDIT-009: Edits and deletions are audited

- **Given** a match
- **When** it is edited or deleted
- **Then** the audit log records who did it, when, and the before and after values
