# Security Specification (`security_spec.md`) — تطبيق الكابتن

## 1. Data Invariants

1. **Global Default Deny**: Any path not explicitly matched (`/admins/{adminId}`, `/users/{userId}`, `/drivers/{driverId}`, `/rideRequests/{requestId}`, `/rideContacts/{requestId}`, `/chatRateLimits/{userId}`, `/orders/{orderId}/messages/{messageId}`) is unconditionally denied (`allow read, write: if false`).
2. **Customer Anonymous Auth & Captain/Admin Verified Identity**:
   - Customers authenticate seamlessly via Firebase Anonymous Authentication (`isSignedIn()`), allowing them to create their own customer profile (`/users/{uid}` with `accountType == 'customer'` and `role == 'customer'`), create ride requests (`customerId == request.auth.uid`), cancel their own ride requests, and chat with their assigned driver.
   - Captains (`/drivers/{driverId}` and driver actions on `/rideRequests/{requestId}`) and Admins (`/admins/{adminId}`) MUST be authenticated with a verified Google email (`request.auth.token.email_verified == true`).
3. **Strict Path ID Guard**: Every single-document operation (`get`, `create`, `update`, `delete`) validates path IDs via `isValidId(id)` (`^[a-zA-Z0-9_\-]+$`, length 1..128).
4. **User Profile Ownership & PII Isolation (`/users/{userId}`)**:
   - Users can only `get`, `list`, `create`, or `update` their own profile (`userId == request.auth.uid`), unless `isAdmin()`.
   - Non-admin users can never set `role == 'admin'`. Anonymous users can only set `role == 'customer'` and `accountType == 'customer'`.
5. **Driver Approval System (`/drivers/{driverId}`)**:
   - A Captain profile can only be created by a verified user (`isVerifiedUser()`) for their own `uid` (`driverId == request.auth.uid`) and requires a corresponding `/users/$(request.auth.uid)` document to exist.
   - **Mandatory Pending Onboarding**: Every newly created `drivers/{driverId}` document MUST have `approvalStatus == 'pending'`, `online == false`, and `available == false`. A user cannot self-approve their Captain account.
   - **Admin-Only Approval / Rejection**: Only an Admin (`isAdmin()`) can transition `approvalStatus` to `'approved'` or `'rejected'`.
   - **Approved-Only Online & Broadcast**: A Captain can only set `online == true`, `available == true`, or update live coordinates while `existing().approvalStatus == 'approved'` and `incoming().approvalStatus == 'approved'`.
   - **Public Discovery Restricted to Approved Online Captains**: Non-owner users can only `get` or `list` driver documents where `resource.data.online == true && resource.data.approvalStatus == 'approved'`.
6. **Ride Request Integrity & Atomic Acceptance (`/rideRequests/{requestId}`)**:
   - On `create`: `customerId == request.auth.uid`, `status == 'pending'`, `customerContact == ''` (phone isolated in `/rideContacts/{requestId}`), `pickupLat` in `[-90, 90]`, `pickupLng` in `[-180, 180]`, and all driver fields (`driverId`, `driverName`, `driverCode`, `driverPhone`, `driverContact`, `plateNumber`, `driverRole`) must be empty `''` with `etaMinutes == 0`.
   - On `update` (Action 2 — Driver Accepts): Only an **approved** and **online** verified Captain (`isVerifiedUser() && exists(/drivers/$(request.auth.uid)) && get(/drivers/$(request.auth.uid)).data.approvalStatus == 'approved' && get(/drivers/$(request.auth.uid)).data.online == true`) can transition `status` from `'pending'` to `'accepted'` and bind `driverId == request.auth.uid`.
   - Terminal State Lock: Once `status` reaches `'completed'` or `'cancelled'`, no non-admin updates are permitted.
7. **Customer Phone Isolation (`/rideContacts/{requestId}`)**:
   - Created atomically with `/rideRequests/{requestId}` (`existsAfter`).
   - Readable only by the customer (`customerId == request.auth.uid`), an admin (`isAdmin()`), or the assigned driver (`get(/rideRequests/$(requestId)).data.driverId == request.auth.uid`) while the order status is `'accepted'`, `'on_the_way'`, or `'arrived'`.
8. **Order Chat & Rate Limiting (`/orders/{orderId}/messages/{messageId}` & `/chatRateLimits/{userId}`)**:
   - Only the customer or assigned driver of an order in `'accepted'` or `'on_the_way'` status can send messages, rate-limited to 1 message per second via `/chatRateLimits/{userId}`.

## 2. The "Dirty Dozen" Payloads

1. **Unapproved Captain Self-Approval on Create**: Creating `/drivers/{uid}` with `approvalStatus: 'approved'` or `online: true` -> `PERMISSION_DENIED`.
2. **Pending Captain Going Online**: Updating `/drivers/{uid}` from `approvalStatus: 'pending'` to `online: true` -> `PERMISSION_DENIED`.
3. **Pending Captain Self-Promoting to Approved**: Updating `/drivers/{uid}` with `approvalStatus: 'approved'` by non-admin owner -> `PERMISSION_DENIED`.
4. **Unapproved Captain Accepting Ride Request**: Updating `/rideRequests/{reqId}` to `status: 'accepted'` when `/drivers/{uid}.approvalStatus == 'pending'` -> `PERMISSION_DENIED`.
5. **Shadow Field Injection**: Writing `isVerified: true` to `/users/{uid}`, `/drivers/{uid}`, or `/rideRequests/{reqId}` -> `PERMISSION_DENIED`.
6. **Privilege Escalation on User Profile**: Creating or updating `/users/{uid}` with `role: 'admin'` by non-admin -> `PERMISSION_DENIED`.
7. **Anonymous User Claiming Driver Role**: Anonymous user creating `/users/{uid}` with `accountType: 'driver'` or creating `/drivers/{uid}` -> `PERMISSION_DENIED`.
8. **Identity Spoofing on Ride Creation**: Creating `/rideRequests/{reqId}` with `customerId` different from `request.auth.uid` -> `PERMISSION_DENIED`.
9. **Terminal State Mutation**: Updating `/rideRequests/{reqId}` after `status == 'completed'` or `'cancelled'` -> `PERMISSION_DENIED`.
10. **PII Scraping on `/users` or `/rideContacts`**: Reading another user's `/users/{otherUid}` or pending `/rideContacts/{reqId}` -> `PERMISSION_DENIED`.
11. **Client Timestamp Forgery**: Writing past/future `createdAt` or `updatedAt` (`!= request.time`) -> `PERMISSION_DENIED`.
12. **Chat Flooding / Empty Message**: Sending a second chat message within `< 1s` or whitespace-only text -> `PERMISSION_DENIED`.
