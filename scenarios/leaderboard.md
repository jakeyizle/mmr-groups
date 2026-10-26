# Leaderboard & Match History

### BOARD-001: Leaderboard ranks players by displayed rating

- **Given** a group with rated players
- **When** the leaderboard is viewed
- **Then** players who have played are listed from highest to lowest displayed rating
- **And** each entry shows rating, provisional badge if applicable, matches played, and wins/losses/ties

### BOARD-002: Players who haven't played are listed separately

- **Given** a player with no matches
- **When** the leaderboard is viewed
- **Then** they appear in an "unrated" section below the ranked players

### BOARD-003: Leaderboard shows rank change from each player's latest match

- **Given** a player whose rank was 5th immediately before their most recent match and 3rd immediately after it
- **When** the leaderboard is viewed
- **Then** their entry shows a rise of 2 places

### BOARD-004: Match history lists matches newest first

- **Given** a group with matches
- **When** the match history is viewed
- **Then** matches are listed newest first by date-time, with teams, scores, and placement

### BOARD-005: Match history shows rating changes

- **Given** a match in the history
- **When** it is viewed
- **Then** each participant's displayed rating change from that match is shown (e.g. +14 / −9)

### BOARD-006: Match history can be filtered by player

- **Given** a group's match history
- **When** it is filtered to Dave
- **Then** only matches Dave played in are shown

### BOARD-007: Leaderboard reflects new matches once saved

- **Given** a recorder who just submitted matches
- **When** the save completes
- **Then** the leaderboard they see includes those matches
