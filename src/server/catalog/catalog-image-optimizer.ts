import sharp from "sharp";

export const OPTIMIZED_CATALOG_IMAGE_TYPE = "image/webp";
export const OPTIMIZED_CATALOG_IMAGE_QUALITY = 92;

function maximumWidth(purpose?: string) {
  if (purpose === "menu-logo") return 768;
  if (purpose === "menu-cover") return 2048;
  if (purpose === "category") return 1600;
  if (purpose === "product") return 1920;
  return 1920;
}

export async function optimizeCatalogImage(file: File, purpose?: string) {
  try {
    const source = Buffer.from(await file.arrayBuffer());
    const data = await sharp(source, { limitInputPixels: 40_000_000 })
      .rotate()
      .resize({
        width: maximumWidth(purpose),
        height: maximumWidth(purpose),
        fit: "inside",
        withoutEnlargement: true,
        kernel: sharp.kernel.lanczos3,
      })
      .sharpen({ sigma: 0.6, m1: 0.5, m2: 1.5 })
      .webp({
        quality: OPTIMIZED_CATALOG_IMAGE_QUALITY,
        effort: 4,
        smartSubsample: true,
      })
      .toBuffer();
    return { data, contentType: OPTIMIZED_CATALOG_IMAGE_TYPE };
  } catch {
    throw new Error("Não foi possível processar a imagem. Escolha outro arquivo.");
  }
}
