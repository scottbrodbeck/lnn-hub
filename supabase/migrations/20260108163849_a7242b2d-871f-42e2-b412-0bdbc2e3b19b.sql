-- Add additional_request_data column to post_edit_requests for storing extra data
-- like author bio old/new values that don't fit in the standard columns
ALTER TABLE post_edit_requests 
ADD COLUMN IF NOT EXISTS additional_request_data jsonb DEFAULT NULL;