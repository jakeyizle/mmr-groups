# Visibility

### VIS-001: Private groups are indistinguishable from missing ones

- **Given** a private group
- **When** a non-member or signed-out visitor requests any of its pages or API endpoints
- **Then** they get the same not-found response as for a group that doesn't exist

### VIS-002: Public groups are viewable by anyone

- **Given** a public group
- **When** a signed-out visitor opens its URL
- **Then** they can view the leaderboard, match history, player profiles, group stats, and team generator

### VIS-003: Public groups are read-only to non-members

- **Given** a public group
- **When** a non-member views it
- **Then** no actions that change data are offered
- **And** such requests are rejected by the server

### VIS-006: Public data shows player names only

- **Given** a public group with players linked to users
- **When** a non-member views it
- **Then** no emails, Google names, avatars, user identifiers, invite codes, or who recorded each match are exposed

### VIS-007: Members never see other users' account details

- **Given** a member of a group
- **When** they view the group
- **Then** they see player names, roles, and whether each player is claimed
- **And** they do not see other users' emails, Google names, or avatars

### VIS-004: Changing visibility takes effect immediately

- **Given** a public group
- **When** an admin makes it private
- **Then** non-members immediately lose access

### VIS-005: A demo group is available

- **Given** a visitor on the home page
- **When** they open the demo group
- **Then** they see a public group of 12 players with 16 weeks of 2v2 matches, generated from a fixed seed
- **And** they don't need to sign in

### VIS-008: The demo group is read-only

- **Given** the demo group
- **When** anyone other than a site admin tries to change it
- **Then** the change is rejected
