# CivicPulse Schema & ER Diagram Overview

## Tables Included:
1. **users**: Stores user credentials, UUID, and roles.
2. **reports**: Core citizen submissions with PostGIS `geography(Point, 4326)` location, `client_uuid` (idempotency key), `gps_accuracy`, and `is_mock_location` flags.
3. **pins**: Clustered spatial markers for map rendering (`geography(Point)` with GIST index).
4. **pin_reports**: Many-to-many relationship mapping pins to raw reports.
5. **photos**: Evidence images linked to reports.
6. **missions**: Gamification targets for users.
7. **points_ledger**: Tracks reward points earned by users.
8. **coupons**: Redeemable user discount/reward items.
9. **admin_log**: Audit trail for administrative actions.