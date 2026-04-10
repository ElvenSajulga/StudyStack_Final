import { Injectable } from '@angular/core';
import {
  Firestore,
  collection,
  doc,
  getDocs,
  getDoc,
  addDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  DocumentData,
  QueryConstraint,
} from '@angular/fire/firestore';

@Injectable({
  providedIn: 'root',
})
export class FirestoreService {
  constructor(private readonly firestore: Firestore) {}

  // ─── Generic helpers ───────────────────────────────────────────────────────

  async getAll<T>(
    collectionName: string,
    constraints: QueryConstraint[] = []
  ): Promise<T[]> {
    const ref = collection(this.firestore, collectionName);
    const q = constraints.length ? query(ref, ...constraints) : query(ref);
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as T));
  }

  async getById<T>(collectionName: string, id: string): Promise<T | undefined> {
    const ref = doc(this.firestore, collectionName, id);
    const snap = await getDoc(ref);
    if (!snap.exists()) return undefined;
    return { id: snap.id, ...snap.data() } as T;
  }

  async getWhere<T>(
    collectionName: string,
    field: string,
    value: unknown
  ): Promise<T[]> {
    return this.getAll<T>(collectionName, [where(field, '==', value)]);
  }

  async getWhereMultiple<T>(
    collectionName: string,
    conditions: { field: string; value: unknown }[]
  ): Promise<T[]> {
    const constraints = conditions.map(c => where(c.field, '==', c.value));
    return this.getAll<T>(collectionName, constraints);
  }

  /** Set a document with a known ID (overwrites). */
  async set(collectionName: string, id: string, data: DocumentData): Promise<void> {
    const ref = doc(this.firestore, collectionName, id);
    await setDoc(ref, data);
  }

  /** Add a document with auto-generated ID, returns the new ID. */
  async add(collectionName: string, data: DocumentData): Promise<string> {
    const ref = collection(this.firestore, collectionName);
    const docRef = await addDoc(ref, data);
    return docRef.id;
  }

  /** Partial update. */
  async update(collectionName: string, id: string, data: Partial<DocumentData>): Promise<void> {
    const ref = doc(this.firestore, collectionName, id);
    await updateDoc(ref, data);
  }

  /** Delete a document. */
  async delete(collectionName: string, id: string): Promise<void> {
    const ref = doc(this.firestore, collectionName, id);
    await deleteDoc(ref);
  }
}