# Joining

### JOIN-001: Admins can create an invite link
- **Given** an admin in a group with no invite link
- **When** they create an invite link
- **Then** a link is generated that anyone can use to join the group

### JOIN-002: Invite links can have an expiry
- **Given** an admin creating an invite link
- **When** they set an expiry date
- **Then** the link stops working after that date

### JOIN-003: Regenerating or revoking the link invalidates the old one
- **Given** a group with an invite link
- **When** an admin regenerates or revokes it
- **Then** the old link no longer works

### JOIN-004: Opening an invite link requires sign-in
- **Given** a signed-out visitor with a valid invite link
- **When** they open it
- **Then** they are asked to sign in
- **And** they return to the invite after signing in

### JOIN-005: A joiner can claim an unclaimed player
- **Given** a group with unclaimed players Dave (recorder) and Sue (viewer)
- **When** a signed-in user uses the invite link and claims Dave
- **Then** they are linked to Dave immediately, with no approval
- **And** they have the recorder role in the group
- **And** they see Dave's existing matches and rating

### JOIN-006: A joiner who isn't listed can add themselves
- **Given** a group whose default role is recorder
- **When** a signed-in user uses the invite link to join as a new player named "Pat"
- **Then** a new player "Pat" is created, linked to them, with the recorder role

### JOIN-007: Claimed players are not offered to joiners
- **Given** a player Dave already linked to a user
- **When** another user opens the invite link
- **Then** Dave is not offered as a choice

### JOIN-013: Simultaneous claims of the same player
- **Given** two users who both open the invite link and choose Dave
- **When** both submit their claim
- **Then** the first claim succeeds
- **And** the second is rejected and that user is offered the remaining choices

### JOIN-008: Existing members are taken straight to the group
- **Given** a user already linked to a player in the group
- **When** they open the group's invite link
- **Then** they are taken to the group without claiming again

### JOIN-009: Invalid or expired links are reported as invalid
- **Given** an invite link that is revoked, expired, or never existed
- **When** someone opens it
- **Then** they are told the link is no longer valid, without any group details

### JOIN-010: Members can leave a group
- **Given** a non-owner user linked to Dave
- **When** they leave the group
- **Then** Dave becomes unclaimed and keeps their history
- **And** if Dave was an admin, Dave's role resets to the group's default role
- **And** the user no longer sees the group

### JOIN-011: The owner must transfer ownership before leaving
- **Given** the owner of a group
- **When** they try to leave
- **Then** it is rejected until ownership is transferred
