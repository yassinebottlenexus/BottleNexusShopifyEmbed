-- CreateTable
CREATE TABLE "BottleNexusSettings" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "brandToken" TEXT NOT NULL DEFAULT '',
    "buttonRadius" INTEGER NOT NULL DEFAULT 5,
    "buttonFontSize" INTEGER NOT NULL DEFAULT 16,
    "buttonWidth" INTEGER NOT NULL DEFAULT 250,
    "buttonText" TEXT NOT NULL DEFAULT 'Add to cart',
    "buttonTextColor" TEXT NOT NULL DEFAULT '#FFFFFF',
    "buttonBackground" TEXT NOT NULL DEFAULT '#27AE60',
    "emptyPluginThemeId" TEXT,
    "emptyPluginInstalledAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "BottleNexusSettings_shop_key" ON "BottleNexusSettings"("shop");
