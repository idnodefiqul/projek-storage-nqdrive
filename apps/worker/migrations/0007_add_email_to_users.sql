-- Migration: 0007_add_email_to_users.sql
-- Add email field to users table for setup

ALTER TABLE users ADD COLUMN email TEXT NOT NULL DEFAULT '';
