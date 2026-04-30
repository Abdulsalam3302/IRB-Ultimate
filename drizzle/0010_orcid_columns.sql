DROP PROCEDURE IF EXISTS add_col_if_missing;
--> statement-breakpoint
CREATE PROCEDURE add_col_if_missing(IN tbl VARCHAR(64), IN col VARCHAR(64), IN ddl VARCHAR(255))
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema=DATABASE() AND table_name=tbl AND column_name=col) THEN
    SET @sql = CONCAT('ALTER TABLE `', tbl, '` ADD COLUMN ', ddl);
    PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
  END IF;
END;
--> statement-breakpoint
CALL add_col_if_missing('users', 'orcidId', '`orcidId` VARCHAR(19) NULL');--> statement-breakpoint
CALL add_col_if_missing('users', 'orcidVerified', '`orcidVerified` TINYINT(1) DEFAULT 0');--> statement-breakpoint
DROP PROCEDURE add_col_if_missing;
