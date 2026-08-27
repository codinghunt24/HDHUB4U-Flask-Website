import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";
import {
  compressMediaImage,
  getMediaFile,
  getPublicMediaUrl,
  isMediaAssetId,
  isInternalMediaPath,
  openMediaAsset,
  persistMediaAsset,
} from "./media-storage";

test("compresses decoded images to bounded WebP media", async () => {
  const input = await sharp({
    create: {
      width: 2400,
      height: 1200,
      channels: 3,
      background: { r: 16, g: 20, b: 29 },
    },
  })
    .png()
    .toBuffer();

  const output = await compressMediaImage(input, 800);
  const metadata = await sharp(output.body).metadata();
  assert.equal(metadata.format, "webp");
  assert.equal(metadata.width, 800);
  assert.equal(metadata.height, 400);
  assert.equal(output.width, 800);
  assert.equal(output.height, 400);
});

test("rejects an invalid image before it can enter storage", async () => {
  await assert.rejects(
    compressMediaImage(Buffer.from("not an image")),
    /Input buffer contains unsupported image format/,
  );
});

test("only known internal object paths become public image URLs", () => {
  const assetPath = `/objects/post-images/${"a".repeat(64)}.webp`;
  assert.equal(isInternalMediaPath(assetPath), true);
  assert.equal(
    getPublicMediaUrl(assetPath),
    `/api/media/${"a".repeat(64)}.webp`,
  );
  assert.equal(getPublicMediaUrl("https://image.tmdb.org/t/p/w500/a.jpg"), null);
  assert.equal(getPublicMediaUrl("/objects/uploads/private.pdf"), null);
  assert.equal(isMediaAssetId(`${"a".repeat(64)}.webp`), true);
  assert.equal(isMediaAssetId("../../private-file"), false);
});

test("uses the configured bucket and private prefix for stored media", async () => {
  const input = await sharp({
    create: {
      width: 20,
      height: 10,
      channels: 3,
      background: { r: 30, g: 30, b: 30 },
    },
  })
    .png()
    .toBuffer();
  const calls: { bucket?: string; object?: string; saved?: Buffer } = {};
  let exists = false;
  const file = {
    exists: async () => [exists] as [boolean],
    save: async (body: Buffer) => {
      calls.saved = body;
      exists = true;
    },
    getMetadata: async () => [{ size: "12", contentType: "image/webp" }],
  };
  const storage = {
    bucket: (bucket: string) => {
      calls.bucket = bucket;
      return {
        file: (object: string) => {
          calls.object = object;
          return file;
        },
      };
    },
  };
  const environment = {
    DEFAULT_OBJECT_STORAGE_BUCKET_ID: "configured-bucket",
    PRIVATE_OBJECT_DIR: "private-prefix",
  };

  const persisted = await persistMediaAsset(
    input,
    100,
    storage as never,
    environment,
  );
  assert.equal(calls.bucket, "configured-bucket");
  assert.equal(calls.object, `private-prefix/post-images/${persisted.objectPath.split("/").pop()}`);
  assert.ok(calls.saved?.length);

  const opened = await openMediaAsset(
    persisted.objectPath.split("/").pop()!,
    storage as never,
    environment,
  );
  assert.equal(opened.contentType, "image/webp");
  assert.equal(opened.contentLength, "12");
  assert.equal(
    getMediaFile(persisted.objectPath.split("/").pop()!, storage as never, environment),
    file,
  );
});