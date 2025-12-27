import { db } from './firebase';
import {
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  getDocs,
  query,
  where,
  orderBy,
  limit as firestoreLimit,
  startAfter,
  DocumentData,
  QueryDocumentSnapshot,
  writeBatch
} from 'firebase/firestore';

export interface Wine {
  "S.no": number;
  "Brand Number": string | number;
  "Size Code": string;
  "Pack Type": string;
  "Product Name": string;
  "Issue Price": number;
  "Special Margin": number;
  "MRP": number;
  "Type": string;
}

export interface WineDocument extends Wine {
  id: string;
}

const WINES_COLLECTION = 'wines';

/**
 * Get all wines with optional pagination
 */
export async function getAllWines(limitCount: number = 50, lastDoc?: QueryDocumentSnapshot<DocumentData>): Promise<{ wines: WineDocument[], lastDoc: QueryDocumentSnapshot<DocumentData> | null }> {
  try {
    let q = query(
      collection(db, WINES_COLLECTION),
      orderBy('Product Name'),
      firestoreLimit(limitCount)
    );

    if (lastDoc) {
      q = query(q, startAfter(lastDoc));
    }

    const querySnapshot = await getDocs(q);
    const wines: WineDocument[] = querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data() as Wine
    }));

    const lastVisible = querySnapshot.docs[querySnapshot.docs.length - 1] || null;

    return { wines, lastDoc: lastVisible };
  } catch (error) {
    console.error('Error fetching wines:', error);
    throw error;
  }
}

/**
 * Get all wines without pagination (for migration and full data load)
 */
export async function getAllWinesNoPagination(): Promise<WineDocument[]> {
  try {
    const querySnapshot = await getDocs(collection(db, WINES_COLLECTION));
    return querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data() as Wine
    }));
  } catch (error) {
    console.error('Error fetching all wines:', error);
    throw error;
  }
}

/**
 * Search wines by product name, brand number, or type
 */
export async function searchWines(searchQuery: string): Promise<WineDocument[]> {
  try {
    const querySnapshot = await getDocs(collection(db, WINES_COLLECTION));
    const allWines: WineDocument[] = querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data() as Wine
    }));

    const searchLower = searchQuery.toLowerCase();

    return allWines.filter(wine =>
      wine['Product Name'].toLowerCase().includes(searchLower) ||
      String(wine['Brand Number']).toLowerCase().includes(searchLower) ||
      wine['Type'].toLowerCase().includes(searchLower) ||
      wine['Size Code'].toLowerCase().includes(searchLower)
    );
  } catch (error) {
    console.error('Error searching wines:', error);
    throw error;
  }
}

/**
 * Add a new wine to the database
 */
export async function addWine(wineData: Wine): Promise<string> {
  try {
    const docRef = await addDoc(collection(db, WINES_COLLECTION), wineData);
    return docRef.id;
  } catch (error) {
    console.error('Error adding wine:', error);
    throw error;
  }
}

/**
 * Update an existing wine
 */
export async function updateWine(id: string, wineData: Partial<Wine>): Promise<void> {
  try {
    const wineRef = doc(db, WINES_COLLECTION, id);
    await updateDoc(wineRef, wineData as any);
  } catch (error) {
    console.error('Error updating wine:', error);
    throw error;
  }
}

/**
 * Delete a wine from the database
 */
export async function deleteWine(id: string): Promise<void> {
  try {
    const wineRef = doc(db, WINES_COLLECTION, id);
    await deleteDoc(wineRef);
  } catch (error) {
    console.error('Error deleting wine:', error);
    throw error;
  }
}

/**
 * Get wine by brand number and issue price (for matching logic)
 */
export async function getWineByBrandAndPrice(brandNumber: string | number, issuePrice: number, tolerance: number = 1): Promise<WineDocument | null> {
  try {
    const querySnapshot = await getDocs(
      query(
        collection(db, WINES_COLLECTION),
        where('Brand Number', '==', brandNumber)
      )
    );

    for (const doc of querySnapshot.docs) {
      const wine = doc.data() as Wine;
      if (Math.abs(wine['Issue Price'] - issuePrice) < tolerance) {
        return {
          id: doc.id,
          ...wine
        };
      }
    }

    return null;
  } catch (error) {
    console.error('Error finding wine by brand and price:', error);
    throw error;
  }
}

/**
 * Migrate wine data from sample data to database
 */
export async function migrateWineData(sampleData: Wine[]): Promise<{ success: number, failed: number }> {
  try {
    const batch = writeBatch(db);
    let batchCount = 0;
    let success = 0;
    let failed = 0;

    for (const wine of sampleData) {
      try {
        const wineRef = doc(collection(db, WINES_COLLECTION));
        batch.set(wineRef, wine);
        batchCount++;

        // Firestore batch limit is 500 operations
        if (batchCount === 500) {
          await batch.commit();
          success += batchCount;
          batchCount = 0;
        }
      } catch (error) {
        console.error('Error adding wine to batch:', wine, error);
        failed++;
      }
    }

    // Commit remaining items
    if (batchCount > 0) {
      await batch.commit();
      success += batchCount;
    }

    return { success, failed };
  } catch (error) {
    console.error('Error migrating wine data:', error);
    throw error;
  }
}

/**
 * Check if wine database is empty
 */
export async function isWineDatabaseEmpty(): Promise<boolean> {
  try {
    const querySnapshot = await getDocs(
      query(collection(db, WINES_COLLECTION), firestoreLimit(1))
    );
    return querySnapshot.empty;
  } catch (error) {
    console.error('Error checking if database is empty:', error);
    return true;
  }
}

/**
 * Get all wines for comparison (cached version)
 */
let cachedWines: WineDocument[] | null = null;
let cacheTime: number = 0;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

export async function getWinesForComparison(): Promise<WineDocument[]> {
  const now = Date.now();

  // Return cached data if still valid
  if (cachedWines && (now - cacheTime) < CACHE_DURATION) {
    return cachedWines;
  }

  // Fetch fresh data
  const wines = await getAllWinesNoPagination();
  cachedWines = wines;
  cacheTime = now;

  return wines;
}

/**
 * Clear the wine cache (call this after adding/updating/deleting wines)
 */
export function clearWineCache(): void {
  cachedWines = null;
  cacheTime = 0;
}
