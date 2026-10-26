# Roles & Permissions

Roles are hierarchical: owner ⊇ admin ⊇ recorder ⊇ viewer. "An admin" in any scenario means "an admin or the owner".

### ROLE-001: Roles are per group

- **Given** a user who is an admin in group A and a viewer in group B
- **When** they act in each group
- **Then** they have admin permissions in A and viewer permissions in B

### ROLE-002: Viewers can see but not record

- **Given** a viewer in a private group
- **When** they open the group
- **Then** they can see the leaderboard, matches, stats, audit log, and team generator
- **And** they cannot record, edit, or delete matches

### ROLE-003: Recorders can record and manage their own matches

- **Given** a recorder
- **When** they record a match
- **Then** the match is saved
- **And** they can edit or delete matches they recorded
- **And** they cannot edit or delete matches recorded by others

### ROLE-004: Admins can edit or delete any match

- **Given** an admin and a match recorded by someone else
- **When** the admin edits or deletes it
- **Then** the action succeeds

### ROLE-011: Admins can manage players

- **Given** an admin
- **When** they add, rename, or remove a player, or set a player's role to recorder or viewer
- **Then** the action succeeds

### ROLE-012: Admins can edit settings

- **Given** an admin
- **When** they change group settings
- **Then** the change succeeds

### ROLE-013: Admins can manage the invite link

- **Given** an admin
- **When** they create, regenerate, or revoke the invite link
- **Then** the action succeeds

### ROLE-005: Only the owner can grant or revoke admin

- **Given** an admin and a linked recorder Dave
- **When** the admin tries to make Dave an admin
- **Then** the change is rejected
- **And** when the owner makes Dave an admin, it succeeds

### ROLE-014: Unclaimed players cannot be admins

- **Given** an unclaimed player Sue
- **When** the owner tries to make Sue an admin
- **Then** the change is rejected

### ROLE-006: Only the owner can delete the group or transfer ownership

- **Given** an admin
- **When** they try to delete the group or transfer ownership
- **Then** the action is rejected

### ROLE-007: There is always exactly one owner

- **Given** a group other than the demo group, which has no owner
- **When** anyone tries to assign the owner role through role editing, or change the owner's role
- **Then** the change is rejected
- **And** ownership only changes through a transfer

### ROLE-008: Controls are hidden when not permitted

- **Given** a user without permission for an action
- **When** they view a page that offers that action
- **Then** the control for that action is not shown

### ROLE-009: Permissions are enforced by the server

- **Given** a user without permission for an action
- **When** they send the request directly to the API
- **Then** the request is rejected as forbidden

### ROLE-010: Site admins can act as owner in any group

- **Given** a site admin who is not a member of a private group
- **When** they open that group
- **Then** they can view it and perform any owner action except taking ownership
- **And** their actions are recorded in the audit log as theirs

### ROLE-015: Site admin status comes from configuration

- **Given** an email listed in the site admin configuration
- **When** the user with that verified Google email signs in
- **Then** they are a site admin
- **And** if the email is removed from the configuration, they stop being a site admin at their next sign-in
