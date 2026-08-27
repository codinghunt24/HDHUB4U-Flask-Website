import { createHash } from "node:crypto";
import { Storage, type File } from "@google-cloud/storage";
import sharp from "sharp";

const REPLIT_SIDECAR_ENDPOINT = "http://127.0.0.1:1106";
const MEDIA_PREFIX = "post-images";
const MEDIA_ASSET_ID_PATTERN = /^[a-f0-9]{64}\.webp$/;
const MAX_INPUT_PIXELS = 40_000_000;

export const objectStorageClient = new Storage({
  credentials: {
    audience: "replit",
    subject_token_type: "access_token",
    token_url: `${REPLIT_SIDECAR_ENDPOINT}/token`,
    type: "external_account",
    credential_source: {
      url: `${REPLIT_SIDECAR_ENDPOINT}/credential`,
      format: {
        type: "json",
        subject_token_field_name: "access_token",
      },
    },
    universe_domain: "googleapis.com",
  },
  projectId: "",
});

export class MediaAssetNotFoundError extends Error {
  constructor() {
    super("Media asset not found");
    this.name = "MediaAssetNotFoundError";
  }
}

type CompressedMedia = {
  body: Buffer;
  width: number | undefined;
  height: number | undefined;
};

type MediaStorageClient = Pick<Storage, "bucket">;
type MediaStorageEnvironment = {
  DEFAULT_OBJECT_STORAGE_BUCKET_ID?: string;
  PRIVATE_OBJECT_DIR?: string;
};

const getMediaObjectLocation = (
  assetId: string,
  environment: MediaStorageEnvironment = process.env,
) => {
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
    objectName: `${directory}/${MEDIA_PREFIX}/${assetId}`,
  };
};

export const getMediaFile = (
  assetId: string,
  storage: MediaStorageClient = objectStorageClient,
  environment: MediaStorageEnvironment = process.env,
): File => {
  const { bucketName, objectName } = getMediaObjectLocation(assetId, environment);
  return storage.bucket(bucketName).file(objectName);
};

export const isInternalMediaPath = (value: unknown): value is string =>
  typeof value === "string" &&
  new RegExp(`^/objects/${MEDIA_PREFIX}/[a-f0-9]{64}\\.webp$`).test(value);

export const isMediaAssetId = (value: unknown): value is string =>
  typeof value === "string" && MEDIA_ASSET_ID_PATTERN.test(value);

export const getPublicMediaUrl = (value: unknown) => {
  if (!isInternalMediaPath(value)) return null;
  return `/api/media/${value.slice(value.lastIndexOf("/") + 1)}`;
};

export const compressMediaImage = async (
  input: Buffer,
  maxWidth = 1600,
): Promise<CompressedMedia> => {
  const image = sharp(input, {
    animated: false,
    failOn: "error",
    limitInputPixels: MAX_INPUT_PIXELS,
  }).rotate();
  const metadata = await image.metadata();
  if (!metadata.width || !metadata.height || metadata.width < 1 || metadata.height < 1) {
    throw new Error("Image did not contain valid dimensions");
  }
  const { data, info } = await image
    .resize({ width: maxWidth, withoutEnlargement: true })
    .webp({ quality: 82, effort: 4 })
    .toBuffer({ resolveWithObject: true });
  return { body: data, width: info.width, height: info.height };
};

export const persistMediaAsset = async (
  input: Buffer,
  maxWidth = 1600,
  storage: MediaStorageClient = objectStorageClient,
  environment: MediaStorageEnvironment = process.env,
) => {
  const compressed = await compressMediaImage(input, maxWidth);
  const assetId = `${createHash("sha256").update(compressed.body).digest("hex")}.webp`;
  const file = getMediaFile(assetId, storage, environment);
  const [exists] = await file.exists();
  if (!exists) {
    await file.save(compressed.body, {
      resumable: false,
      contentType: "image/webp",
      metadata: {
        cacheControl: "public, max-age=31536000, immutable",
      },
    });
  }
  return {
    objectPath: `/objects/${MEDIA_PREFIX}/${assetId}`,
    width: compressed.width,
    height: compressed.height,
  };
};

export const openMediaAsset = async (
  assetId: string,
  storage: MediaStorageClient = objectStorageClient,
  environment: MediaStorageEnvironment = process.env,
) => {
  const file = getMediaFile(assetId, storage, environment);
  const [exists] = await file.exists();
  if (!exists) throw new MediaAssetNotFoundError();
  const [metadata] = await file.getMetadata();
  return {
    file,
    contentLength: metadata.size ? String(metadata.size) : null,
    contentType: (metadata.contentType as string | undefined) ?? "image/webp",
  };
};