# Team Generator

Balance is measured as the sum over suggested matches of |P(team wins) − 1/number of teams| for each team, using predicted win probabilities. Lower is better. Equal scores are broken deterministically.

### TEAMS-001: Generating balanced teams from attendees
- **Given** a 2×2 group and 4 selected players
- **When** anyone who can view the group generates teams
- **Then** the most balanced split is suggested
- **And** each team's win probability is shown

### TEAMS-002: Multiple matches from a larger group
- **Given** a 2×2 group and 8 selected players
- **When** teams are generated
- **Then** the players are split into 2 matches with the lowest combined imbalance

### TEAMS-003: Extra players sit out, rotating on regenerate
- **Given** a 2×2 group and 10 selected players
- **When** teams are generated, then regenerated
- **Then** each suggestion has 2 matches and 2 players sitting out
- **And** each regeneration chooses sit-outs from those who have sat out the fewest times so far, then picks the most balanced split

### TEAMS-004: Regenerating without sit-outs gives the next-best option
- **Given** a suggestion where nobody sits out
- **When** the user regenerates
- **Then** the next most balanced distinct split is shown

### TEAMS-005: Unrated players are included
- **Given** selected players including one who has never played
- **When** teams are generated
- **Then** the new player is included using the initial rating

### TEAMS-006: Too few players
- **Given** fewer selected players than one match requires
- **When** a user tries to generate teams
- **Then** they are told how many more players are needed

### TEAMS-007: Flexible groups choose a format for generation
- **Given** a flexible group
- **When** a user generates teams
- **Then** they first choose the number of teams and team size for the suggestion

### TEAMS-008: Generation is fast
- **Given** 12 selected players in a 2×2 group
- **When** teams are generated in the test environment
- **Then** the suggestion is computed in under 200 ms
