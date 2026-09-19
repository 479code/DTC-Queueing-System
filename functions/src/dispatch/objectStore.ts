import {
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client
} from "@aws-sdk/client-s3";
import { storage } from "../shared/firebase.js";

const requiredBucketVariables = ["BUCKET", "ACCESS_KEY_ID", "SECRET_ACCESS_KEY", "ENDPOINT"] as const;

function railwayBucketConfigured(): boolean {
  return requiredBucketVariables.every((name) => Boolean(process.env[name]));
}

let s3Client: S3Client | undefined;

function bucketClient(): S3Client {
  if (!railwayBucketConfigured()) {
    throw new Error("Railway Bucket is not configured.");
  }
  if (!s3Client) {
    s3Client = new S3Client({
      region: process.env.REGION ?? "auto",
      endpoint: process.env.ENDPOINT,
      forcePathStyle: process.env.AWS_S3_URL_STYLE === "path",
      credentials: {
        accessKeyId: process.env.ACCESS_KEY_ID!,
        secretAccessKey: process.env.SECRET_ACCESS_KEY!
      }
    });
  }
  return s3Client;
}

export type DispatchObjectMetadata = {
  contentType?: string;
  fileSize: number;
  checksum?: string;
};

export async function putDispatchObject(
  storagePath: string,
  file: Uint8Array,
  contentType: string,
  checksum: string
): Promise<void> {
  if (!railwayBucketConfigured()) {
    throw new Error("Railway Bucket is not configured.");
  }

  await bucketClient().send(new PutObjectCommand({
    Bucket: process.env.BUCKET,
    Key: storagePath,
    Body: file,
    ContentType: contentType,
    Metadata: { sha256: checksum }
  }));
}

export async function getDispatchObjectMetadata(storagePath: string): Promise<DispatchObjectMetadata | undefined> {
  if (railwayBucketConfigured()) {
    try {
      const metadata = await bucketClient().send(new HeadObjectCommand({
        Bucket: process.env.BUCKET,
        Key: storagePath
      }));
      return {
        contentType: metadata.ContentType,
        fileSize: Number(metadata.ContentLength ?? 0),
        checksum: metadata.Metadata?.sha256
      };
    } catch (error) {
      const status = typeof error === "object" && error !== null && "$metadata" in error
        ? (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode
        : undefined;
      if (status === 404) return undefined;
      throw error;
    }
  }

  const file = storage.bucket().file(storagePath);
  const [exists] = await file.exists();
  if (!exists) return undefined;
  const [metadata] = await file.getMetadata();
  return {
    contentType: metadata.contentType,
    fileSize: Number(metadata.size ?? 0),
    checksum: typeof metadata.metadata?.sha256 === "string" ? metadata.metadata.sha256 : undefined
  };
}

export async function downloadDispatchObject(storagePath: string): Promise<Buffer> {
  if (railwayBucketConfigured()) {
    const object = await bucketClient().send(new GetObjectCommand({
      Bucket: process.env.BUCKET,
      Key: storagePath
    }));
    if (!object.Body) throw new Error("The dispatch spreadsheet could not be downloaded.");
    return Buffer.from(await object.Body.transformToByteArray());
  }

  const [buffer] = await storage.bucket().file(storagePath).download();
  return buffer;
}
