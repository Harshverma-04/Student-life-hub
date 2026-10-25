-- Student Life Hub Database Schema (Supabase / PostgreSQL)
CREATE TABLE profiles (
    id UUID REFERENCES auth.users PRIMARY KEY,
    username TEXT UNIQUE,
    branch TEXT,
    semester INT,
    college TEXT,
    coins INT DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

CREATE TABLE coin_transactions (
    id SERIAL PRIMARY KEY,
    user_id UUID REFERENCES profiles(id),
    amount INT,
    reason TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);
