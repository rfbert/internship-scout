-- AlterTable
ALTER TABLE "user_preferences" DROP COLUMN "analysis_version",
ADD COLUMN     "band_thresholds" JSONB,
ADD COLUMN     "role_alignment_scores" JSONB,
ADD COLUMN     "sponsorship_required" BOOLEAN DEFAULT true,
ADD COLUMN     "target_season" TEXT;

