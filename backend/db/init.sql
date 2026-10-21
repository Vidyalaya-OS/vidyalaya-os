-- The app connects as sms_app. It owns its tables but is not a superuser and
-- has no BYPASSRLS, and tables use FORCE ROW LEVEL SECURITY, so the school
-- isolation policies always apply. CREATEDB lets the test runner make a test DB.
CREATE ROLE sms_app LOGIN PASSWORD 'sms_app' CREATEDB NOSUPERUSER NOBYPASSRLS;
CREATE DATABASE sms OWNER sms_app;
