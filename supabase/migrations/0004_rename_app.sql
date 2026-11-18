-- Keeping Receipts: the app was renamed from "I Have Receipts" on Nov 18, 2026.
-- Only the display name changes; the app key stays 'receipts'.
update core.apps set name = 'Keeping Receipts' where key = 'receipts';
