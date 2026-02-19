-- Migration 012: Add meta_images column to diamonds table
ALTER TABLE diamonds ADD COLUMN IF NOT EXISTS meta_images JSONB;
