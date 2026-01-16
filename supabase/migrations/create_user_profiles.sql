-- Create user_profiles table for Jane AI's memory (Jarvis Mode)
-- Run this in your Supabase SQL editor

CREATE TABLE IF NOT EXISTS user_profiles (
  id TEXT PRIMARY KEY,
  profile_data JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_user_profiles_updated_at ON user_profiles(updated_at);

-- Enable RLS (Row Level Security)
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

-- Create policy to allow service role full access (since we use service role key)
CREATE POLICY "Service role has full access to user_profiles"
  ON user_profiles
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Insert default profile for Mary (optional - will be auto-created on first use)
INSERT INTO user_profiles (id, profile_data, created_at, updated_at)
VALUES (
  'mary_primary',
  '{
    "personal": {
      "name": "Mary",
      "age": 70,
      "location": "California",
      "timezone": "America/Los_Angeles"
    },
    "businesses": {
      "dispensaries": [
        {"name": "Green Leaf Wellness", "location": "Santa Ana", "notes": "Flagship location"},
        {"name": "Green Leaf Wellness", "location": "Long Beach"},
        {"name": "Green Leaf Wellness", "location": "Palm Springs"}
      ],
      "rentalProperties": [
        {"name": "Riverside Property", "location": "Riverside, CA", "type": "Multi-family", "units": 8},
        {"name": "Corona Property", "location": "Corona, CA", "type": "Multi-family", "units": 12},
        {"name": "Anaheim Property", "location": "Anaheim, CA", "type": "Single Family"},
        {"name": "Ontario Property", "location": "Ontario, CA", "type": "Commercial/Retail"}
      ],
      "otherBusinesses": []
    },
    "preferences": {
      "communicationStyle": "warm but efficient",
      "preferredName": "Mary",
      "favoriteTopics": [],
      "dislikedTopics": []
    },
    "contacts": [],
    "schedule": {
      "recurringEvents": [],
      "upcomingEvents": [],
      "reminders": []
    },
    "financial": {
      "reportingPreferences": ["monthly P&L", "cash position"]
    },
    "memories": [],
    "conversationInsights": {
      "frequentQuestions": [],
      "commonTasks": [],
      "lastTopics": []
    },
    "metadata": {
      "profileVersion": 1,
      "lastUpdated": "2024-01-01T00:00:00.000Z",
      "createdAt": "2024-01-01T00:00:00.000Z"
    }
  }'::jsonb,
  NOW(),
  NOW()
)
ON CONFLICT (id) DO NOTHING;
