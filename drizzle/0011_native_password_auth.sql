-- TiDB/MySQL 8+: ADD COLUMN IF NOT EXISTS (no stored procedures).
ALTER TABLE `users` ADD COLUMN IF NOT EXISTS `passwordHash` VARCHAR(255) NULL;
