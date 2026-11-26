CREATE TABLE classroom_classes (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  title TEXT NOT NULL,
  join_code TEXT NOT NULL UNIQUE,
  object_key TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 0,
  archived INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
--> statement-breakpoint
CREATE INDEX classroom_owner ON classroom_classes(owner_id, updated_at);
--> statement-breakpoint
CREATE TABLE classroom_identities (
  class_id TEXT NOT NULL REFERENCES classroom_classes(id),
  member_id TEXT NOT NULL,
  name_key TEXT NOT NULL,
  pass_hash TEXT NOT NULL,
  PRIMARY KEY (class_id, member_id),
  UNIQUE (class_id, name_key)
);
--> statement-breakpoint
CREATE TABLE classroom_sessions (
  token_hash TEXT PRIMARY KEY,
  class_id TEXT NOT NULL REFERENCES classroom_classes(id),
  member_id TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE INDEX classroom_session_member ON classroom_sessions(class_id, member_id);
--> statement-breakpoint
CREATE TABLE classroom_rate_limits (
  bucket_key TEXT PRIMARY KEY,
  attempts INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
--> statement-breakpoint

