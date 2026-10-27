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

### VIS-009: Anyone can browse an index of public groups

- **Given** public groups, private groups, and a public group with no matches
- **When** anyone, signed in or not, opens the public group index from the home page
- **Then** they see every public group that has at least one match, and no others
- **And** each shows its name, description, player count, match count, and when its latest match was played
- **And** recording, editing, or deleting matches and changing visibility are reflected on the next visit

### VIS-010: The index can be sorted

- **Given** the public group index
- **When** a visitor opens it
- **Then** groups are sorted by name, A to Z, ignoring case
- **And** they can instead sort by latest match played, match count, player count, or creation date, which start newest or largest first
- **And** any sort can be reversed

### VIS-011: The index can be searched by name

- **Given** the public group index
- **When** a visitor searches for part of a group's name, ignoring case
- **Then** only groups whose names contain it are listed, in the chosen sort

### VIS-012: The index is paged

- **Given** more public groups than fit on one page
- **When** a visitor loads more
- **Then** the next groups in the chosen sort appear
- **And** while the listed groups don't change, none are repeated or skipped, even when groups share a sort value

### VIS-013: Site admins can hide a group from the index

- **Given** a public group in the index
- **When** a site admin hides it
- **Then** it is no longer listed, but stays viewable by anyone with its link
- **And** its admins see in settings that it is hidden from the index
- **And** only site admins can hide or unhide a group
