# Match Entry

### MATCH-001: Recording a single match

- **Given** a 2×2 group with players A, B, C, D
- **When** a recorder submits a match: A & B vs C & D, 11–7
- **Then** the match is saved with the team assignments, scores, and recorder
- **And** A & B are ranked first
- **And** ratings reflect the match

### MATCH-002: Recording several matches in one submit

- **Given** a group
- **When** a recorder submits 6 matches at once, each with any of the group's players
- **Then** all 6 matches are saved
- **And** ratings reflect all 6 in order

### MATCH-003: A batch is saved all-or-nothing

- **Given** a batch where one match is invalid
- **When** it is submitted
- **Then** no matches from the batch are saved
- **And** the invalid match is identified

### MATCH-021: A batch has at most 50 matches

- **Given** a batch of 51 matches
- **When** it is submitted
- **Then** it is rejected

### MATCH-004: New rows can start from the previous row's players

- **Given** a batch with a completed match
- **When** the recorder adds the next match based on it
- **Then** the new match has the same players on the same teams, with no scores

### MATCH-005: Rows default to a stable order

- **Given** a new batch
- **When** the recorder adds matches without editing dates
- **Then** the first match's date-time defaults to now and each next one is one minute later
- **And** the recorder can change any match's date-time

### MATCH-020: Date-times are local and cannot be far in the future

- **Given** a recorder entering a match date-time in their local time
- **When** it is submitted
- **Then** it is stored as the equivalent UTC instant
- **And** a date-time more than 24 hours in the future is rejected

### MATCH-006: Matches are ordered by date-time

- **Given** matches recorded out of order
- **When** ratings are calculated
- **Then** matches are applied in order of their date-time
- **And** matches with the same date-time are applied in the order they were first created, regardless of later edits

### MATCH-007: Team format is enforced

- **Given** a 2×2 group
- **When** a match has a team with 1 or 3 players, or 3 teams
- **Then** it is rejected

### MATCH-008: Flexible groups accept uneven teams

- **Given** a flexible group
- **When** a match is recorded as A vs B & C
- **Then** it is accepted

### MATCH-022: Flexible matches have at most 8 teams of 8 players

- **Given** a flexible group
- **When** a match has 9 teams, or a team of 9 players
- **Then** it is rejected

### MATCH-009: A player can appear only once per match

- **Given** a match
- **When** the same player is placed twice, on the same or different teams
- **Then** it is rejected

### MATCH-010: Required scoring

- **Given** a group whose scoring mode is required
- **When** a match is submitted without scores for every team
- **Then** it is rejected

### MATCH-017: Optional scoring

- **Given** a group whose scoring mode is optional
- **When** matches are submitted with and without scores
- **Then** both are accepted

### MATCH-018: No scoring

- **Given** a group whose scoring mode is none
- **When** a match is submitted with scores
- **Then** it is rejected

### MATCH-023: Scores are whole numbers from 0 to 999

- **Given** a group that records scores
- **When** a match has a negative, fractional, or greater-than-999 score
- **Then** it is rejected

### MATCH-011: Placement is derived from scores

- **Given** a match with scores for every team, with any number of teams
- **When** it is submitted
- **Then** teams are ranked by score, highest first

### MATCH-012: Placement is chosen when there are no scores

- **Given** a match without scores
- **When** it is recorded
- **Then** the recorder chooses the winner, or the placement of each team when there are more than 2

### MATCH-013: Ties are rejected when not allowed

- **Given** a group that does not allow ties
- **When** a match is submitted with equal scores or equal placements
- **Then** it is rejected

### MATCH-019: Ties are accepted when allowed

- **Given** a group that allows ties
- **When** a match is submitted with two teams on equal scores
- **Then** it is accepted with the tied teams sharing a rank

### MATCH-014: Unsaved batches survive a reload

- **Given** a recorder partway through a batch
- **When** the page reloads
- **Then** the matches they entered are restored
- **And** the draft is cleared after a successful submit

### MATCH-015: Players can be added during entry

- **Given** an admin entering a batch
- **When** a player isn't in the group yet
- **Then** they can add the player and continue the batch without losing entered matches

## Stretch

### MATCH-016: Win probability preview

- **Given** a match being entered with complete teams
- **When** the recorder views it
- **Then** each team's predicted win probability is shown
