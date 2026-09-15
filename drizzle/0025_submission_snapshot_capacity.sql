-- Full accepted protocols can exceed TEXT's 64KiB byte limit, especially in Arabic.
-- Preserve the complete immutable submission; do not truncate it to fit AI context.
ALTER TABLE `application_versions` MODIFY COLUMN `snapshot` mediumtext NOT NULL;
