CREATE TABLE IF NOT EXISTS `session_revocations` (
  `tokenHash` varchar(64) NOT NULL,
  `expiresAt` bigint NOT NULL,
  PRIMARY KEY (`tokenHash`),
  KEY `idx_session_revocations_expiry` (`expiresAt`)
);
