-- Add org_level for APAR hierarchy filtering.
-- Levels:
-- 1 = Faculty / Staff (lowest)
-- 2 = HOD / Lab Head
-- 3 = Dean / School Head
-- 4 = Director / Vice Chancellor (highest)

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS org_level integer NOT NULL DEFAULT 1;

COMMENT ON COLUMN users.org_level IS
  'APAR org level: 1=Faculty/Staff, 2=HOD/Lab Head, 3=Dean/School Head, 4=Director/Vice Chancellor';

