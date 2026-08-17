-- CreateEnum
CREATE TYPE "NotationMode" AS ENUM ('PLAIN', 'COMPACT');

-- AlterTable
ALTER TABLE "user_preferences" ADD COLUMN     "notation_mode" "NotationMode" NOT NULL DEFAULT 'PLAIN';
