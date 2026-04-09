/*
  # Fix field_operations date columns type

  ## Summary
  The start_date and end_date columns in field_operations were created as timestamptz,
  but the application code (TypeScript types and edge functions) treats them as text.
  John Deere returns dates as ISO strings which may not always be valid timestamps.

  ## Changes
  - `field_operations.start_date`: changed from timestamptz to text (nullable)
  - `field_operations.end_date`: changed from timestamptz to text (nullable)

  ## Notes
  - Uses ALTER COLUMN ... TYPE with USING cast to safely convert existing data
  - No data loss — existing timestamps are cast to their text representation
*/

ALTER TABLE field_operations
  ALTER COLUMN start_date TYPE text USING start_date::text,
  ALTER COLUMN end_date TYPE text USING end_date::text;
