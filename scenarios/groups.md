# Groups

### GROUP-001: Creating a group makes the creator its owner

- **Given** a signed-in user
- **When** they create a group with a name, a team format, a scoring mode, and their own player name
- **Then** the group is created with those settings
- **And** a player with that name is created, linked to the user, with the owner role

### GROUP-002: Group defaults

- **Given** a signed-in user creating a group
- **When** they do not change optional settings
- **Then** the group is private, scoring is optional, ties are not allowed, and the default role for new players is recorder

### GROUP-003: Team format can be fixed or flexible

- **Given** a user creating a group
- **When** they choose a fixed format of T teams of S players, or a flexible format
- **Then** every match in the group must follow that format
- **And** a flexible format allows 2 or more teams of 1 or more players each

### GROUP-004: Team format cannot be changed after creation

- **Given** an existing group
- **When** an admin edits the group settings
- **Then** the team format cannot be changed

### GROUP-005: Admins can edit group settings

- **Given** a group
- **When** an admin changes the name, description, scoring mode, ties setting, default role, or visibility
- **Then** the changes are saved

### GROUP-010: The default role is recorder or viewer

- **Given** a group
- **When** an admin sets the default role to admin or owner
- **Then** the change is rejected

### GROUP-011: Changing settings doesn't invalidate existing matches

- **Given** a group with a tied match and matches without scores
- **When** an admin disallows ties and makes scoring required
- **Then** the existing matches remain and still count toward ratings
- **And** new matches must follow the new settings

### GROUP-012: Group names are limited in length

- **Given** a user creating or renaming a group
- **When** the name is empty after trimming or longer than 40 characters
- **Then** it is rejected

### GROUP-006: A user sees the groups they belong to

- **Given** a user linked to players in groups A and B
- **When** they open the home page
- **Then** they see groups A and B
- **And** they do not see groups they are not a member of

### GROUP-007: The owner can delete the group

- **Given** a group
- **When** the owner deletes it after explicitly confirming
- **Then** the group, its players, matches, and audit log are permanently removed

### GROUP-008: The owner can transfer ownership

- **Given** a group whose owner is Alice and a linked player Bob
- **When** Alice transfers ownership to Bob
- **Then** Bob becomes the owner
- **And** Alice becomes an admin

### GROUP-009: Ownership can only go to a linked player

- **Given** a group with an unclaimed player Carl
- **When** the owner tries to transfer ownership to Carl
- **Then** the transfer is rejected
