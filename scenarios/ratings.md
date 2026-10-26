# Ratings

Ratings are a function of (match history, rating settings, as-of time). Tests fix the as-of time.

### RATE-013: Default rating settings

- **Given** a newly created group
- **When** its rating settings are read
- **Then** they are: Plackett-Luce model, μ₀ 25, σ₀ 25/3, τ 25/300, decay d = 0.5 (σ² grows by d² per week inactive), display `round(1000 + 20 × (μ − 3σ))`, provisional when σ > 5, scores not used

### RATE-001: New players start with the default rating

- **Given** a newly added player
- **When** they have not played
- **Then** their rating is μ₀ and σ₀

### RATE-002: Ratings are derived from match history

- **Given** a group's match history and an as-of time
- **When** ratings are calculated
- **Then** they equal replaying every match in order with openskill
- **And** the same history and as-of time always give the same result

### RATE-003: Winning raises and losing lowers skill estimates

- **Given** two teams of new players
- **When** one team beats the other
- **Then** each winner's μ increases and each loser's μ decreases
- **And** every participant's σ decreases

### RATE-004: Upsets move ratings more than expected results

- **Given** a strong team and a weak team
- **When** the weak team wins
- **Then** the rating changes are larger than if the strong team had won

### RATE-005: Multi-team matches use placements

- **Given** a flexible group match with 4 teams placed 1st to 4th
- **When** ratings are calculated
- **Then** each team's update reflects its placement relative to every other team

### RATE-006: Ties are rated as ties

- **Given** a group that allows ties
- **When** two teams tie
- **Then** ratings are updated as a draw

### RATE-007: Inactivity increases uncertainty

- **Given** a player whose last match was 10 weeks before the as-of time
- **When** ratings are calculated
- **Then** their σ is √(σ² + 10 × 0.5²), capped at σ₀
- **And** their μ is unchanged by the inactivity

### RATE-014: Inactivity is applied before a player's next match

- **Given** a player who returns after 10 weeks away
- **When** their next match is rated
- **Then** the inactivity increase is applied to their σ before that match's update

### RATE-008: Inactive players stay on the leaderboard

- **Given** a player who hasn't played in months
- **When** the leaderboard is viewed
- **Then** they are still listed, with a lower displayed rating due to higher uncertainty

### RATE-009: Displayed rating is conservative

- **Given** a player's μ and σ
- **When** their rating is displayed
- **Then** it is `round(1000 + 20 × (μ − 3σ))`

### RATE-010: Uncertain ratings are marked provisional

- **Given** a player whose σ is above 5
- **When** their rating is displayed
- **Then** it is shown with a provisional badge

### RATE-011: Scores don't affect ratings

- **Given** two otherwise identical histories where A beat B 11–0 in one and 11–9 in the other
- **When** ratings are calculated
- **Then** the ratings are identical

### RATE-012: Each match records rating changes

- **Given** a match
- **When** ratings are calculated
- **Then** each participant's rating immediately before and after that match is available
