CREATE TABLE IF NOT EXISTS `request_limits` (
  `bucketKey` varchar(64) NOT NULL,
  `count` int NOT NULL DEFAULT 0,
  `expiresAt` bigint NOT NULL,
  PRIMARY KEY (`bucketKey`),
  KEY `idx_request_limits_expiry` (`expiresAt`)
);
