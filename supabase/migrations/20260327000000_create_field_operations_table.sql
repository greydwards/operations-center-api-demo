-- Field operations table: stores harvest, seeding, application, and tillage operations
CREATE TABLE field_operations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  org_id text NOT NULL,
  jd_field_id text NOT NULL,
  jd_operation_id text NOT NULL,

  -- Operation metadata
  operation_type text NOT NULL,
  crop_season text,
  crop_name text,
  start_date timestamptz,
  end_date timestamptz,

  -- Varieties (first variety for display)
  variety_name text,

  -- Machines (first machine for display)
  machine_name text,
  machine_vin text,

  -- Harvest-specific aggregates (from measurementTypes API)
  area_value double precision,
  area_unit text,
  avg_yield_value double precision,
  avg_yield_unit text,
  avg_moisture double precision,
  total_wet_mass_value double precision,
  total_wet_mass_unit text,

  -- Full JD API response
  raw_response jsonb,

  -- Timestamps
  imported_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),

  UNIQUE(user_id, org_id, jd_operation_id)
);

CREATE INDEX idx_field_ops_user_org ON field_operations(user_id, org_id);
CREATE INDEX idx_field_ops_field ON field_operations(user_id, jd_field_id);
CREATE INDEX idx_field_ops_type ON field_operations(operation_type);

ALTER TABLE field_operations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own operations"
  ON field_operations FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own operations"
  ON field_operations FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own operations"
  ON field_operations FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own operations"
  ON field_operations FOR DELETE
  USING (auth.uid() = user_id);
