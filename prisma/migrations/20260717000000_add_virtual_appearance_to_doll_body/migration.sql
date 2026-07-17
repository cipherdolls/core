-- Virtual doll bodies: an avatar without a physical body gets a virtual DollBody that
-- carries `appearance` (visual description) for text-to-image generation. Real bodies
-- can also set `appearance`; when a physical doll is connected it takes precedence.
ALTER TABLE "DollBody" ADD COLUMN "appearance" TEXT;
ALTER TABLE "DollBody" ADD COLUMN "virtual" BOOLEAN NOT NULL DEFAULT false;

-- Doll bodies keep a picture gallery (1:n) — each TTI generation adds a picture.
-- Other entities stay one-to-one.
DROP INDEX "Picture_dollBodyId_key";
