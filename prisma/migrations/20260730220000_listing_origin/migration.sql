-- First-class listing provenance. The daily agent uses this to exempt
-- user-created listings from rescoring, enrichment, dedupe mutation and
-- closure detection; inferring provenance from sources is not stable because
-- touchExisting can attach automated sightings to any listing.
CREATE TYPE "ListingOrigin" AS ENUM ('SCRAPED', 'MANUAL');

ALTER TABLE "internship_listings"
  ADD COLUMN "origin" "ListingOrigin" NOT NULL DEFAULT 'SCRAPED';

-- Backfill: a listing is MANUAL when it has at least one source and every
-- source is a manual kind. Safe only as a one-time backfill (see above).
UPDATE "internship_listings" l
SET "origin" = 'MANUAL'
WHERE EXISTS (SELECT 1 FROM "internship_sources" s WHERE s."listing_id" = l."id")
  AND NOT EXISTS (
    SELECT 1 FROM "internship_sources" s
    WHERE s."listing_id" = l."id"
      AND s."kind" NOT IN ('URL_IMPORT', 'CSV_IMPORT', 'MANUAL')
  );
