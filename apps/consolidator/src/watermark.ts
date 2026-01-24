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

export async function saveWatermark(watermark: Watermark): Promise<void> {
  const client = getBlobServiceClient();
  const containerClient = client.getContainerClient(BLOB_CONTAINERS.WATERMARKS);

  await containerClient.createIfNotExists();

  const blobClient = containerClient.getBlockBlobClient(WATERMARK_BLOB_NAME);
  const content = JSON.stringify(watermark);

  await blobClient.upload(content, content.length, {
    blobHTTPHeaders: { blobContentType: 'application/json' },
  });

  console.log('Watermark saved successfully');
}
