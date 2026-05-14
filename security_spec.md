# Security Specification for SaccoConnect

## Data Invariants
1. A user can only be created by themselves upon first login, but their `role` must default to 'member'. Promotion to 'treasurer' must be a manual/admin-only action (simulated via an `admins` collection or pre-configured UID).
2. Transactions must have a valid `userId` pointing to an existing user.
3. Fines (200ksh) can only be added by a treasurer.
4. Members can only view their own transactions and profile.
5. All users can view announcements and global settings.

## The Dirty Dozen Payloads (Denial Expected)
1. **Self-Promotion**: Member attempts to update their own `role` to 'treasurer'.
2. **Identity Spoofing**: Member 'A' attempts to create a transaction for Member 'B'.
3. **Price Manipulation**: Member attempts to add a transaction with a negative amount (theft).
4. **Settings Hijack**: Member attempts to change dividend rates in `/settings/global`.
5. **Unauthorized Announcement**: Member attempts to post an announcement.
6. **Balance Tampering**: Member attempts to increment their own `balance` without a valid transaction.
7. **Cross-User Snooping**: Member 'A' attempts to 'get' Member 'B's profile.
8. **Shadow Field Injection**: User attempts to create a profile with an `isAdmin: true` field.
9. **Debt Erasure**: Member attempts to update their `totalDebt` to 0.
10. **Timestamp Manipulation**: User attempts to set a `createdAt` in the future.
11. **ID Poisoning**: User attempts to create a document with a 2MB string as ID.
12. **Status Bypass**: Member attempts to mark a 'pending' transaction as 'completed'.

## Red Team Evaluation
| Collection | Identity Spoofing | State Shortcutting | Resource Poisoning |
| :--- | :--- | :--- | :--- |
| users | Protected via `request.auth.uid` check | Role is immutable for users | `isValidId` and size checks |
| transactions | `userId == auth.uid` for members | Status restricted to treasurer action | Size checks on description |
| announcements | Restricted to `isTreasurer()` | N/A | Size checks on content |
| settings | Restricted to `isTreasurer()` | N/A | N/A |
