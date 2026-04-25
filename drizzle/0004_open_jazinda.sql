CREATE TABLE `file_uploads` (
	`id` int AUTO_INCREMENT NOT NULL,
	`applicationId` int,
	`userId` int NOT NULL,
	`fileName` varchar(512) NOT NULL,
	`fileKey` varchar(512) NOT NULL,
	`fileUrl` text NOT NULL,
	`mimeType` varchar(128),
	`fileSize` int,
	`fileCategory` enum('questionnaire','supplementary','nbce_certificate','rejection_file','additional_document','other') NOT NULL DEFAULT 'other',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `file_uploads_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `applications` MODIFY COLUMN `status` enum('draft','declaration_pending','stage1_pending','stage1_failed','stage2_pending','stage2_failed','submitted','under_review','pending_admin','approved','rejected','resubmission_required','permanently_rejected','retracted','hidden') NOT NULL DEFAULT 'draft';--> statement-breakpoint
ALTER TABLE `notifications` MODIFY COLUMN `notifType` enum('application_submitted','ai_review_passed','ai_review_failed','committee_assigned','review_received','admin_approved','admin_rejected','resubmission_required','certificate_issued','review_assignment','review_reminder','retracted','general') NOT NULL DEFAULT 'general';--> statement-breakpoint
ALTER TABLE `applications` ADD `declarationHonesty` boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE `applications` ADD `declarationNbceCertification` boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE `applications` ADD `declarationConsentTruth` boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE `applications` ADD `declarationAcceptPolicy` boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE `applications` ADD `nbceCertificateUrl` text;--> statement-breakpoint
ALTER TABLE `applications` ADD `declarationCompletedAt` timestamp;--> statement-breakpoint
ALTER TABLE `applications` ADD `stage2AiFieldScores` text;--> statement-breakpoint
ALTER TABLE `applications` ADD `retractionReason` text;--> statement-breakpoint
ALTER TABLE `applications` ADD `retractionCertificateUrl` text;--> statement-breakpoint
ALTER TABLE `applications` ADD `retractedAt` timestamp;