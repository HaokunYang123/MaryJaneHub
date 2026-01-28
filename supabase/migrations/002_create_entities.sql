-- Create entities table for multi-tenant business organization
-- Cannabis flag determines 280E COGS vs Operating Expense treatment (ENT-02)

-- Function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Entities table - top-level tenant isolation unit
CREATE TABLE IF NOT EXISTS public.entities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  is_cannabis boolean NOT NULL DEFAULT false,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT entities_name_unique UNIQUE (name)
);

-- Comment explaining cannabis flag purpose
COMMENT ON COLUMN public.entities.is_cannabis IS 'Cannabis flag determines 280E COGS vs Operating Expense treatment';

-- Trigger to auto-update updated_at
CREATE TRIGGER update_entities_updated_at
  BEFORE UPDATE ON public.entities
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Enable Row Level Security (policies will be added in Plan 02)
ALTER TABLE public.entities ENABLE ROW LEVEL SECURITY;
