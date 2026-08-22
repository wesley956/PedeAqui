import sharp from "sharp";

export const OPTIMIZED_CATALOG_IMAGE_TYPE = "image/webp";
export const OPTIMIZED_CATALOG_IMAGE_QUALITY = 82;

function maximumWidth(purpose?: string) {
  if (purpose === "menu-logo") return 512;
  if (purpose === "menu-cover") return 1920;
  if (purpose === "category") return 1200;
  return 1600;
}

export async function optimizeCatalogImage(file: File, purpose?: string) {
  try {
    const source = Buffer.from(await file.arrayBuffer());
    const data = await sharp(source, { limitInputPixels: 40_000_000 })
      .rotate()
      .resize({ width: maximumWidth(purpose), height: maximumWidth(purpose), fit: "inside", withoutEnlargement: true })
      .webp({ quality: OPTIMIZED_CATALOG_IMAGE_QUALITY, effort: 4 })
      .toBuffer();
    return { data, contentType: OPTIMIZED_CATALOG_IMAGE_TYPE };
  } catch {
    throw new Error("Não foi possível processar a imagem. Escolha outro arquivo.");
  }
}
