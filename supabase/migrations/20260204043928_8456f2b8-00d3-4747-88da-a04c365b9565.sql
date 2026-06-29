-- Modify item_id column to support composite IDs (e.g., "uuid_date" for recurring assignments)
ALTER TABLE admin_daily_checklist 
ALTER COLUMN item_id TYPE text USING item_id::text;

-- Add a comment for clarity
COMMENT ON COLUMN admin_daily_checklist.item_id IS 'Item identifier - can be a UUID for posts/blasts/sponsorships or a composite ID (uuid_date) for recurring assignment instances';