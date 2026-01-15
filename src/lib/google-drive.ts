import { google } from 'googleapis';

// Load the Robot Credentials from .env.local
const serviceAccount = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON || '{}');

const auth = new google.auth.GoogleAuth({
  credentials: serviceAccount,
  scopes: ['https://www.googleapis.com/auth/drive'],
});

const drive = google.drive({ version: 'v3', auth });

/**
 * Moves a file to a specific folder (e.g., "Invoices/2024/Repairs")
 * Creates the folder if it doesn't exist.
 */
export async function moveFileToFolder(fileId: string, folderName: string) {
  try {
    const folderId = await findOrCreateFolder(folderName);
    
    // Move the file
    const file = await drive.files.get({ fileId, fields: 'parents' });
    const previousParents = file.data.parents?.join(',') || '';

    await drive.files.update({
      fileId,
      addParents: folderId,
      removeParents: previousParents,
      fields: 'id, parents',
    });
    
    console.log(`✅ Moved file ${fileId} to ${folderName}`);
    return folderId;
  } catch (error) {
    console.error('Drive Move Error:', error);
    throw error;
  }
}

/**
 * Upload a file to Google Drive
 */
export async function uploadFileToDrive(
  fileName: string, 
  mimeType: string, 
  content: Buffer | string,
  folderId?: string
) {
  try {
    const requestBody: { name: string; mimeType: string; parents?: string[] } = {
      name: fileName,
      mimeType,
    };
    
    if (folderId) {
      requestBody.parents = [folderId];
    }

    const media = {
      mimeType,
      body: typeof content === 'string' ? content : require('stream').Readable.from(content),
    };

    const res = await drive.files.create({
      requestBody,
      media,
      fields: 'id, name, webViewLink',
    });

    console.log(`✅ Uploaded file: ${res.data.name} (${res.data.id})`);
    return res.data;
  } catch (error) {
    console.error('Drive Upload Error:', error);
    throw error;
  }
}

/**
 * Download file content from Google Drive
 */
export async function downloadFileFromDrive(fileId: string): Promise<string> {
  try {
    const res = await drive.files.get(
      { fileId, alt: 'media' },
      { responseType: 'text' }
    );
    return res.data as string;
  } catch (error) {
    console.error('Drive Download Error:', error);
    throw error;
  }
}

/**
 * Get file metadata
 */
export async function getFileMetadata(fileId: string) {
  try {
    const res = await drive.files.get({
      fileId,
      fields: 'id, name, mimeType, parents, webViewLink, createdTime',
    });
    return res.data;
  } catch (error) {
    console.error('Drive Metadata Error:', error);
    throw error;
  }
}

/**
 * List files in a folder
 */
export async function listFilesInFolder(folderId: string) {
  try {
    const res = await drive.files.list({
      q: `'${folderId}' in parents and trashed=false`,
      fields: 'files(id, name, mimeType, createdTime, webViewLink)',
      orderBy: 'createdTime desc',
    });
    return res.data.files || [];
  } catch (error) {
    console.error('Drive List Error:', error);
    throw error;
  }
}

// Internal Helper: Find or Create Folder
async function findOrCreateFolder(name: string) {
  // 1. Search for it
  const list = await drive.files.list({
    q: `mimeType='application/vnd.google-apps.folder' and name='${name}' and trashed=false`,
    fields: 'files(id)',
  });

  if (list.data.files && list.data.files.length > 0) {
    return list.data.files[0].id!;
  }

  // 2. Create it if missing
  const res = await drive.files.create({
    requestBody: {
      name,
      mimeType: 'application/vnd.google-apps.folder',
    },
    fields: 'id',
  });
  return res.data.id!;
}

/**
 * Get or create the Inbox folder for uploads
 */
export async function getInboxFolderId() {
  return findOrCreateFolder('Mary - Inbox');
}

/**
 * Get or create folder by status
 */
export async function getFolderByStatus(status: 'pending' | 'processed' | 'rejected') {
  const folderNames = {
    pending: 'Mary - Pending Review',
    processed: 'Mary - Processed',
    rejected: 'Mary - Rejected',
  };
  return findOrCreateFolder(folderNames[status]);
}
