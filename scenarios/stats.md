# Stats

Definitions used below:

- **Minimum shared matches:** partner, opponent, and duo stats only include pairings with at least 3 shared matches.
- **Win rate** counts ties as half a win. Ranking ties are broken by more shared matches, then name.
- **Streaks:** a win streak is consecutive wins; a loss or tie ends it.
- **Weeks** start Monday in the viewer's time zone.
- In matches with more than 2 teams, "win" means ranked first.

### STATS-001: Player rating over time

- **Given** a player with match history
- **When** their profile is viewed
- **Then** a chart shows their displayed rating after each match over time

### STATS-002: Player record and streaks

- **Given** a player with match history
- **When** their profile is viewed
- **Then** it shows wins, losses, ties, win rate, current streak, and longest win streak

### STATS-003: Best and worst partners

- **Given** a player who has played on teams with others
- **When** their profile is viewed
- **Then** it shows up to 3 partners with the highest and 3 with the lowest win rate together

### STATS-004: Head-to-head records

- **Given** a player who has played against others
- **When** their profile is viewed
- **Then** it shows their wins, losses, and ties against each opponent

### STATS-005: Recent matches on profile

- **Given** a player with match history
- **When** their profile is viewed
- **Then** their 10 most recent matches are listed with rating changes

### STATS-006: Group ratings over time

- **Given** a group with match history
- **When** group stats are viewed
- **Then** a chart shows each player's displayed rating over time

### STATS-007: Group activity

- **Given** a group with match history
- **When** group stats are viewed
- **Then** it shows matches per week for the last 12 weeks
- **And** the 5 players with the most matches in the last 30 days

### STATS-008: Best duos

- **Given** a group whose matches include teams of 2 or more
- **When** group stats are viewed
- **Then** it shows the 5 teammate pairs with the highest win rate together

### STATS-009: Biggest upsets

- **Given** a group with 2-team match history
- **When** group stats are viewed
- **Then** it lists the 5 matches where the winning team had the lowest predicted win probability immediately before the match

### STATS-010: Longest streaks

- **Given** a group with match history
- **When** group stats are viewed
- **Then** it lists the 5 longest win streaks and who holds them

### STATS-011: Rating distribution

- **Given** a group with rated players
- **When** group stats are viewed
- **Then** it shows a histogram of displayed ratings in buckets of 50

### STATS-013: Player names lead to their profile

- **Given** a player shown on the leaderboard, in a match, or in a stats list
- **When** their name is selected
- **Then** their profile opens

### STATS-014: Members can open their own profile

- **Given** a signed-in user linked to a player in the group
- **When** they view the group
- **Then** they can go directly to their own profile
