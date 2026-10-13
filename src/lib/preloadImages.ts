// Resolve only after every image is decoded. Failed assets leave the boot
// timeout in charge rather than revealing a partially loaded radar early.
export async function preloadImages(urls: readonly string[]): Promise<void> {
  await Promise.all(
    [...new Set(urls)].map(async (url) => {
      const image = new Image();
      image.src = url;
      await image.decode();
    }),
  );
}
