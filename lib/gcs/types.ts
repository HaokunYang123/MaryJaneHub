/**
 * Result of uploading a file to Google Cloud Storage
 */
export interface GCSUploadResult {
  success: boolean;
  gcsPath: string; // format: gs://bucket-name/path/to/file
  publicUrl?: string;
  error?: string;
  alreadyExists?: boolean; // true if file was already in GCS
}
