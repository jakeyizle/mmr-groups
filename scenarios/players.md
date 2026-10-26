# Players

### PLAYER-001: Admins can add players without accounts
- **Given** an admin in a group
- **When** they add players "Dave" and "Sue"
- **Then** both players exist in the group, unclaimed
- **And** they can be used in matches immediately

### PLAYER-002: New players get the group's default role
- **Given** a group whose default role is recorder
- **When** an admin adds a player without choosing a role
- **Then** the player's role is recorder

### PLAYER-003: Admins can pre-assign roles to unclaimed players
- **Given** an unclaimed player Sue
- **When** an admin sets Sue's role to viewer
- **Then** whoever claims Sue receives the viewer role

### PLAYER-004: Player names are unique within a group
- **Given** a group with a player "Dave"
- **When** an admin adds or renames a player to "dave"
- **Then** the change is rejected because the name is taken

### PLAYER-010: Player names are limited in length
- **Given** an admin adding or renaming a player
- **When** the name is empty after trimming or longer than 40 characters
- **Then** it is rejected

### PLAYER-005: Renaming a player keeps their history
- **Given** a player "Davd" with matches
- **When** an admin renames them to "Dave"
- **Then** all their matches show under "Dave"
- **And** their ratings are unchanged

### PLAYER-006: Players without matches can be removed
- **Given** a player with no matches
- **When** an admin removes them
- **Then** the player is deleted

### PLAYER-007: Players with matches cannot be removed
- **Given** a player who appears in at least one match
- **When** an admin tries to remove them
- **Then** the removal is rejected with an explanation

### PLAYER-008: Admins can unlink a non-admin player
- **Given** a recorder player Dave claimed by the wrong user
- **When** an admin unlinks Dave
- **Then** Dave becomes unclaimed and keeps their role and history
- **And** that user is no longer a member of the group

### PLAYER-011: Only the owner can unlink an admin
- **Given** an admin player Ann
- **When** another admin tries to unlink Ann
- **Then** the change is rejected
- **And** when the owner unlinks Ann, it succeeds and Ann's role resets to the group's default role

### PLAYER-012: The owner cannot be unlinked
- **Given** the owner's player
- **When** anyone tries to unlink it
- **Then** the change is rejected

### PLAYER-009: A user has at most one player per group
- **Given** a user already linked to Dave in a group
- **When** they try to claim or be linked to another player in the same group
- **Then** it is rejected

### PLAYER-013: A group has at most 200 players
- **Given** a group with 200 players
- **When** anyone adds another player
- **Then** it is rejected
