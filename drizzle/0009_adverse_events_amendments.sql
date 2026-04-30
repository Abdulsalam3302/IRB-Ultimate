CREATE TABLE IF NOT EXISTS `adverse_events` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `applicationId` INT NOT NULL,
  `reportedByUserId` INT NOT NULL,
  `occurredAt` TIMESTAMP NOT NULL,
  `severity` ENUM('mild','moderate','serious','life_threatening','fatal') NOT NULL,
  `expected` TINYINT(1) NOT NULL DEFAULT 0,
  `relatedToStudy` ENUM('unrelated','possibly','probably','definitely','unknown') NOT NULL,
  `description` TEXT NOT NULL,
  `actionTaken` TEXT,
  `outcome` ENUM('recovered','recovering','ongoing','permanent_disability','death','unknown'),
  `aeStatus` ENUM('reported','under_review','acknowledged','escalated','closed') NOT NULL DEFAULT 'reported',
  `adminNotes` TEXT,
  `createdAt` TIMESTAMP NOT NULL DEFAULT (NOW()),
  `updatedAt` TIMESTAMP NOT NULL DEFAULT (NOW()) ON UPDATE NOW(),
  INDEX `idx_ae_applicationId` (`applicationId`),
  INDEX `idx_ae_status` (`aeStatus`),
  INDEX `idx_ae_severity` (`severity`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `amendments` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `applicationId` INT NOT NULL,
  `requestedByUserId` INT NOT NULL,
  `amendmentType` ENUM('minor','moderate','major') NOT NULL DEFAULT 'minor',
  `title` VARCHAR(255) NOT NULL,
  `rationale` TEXT NOT NULL,
  `changedFieldsJson` TEXT,
  `amStatus` ENUM('submitted','under_review','approved','rejected') NOT NULL DEFAULT 'submitted',
  `adminNotes` TEXT,
  `decidedAt` TIMESTAMP NULL,
  `createdAt` TIMESTAMP NOT NULL DEFAULT (NOW()),
  `updatedAt` TIMESTAMP NOT NULL DEFAULT (NOW()) ON UPDATE NOW(),
  INDEX `idx_am_applicationId` (`applicationId`),
  INDEX `idx_am_status` (`amStatus`)
);
