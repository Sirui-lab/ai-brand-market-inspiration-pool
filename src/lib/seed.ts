import { prisma } from "@/lib/db";
import { DISPLAY_BRANDS } from "@/lib/brand-config";
import { PLATFORMS } from "@/lib/platform-config";

export async function ensureBaselineData() {
  for (const platform of PLATFORMS) {
    await prisma.platform.upsert({
      where: { slug: platform.slug },
      create: platform,
      update: { displayName: platform.displayName, isActive: true }
    });
  }

  for (const brand of DISPLAY_BRANDS) {
    await prisma.brand.upsert({
      where: { slug: brand.slug },
      create: {
        slug: brand.slug,
        displayName: brand.displayName,
        aliasesJson: JSON.stringify(brand.aliases)
      },
      update: {
        displayName: brand.displayName,
        aliasesJson: JSON.stringify(brand.aliases),
        isActive: true
      }
    });
  }
}
