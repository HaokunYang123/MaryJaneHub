import { google } from 'googleapis';
import { Readable } from 'stream';

// --- Configuration ---
const ROOT_ID = process.env.GOOGLE_ROOT_FOLDER_ID || process.env.GOOGLE_SHARED_DRIVE_ID;

const getCredentials = () => {
  try {
    const jsonKey = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
    if (!jsonKey) {
      console.error("❌ Missing GOOGLE_SERVICE_ACCOUNT_JSON");
      return {};
    }
    const credentials = JSON.parse(jsonKey);
    // Fix newlines in private key if present
    if (credentials.private_key) {
      credentials.private_key = credentials.private_key.replace(/\\n/g, '\n');
    }
    return credentials;
  } catch (error) {
    console.error("❌ Credentials Error:", error);
    return {};
  }
};

const auth = new google.auth.GoogleAuth({
  credentials: getCredentials(),
  scopes: ['https://www.googleapis.com/auth/drive'],
});

const drive = google.drive({ version: 'v3', auth });

// --- Folder Cache to prevent duplicate creation during concurrent uploads ---
const folderCache = new Map<string, string>(); // key: "parentId/folderName" -> folderId
const pendingFolderCreations = new Map<string, Promise<string>>(); // Prevent race conditions

// --- Helper: Find or Create Path (Recursive) ---
async function findOrCreatePath(path: string): Promise<string> {
  // Split path into segments (e.g. ["All Files", "Property Management", "Tennessee"])
  const folders = path.split('/').filter(p => p.trim() !== '');

  let parentId = ROOT_ID; // Start search from the configured root

  for (const folderName of folders) {
    parentId = await findOrCreateSingleFolder(folderName, parentId);
  }

  return parentId!;
}

async function findOrCreateSingleFolder(name: string, parentId?: string): Promise<string> {
  const cacheKey = `${parentId || 'root'}/${name}`;

  // Check cache first
  if (folderCache.has(cacheKey)) {
    return folderCache.get(cacheKey)!;
  }

  // Check if there's already a pending creation for this folder
  if (pendingFolderCreations.has(cacheKey)) {
    return pendingFolderCreations.get(cacheKey)!;
  }

  // Create a promise for this folder creation and store it
  const creationPromise = (async () => {
    try {
      // 1. Search for existing folder
      let query = `mimeType='application/vnd.google-apps.folder' and name='${name}' and trashed=false`;
      if (parentId) {
        query += ` and '${parentId}' in parents`;
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const listRequest: any = {
        q: query,
        fields: 'files(id)',
        supportsAllDrives: true,
        includeItemsFromAllDrives: true,
      };

      const list = await drive.files.list(listRequest);

      if (list.data.files && list.data.files.length > 0) {
        const folderId = list.data.files[0].id!;
        folderCache.set(cacheKey, folderId);
        return folderId;
      }

      // 2. Create if not found
      console.log(`📁 Creating folder '${name}' inside parent '${parentId || 'Root'}'...`);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const createRequest: any = {
        requestBody: {
          name,
          mimeType: 'application/vnd.google-apps.folder',
          parents: parentId ? [parentId] : undefined
        },
        fields: 'id',
        supportsAllDrives: true,
      };

      const res = await drive.files.create(createRequest);
      const folderId = res.data.id!;
      folderCache.set(cacheKey, folderId);
      return folderId;
    } catch (error) {
      console.error(`❌ Folder Error (${name}):`, error);
      throw error;
    } finally {
      // Clean up pending creation
      pendingFolderCreations.delete(cacheKey);
    }
  })();

  pendingFolderCreations.set(cacheKey, creationPromise);
  return creationPromise;
}

// --- Upload Buffer directly to Drive (for generated PDFs) ---
export async function uploadBufferToDrive(
  buffer: Buffer,
  fileName: string,
  mimeType: string,
  folderPath: string = "Unprocessed Files"
): Promise<string | null> {
  try {
    const folderId = await findOrCreatePath(folderPath);

    const stream = new Readable();
    stream.push(buffer);
    stream.push(null);

    const res = await drive.files.create({
      requestBody: {
        name: fileName,
        parents: [folderId],
      },
      media: {
        mimeType,
        body: stream,
      },
      fields: 'id',
      supportsAllDrives: true,
    });

    console.log(`✅ Uploaded ${fileName} to '${folderPath}' (ID: ${res.data.id})`);
    return res.data.id || null;
  } catch (error) {
    console.error("❌ Buffer Upload Error:", error);
    throw error;
  }
}

// --- Upload to "Unprocessed Files" by default ---
export async function uploadFileToDrive(file: File, folderPath: string = "Unprocessed Files"): Promise<string | null> {
  try {
    const folderId = await findOrCreatePath(folderPath);

    const buffer = Buffer.from(await file.arrayBuffer());
    const stream = new Readable();
    stream.push(buffer);
    stream.push(null);

    const res = await drive.files.create({
      requestBody: {
        name: file.name,
        parents: [folderId],
      },
      media: {
        mimeType: file.type,
        body: stream,
      },
      fields: 'id',
      supportsAllDrives: true,
    });

    console.log(`✅ Uploaded ${file.name} to '${folderPath}' (ID: ${res.data.id})`);
    return res.data.id || null;
  } catch (error) {
    console.error("❌ Upload Error:", error);
    throw error;
  }
}

// --- Move File (Used for organizing into All Files) ---
export async function moveFileToFolder(fileId: string, folderPath: string): Promise<string | null> {
  try {
    const folderId = await findOrCreatePath(folderPath);

    const file = await drive.files.get({
      fileId,
      fields: 'parents',
      supportsAllDrives: true
    });

    const previousParents = file.data.parents?.join(',') || '';

    await drive.files.update({
      fileId,
      addParents: folderId,
      removeParents: previousParents,
      fields: 'id, parents',
      supportsAllDrives: true,
    });
    return folderId;
  } catch (error) {
    console.error('Drive Move Error:', error);
    return null;
  }
}

// Legacy helper compatibility if needed, but preferable to use findOrCreatePath directly or the exports above
// Re-export specific helpers if other files rely on them by name, or refactor them.
// The previous code had getInboxFolderId and getFolderByStatus. Let's keep them for compatibility but using the new logic.

export async function getInboxFolderId(): Promise<string | null> {
  try { return await findOrCreatePath('Inbox'); } catch { return null; }
}

export async function getFolderByStatus(status: 'pending' | 'processed' | 'rejected'): Promise<string | null> {
  // Map internal status to filesystem folders
  const map = {
    pending: 'Unprocessed Files', // "Review Queue" logic usually implies waiting, but user said "Unprocessed Files" for logic
    processed: 'All Files',       // General bucket, though files go deeper usually
    rejected: 'All Files/Rejected'
  };
  try { return await findOrCreatePath(map[status]); } catch { return null; }
}

/**
 * Check if a file exists in Google Drive (and is NOT in trash)
 * Returns true if file exists and is not trashed, false otherwise
 */
export async function checkFileExists(fileId: string): Promise<boolean> {
  try {
    const response = await drive.files.get({
      fileId,
      fields: 'id,trashed',
      supportsAllDrives: true,
    });

    // File exists but is in trash - treat as deleted
    if (response.data.trashed) {
      return false;
    }

    return true;
  } catch (error: unknown) {
    const err = error as { code?: number };
    if (err.code === 404) {
      return false;
    }
    // For other errors, assume file might exist (fail open)
    console.log(`checkFileExists error for ${fileId}:`, error);
    return true;
  }
}
