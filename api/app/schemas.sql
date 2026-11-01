-- Enable PostGIS extension for spatial data
CREATE EXTENSION IF NOT EXISTS postgis;

-- 1. Users Table
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    uuid UUID UNIQUE NOT NULL,
    username VARCHAR(100) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(50) DEFAULT 'citizen', -- citizen, admin, municipal_worker
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 2. Reports Table (Core citizen submissions for potholes, drainage, etc.)
CREATE TABLE reports (
    id SERIAL PRIMARY KEY,
    client_uuid UUID UNIQUE NOT NULL, -- Idempotency key to prevent duplicate submissions
    user_id INT REFERENCES users(id) ON DELETE SET NULL,
    hazard_type VARCHAR(50) NOT NULL, -- e.g., pothole, blocked_drain, waterlogging
    description TEXT,
    location GEOGRAPHY(Point, 4326) NOT NULL, -- PostGIS spatial point
    gps_accuracy FLOAT NOT NULL, -- GPS accuracy in meters
    is_mock_location BOOLEAN DEFAULT FALSE, -- Mock-location flag for anti-cheat
    status VARCHAR(50) DEFAULT 'reported', -- reported, verified, in_progress, resolved
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- GIST Index for high-performance spatial queries (`GET /pins?bbox=`)
CREATE INDEX idx_reports_location ON reports USING GIST (location);

-- 3. Pins Table (Clustered or canonical map markers for UI display)
CREATE TABLE pins (
    id SERIAL PRIMARY KEY,
    location GEOGRAPHY(Point, 4326) NOT NULL,
    hazard_type VARCHAR(50) NOT NULL,
    severity_score FLOAT DEFAULT 1.0,
    status VARCHAR(50) DEFAULT 'active',
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_pins_location ON pins USING GIST (location);

-- 4. Pin Reports (Many-to-Many mapping between aggregated pins and individual raw reports)
CREATE TABLE pin_reports (
    pin_id INT REFERENCES pins(id) ON DELETE CASCADE,
    report_id INT REFERENCES reports(id) ON DELETE CASCADE,
    PRIMARY KEY (pin_id, report_id)
);

-- 5. Photos Table (Evidence images attached to reports)
CREATE TABLE photos (
    id SERIAL PRIMARY KEY,
    report_id INT REFERENCES reports(id) ON DELETE CASCADE,
    image_url TEXT NOT NULL,
    uploaded_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 6. Missions (Gamification/cleanup missions for active citizens)
CREATE TABLE missions (
    id SERIAL PRIMARY KEY,
    title VARCHAR(150) NOT NULL,
    description TEXT,
    reward_points INT DEFAULT 50,
    target_location GEOGRAPHY(Point, 4326),
    radius_meters INT DEFAULT 100,
    is_active BOOLEAN DEFAULT TRUE
);

-- 7. Points Ledger (Tracking user gamification points and rewards earned)
CREATE TABLE points_ledger (
    id SERIAL PRIMARY KEY,
    user_id INT REFERENCES users(id) ON DELETE CASCADE,
    points INT NOT NULL,
    reason VARCHAR(100) NOT NULL, -- e.g., 'report_verified', 'mission_completed'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 8. Coupons (Redeemable rewards using points)
CREATE TABLE coupons (
    id SERIAL PRIMARY KEY,
    user_id INT REFERENCES users(id) ON DELETE CASCADE,
    coupon_code VARCHAR(100) UNIQUE NOT NULL,
    discount_details TEXT,
    is_redeemed BOOLEAN DEFAULT FALSE,
    expires_at TIMESTAMP WITH TIME ZONE
);

-- 9. Admin Log (Audit trail for administrative actions)
CREATE TABLE admin_log (
    id SERIAL PRIMARY KEY,
    admin_id INT REFERENCES users(id) ON DELETE SET NULL,
    action TEXT NOT NULL,
    target_entity VARCHAR(100),
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);