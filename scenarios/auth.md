# Auth

### AUTH-001: Signing in with Google creates an account
- **Given** a visitor who has never signed in
- **When** they sign in with Google
- **Then** a user account is created, identified by their Google account ID
- **And** they are signed in

### AUTH-002: Signing in again reuses the existing account
- **Given** a user who has signed in before
- **When** they sign in with the same Google account, even if its email has changed
- **Then** they are signed in to their existing account
- **And** no duplicate account is created

### AUTH-003: Sessions persist across visits
- **Given** a user who signed in less than 30 days ago
- **When** they return to the app
- **Then** they are still signed in

### AUTH-004: Signing out ends the session
- **Given** a signed-in user
- **When** they sign out
- **Then** their session is invalidated on the server
- **And** private pages require signing in again

### AUTH-005: Signing in returns the user to where they were going
- **Given** a signed-out visitor
- **When** they open a private page or an invite link and then sign in
- **Then** they are returned to that page

### AUTH-006: Return destinations are restricted to the app
- **Given** a sign-in request whose return destination is an external URL
- **When** sign-in completes
- **Then** the user is sent to the home page instead

### AUTH-007: Mutations require a signed-in user
- **Given** a signed-out visitor
- **When** they attempt any create, update, or delete request
- **Then** the request is rejected as unauthenticated

### AUTH-008: Test login does not exist in production
- **Given** the production deployment
- **When** anyone requests the test login endpoint
- **Then** it responds as not found
