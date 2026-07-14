-- Add chat activation lifecycle: chats start deactivated; the client activates
-- once connected (greeting is created on activation). Existing chats stay usable.
ALTER TABLE "Chat" ADD COLUMN "active" BOOLEAN NOT NULL DEFAULT false;

-- Existing chats were created under the old flow (greeting already sent) — mark active.
UPDATE "Chat" SET "active" = true;
