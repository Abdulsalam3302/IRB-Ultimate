CREATE TABLE IF NOT EXISTS account_auth_state (
  userId INT NOT NULL PRIMARY KEY,
  version INT NOT NULL DEFAULT 0,
  CONSTRAINT account_auth_user FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS password_reset_tokens (
  tokenHash VARCHAR(64) NOT NULL PRIMARY KEY,
  userId INT NOT NULL,
  expiresAt TIMESTAMP NOT NULL,
  consumedAt TIMESTAMP NULL,
  createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX reset_user_idx(userId),
  INDEX reset_expiry_idx(expiresAt),
  CONSTRAINT password_reset_user FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
);
