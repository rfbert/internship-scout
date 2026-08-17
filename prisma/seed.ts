/**
 * `prisma db seed` entrypoint. The seed itself lives in
 * `src/server/demo/seed.ts` so the demo reset endpoint can run exactly the same
 * code — see the note there.
 */
import { PrismaClient } from "@prisma/client";
import { seedAll } from "@/server/demo/seed";

const prisma = new PrismaClient();

seedAll(prisma)
  .then(() => console.log("Seed complete."))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => void prisma.$disconnect());
