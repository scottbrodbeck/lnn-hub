-- Add columns to post_edit_requests to support date change requests
ALTER TABLE post_edit_requests 
ADD COLUMN request_type text NOT NULL DEFAULT 'edit',
ADD COLUMN assignment_id uuid REFERENCES post_assignments(id),
ADD COLUMN instance_date date,
ADD COLUMN old_due_date date,
ADD COLUMN new_due_date date;

-- Add index for efficient querying
CREATE INDEX idx_post_edit_requests_request_type ON post_edit_requests(request_type);
CREATE INDEX idx_post_edit_requests_assignment_id ON post_edit_requests(assignment_id);