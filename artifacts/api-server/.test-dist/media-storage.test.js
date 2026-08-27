// src/lib/media-storage.test.ts
import assert from "node:assert/strict";
import test from "node:test";
import sharp2 from "sharp";

// src/lib/media-storage.ts
import { createHash } from "node:crypto";
import { Storage } from "@google-cloud/storage";
import sharp from "sharp";
var REPLIT_SIDECAR_ENDPOINT = "http://127.0.0.1:1106";
var MEDIA_PREFIX = "post-images";
var MEDIA_ASSET_ID_PATTERN = /^[a-f0-9]{64}\.webp$/;
var MAX_INPUT_PIXELS = 4e7;
var objectStorageClient = new Storage({
  credentials: {
    audience: "replit",
    subject_token_type: "access_token",
    token_url: `${REPLIT_SIDECAR_ENDPOINT}/token`,
    type: "external_account",
    credential_source: {
      url: `${REPLIT_SIDECAR_ENDPOINT}/credential`,
      format: {
        type: "json",
        subject_token_field_name: "access_token"
      }
    },
    universe_domain: "googleapis.com"
  },
  projectId: ""
});
var MediaAssetNotFoundError = class extends Error {
  constructor() {
    super("Media asset not found");
    this.name = "MediaAssetNotFoundError";
  }
};
var getMediaObjectLocation = (assetId, environment = process.env) => {
  if (!MEDIA_ASSET_ID_PATTERN.test(assetId)) {
    throw new MediaAssetNotFoundError();
  }
  const bucketName = environment.DEFAULT_OBJECT_STORAGE_BUCKET_ID?.trim();
  const directory = environment.PRIVATE_OBJECT_DIR?.trim().replace(/^\/+|\/+$/g, "");
  if (!bucketName) {
    throw new Error("DEFAULT_OBJECT_STORAGE_BUCKET_ID is not configured");
  }
  if (!directory || directory.split("/").some((segment) => segment === "..")) {
    throw new Error("PRIVATE_OBJECT_DIR is not configured");
  }
  return {
    bucketName,
    objectName: `${directory}/${MEDIA_PREFIX}/${assetId}`
  };
};
var getMediaFile = (assetId, storage = objectStorageClient, environment = process.env) => {
  const { bucketName, objectName } = getMediaObjectLocation(assetId, environment);
  return storage.bucket(bucketName).file(objectName);
};
var isInternalMediaPath = (value) => typeof value === "string" && new RegExp(`^/objects/${MEDIA_PREFIX}/[a-f0-9]{64}\\.webp$`).test(value);
var isMediaAssetId = (value) => typeof value === "string" && MEDIA_ASSET_ID_PATTERN.test(value);
var getPublicMediaUrl = (value) => {
  if (!isInternalMediaPath(value)) return null;
  return `/api/media/${value.slice(value.lastIndexOf("/") + 1)}`;
};
var compressMediaImage = async (input, maxWidth = 1600) => {
  const image = sharp(input, {
    animated: false,
    failOn: "error",
    limitInputPixels: MAX_INPUT_PIXELS
  }).rotate();
  const metadata = await image.metadata();
  if (!metadata.width || !metadata.height || metadata.width < 1 || metadata.height < 1) {
    throw new Error("Image did not contain valid dimensions");
  }
  const { data, info } = await image.resize({ width: maxWidth, withoutEnlargement: true }).webp({ quality: 82, effort: 4 }).toBuffer({ resolveWithObject: true });
  return { body: data, width: info.width, height: info.height };
};
var persistMediaAsset = async (input, maxWidth = 1600, storage = objectStorageClient, environment = process.env) => {
  const compressed = await compressMediaImage(input, maxWidth);
  const assetId = `${createHash("sha256").update(compressed.body).digest("hex")}.webp`;
  const file = getMediaFile(assetId, storage, environment);
  const [exists] = await file.exists();
  if (!exists) {
    await file.save(compressed.body, {
      resumable: false,
      contentType: "image/webp",
      metadata: {
        cacheControl: "public, max-age=31536000, immutable"
      }
    });
  }
  return {
    objectPath: `/objects/${MEDIA_PREFIX}/${assetId}`,
    width: compressed.width,
    height: compressed.height
  };
};
var openMediaAsset = async (assetId, storage = objectStorageClient, environment = process.env) => {
  const file = getMediaFile(assetId, storage, environment);
  const [exists] = await file.exists();
  if (!exists) throw new MediaAssetNotFoundError();
  const [metadata] = await file.getMetadata();
  return {
    file,
    contentLength: metadata.size ? String(metadata.size) : null,
    contentType: metadata.contentType ?? "image/webp"
  };
};

// src/lib/media-storage.test.ts
test("compresses decoded images to bounded WebP media", async () => {
  const input = await sharp2({
    create: {
      width: 2400,
      height: 1200,
      channels: 3,
      background: { r: 16, g: 20, b: 29 }
    }
  }).png().toBuffer();
  const output = await compressMediaImage(input, 800);
  const metadata = await sharp2(output.body).metadata();
  assert.equal(metadata.format, "webp");
  assert.equal(metadata.width, 800);
  assert.equal(metadata.height, 400);
  assert.equal(output.width, 800);
  assert.equal(output.height, 400);
});
test("rejects an invalid image before it can enter storage", async () => {
  await assert.rejects(
    compressMediaImage(Buffer.from("not an image")),
    /Input buffer contains unsupported image format/
  );
});
test("only known internal object paths become public image URLs", () => {
  const assetPath = `/objects/post-images/${"a".repeat(64)}.webp`;
  assert.equal(isInternalMediaPath(assetPath), true);
  assert.equal(
    getPublicMediaUrl(assetPath),
    `/api/media/${"a".repeat(64)}.webp`
  );
  assert.equal(getPublicMediaUrl("https://image.tmdb.org/t/p/w500/a.jpg"), null);
  assert.equal(getPublicMediaUrl("/objects/uploads/private.pdf"), null);
  assert.equal(isMediaAssetId(`${"a".repeat(64)}.webp`), true);
  assert.equal(isMediaAssetId("../../private-file"), false);
});
test("uses the configured bucket and private prefix for stored media", async () => {
  const input = await sharp2({
    create: {
      width: 20,
      height: 10,
      channels: 3,
      background: { r: 30, g: 30, b: 30 }
    }
  }).png().toBuffer();
  const calls = {};
  let exists = false;
  const file = {
    exists: async () => [exists],
    save: async (body) => {
      calls.saved = body;
      exists = true;
    },
    getMetadata: async () => [{ size: "12", contentType: "image/webp" }]
  };
  const storage = {
    bucket: (bucket) => {
      calls.bucket = bucket;
      return {
        file: (object) => {
          calls.object = object;
          return file;
        }
      };
    }
  };
  const environment = {
    DEFAULT_OBJECT_STORAGE_BUCKET_ID: "configured-bucket",
    PRIVATE_OBJECT_DIR: "private-prefix"
  };
  const persisted = await persistMediaAsset(
    input,
    100,
    storage,
    environment
  );
  assert.equal(calls.bucket, "configured-bucket");
  assert.equal(calls.object, `private-prefix/post-images/${persisted.objectPath.split("/").pop()}`);
  assert.ok(calls.saved?.length);
  const opened = await openMediaAsset(
    persisted.objectPath.split("/").pop(),
    storage,
    environment
  );
  assert.equal(opened.contentType, "image/webp");
  assert.equal(opened.contentLength, "12");
  assert.equal(
    getMediaFile(persisted.objectPath.split("/").pop(), storage, environment),
    file
  );
});
