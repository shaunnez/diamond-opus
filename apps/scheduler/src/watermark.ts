import { BlobServiceClient } from '@azure/storage-blob';
import {
  requireEnv,
  BLOB_CONTAINERS,
  WATERMARK_BLOB_NAME,
  type Watermark,
} from '@diamond/shared';

let blobServiceClient: BlobServiceClient | null = null;

function getBlobServiceClient(): BlobServiceClient {
  if (!blobServiceClient) {
    blobServiceClient = BlobServiceClient.fromConnectionString(
      requireEnv('AZURE_STORAGE_CONNECTION_STRING')
    );
  }
  return blobServiceClient;
}

export async function getWatermark(blobName: string = WATERMARK_BLOB_NAME): Promise<Watermark | null> {
  try {
    const client = getBlobServiceClient();
    const containerClient = client.getContainerClient(BLOB_CONTAINERS.WATERMARKS);
    const blobClient = containerClient.getBlobClient(blobName);

    const downloadResponse = await blobClient.download();
    const content = await streamToString(downloadResponse.readableStreamBody!);

    return JSON.parse(content) as Watermark;
  } catch (error) {
    if ((error as { statusCode?: number }).statusCode === 404) {
      return null;
    }
    throw error;
  }
}

export async function saveWatermark(watermark: Watermark, blobName: string = WATERMARK_BLOB_NAME): Promise<void> {
  const client = getBlobServiceClient();
  const containerClient = client.getContainerClient(BLOB_CONTAINERS.WATERMARKS);

  await containerClient.createIfNotExists();

  const blobClient = containerClient.getBlockBlobClient(blobName);
  const content = JSON.stringify(watermark);

  await blobClient.upload(content, content.length, {
    blobHTTPHeaders: { blobContentType: 'application/json' },
  });
}

async function streamToString(
  readableStream: NodeJS.ReadableStream
): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    readableStream.on('data', (data: Buffer) => chunks.push(data));
    readableStream.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    readableStream.on('error', reject);
  });
}
