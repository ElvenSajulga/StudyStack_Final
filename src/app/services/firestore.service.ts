import { Injectable, inject, EnvironmentInjector, runInInjectionContext } from '@angular/core';
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
  DocumentData,
  QueryConstraint,
} from '@angular/fire/firestore';

@Injectable({ providedIn: 'root' })
export class FirestoreService {
  private readonly firestore = inject(Firestore);
  private readonly injector = inject(EnvironmentInjector);

  private run<T>(fn: () => Promise<T>): Promise<T> {
    return runInInjectionContext(this.injector, fn);
  }

  /** Strip undefined values — Firestore rejects them */
  private clean(data: DocumentData): DocumentData {
    return JSON.parse(JSON.stringify(data));
  }

  async getAll<T>(
    collectionName: string,
    constraints: QueryConstraint[] = []
  ): Promise<T[]> {
    return this.run(async () => {
      const ref = collection(this.firestore, collectionName);
      const q = constraints.length ? query(ref, ...constraints) : query(ref);
      const snap = await getDocs(q);
      return snap.docs.map(d => ({ id: d.id, ...d.data() } as T));
    });
  }

  async getById<T>(collectionName: string, id: string): Promise<T | undefined> {
    return this.run(async () => {
      const ref = doc(this.firestore, collectionName, id);
      const snap = await getDoc(ref);
      if (!snap.exists()) return undefined;
      return { id: snap.id, ...snap.data() } as T;
    });
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

  async set(collectionName: string, id: string, data: DocumentData): Promise<void> {
    return this.run(async () => {
      const ref = doc(this.firestore, collectionName, id);
      await setDoc(ref, this.clean(data));
    });
  }

  async add(collectionName: string, data: DocumentData): Promise<string> {
    return this.run(async () => {
      const ref = collection(this.firestore, collectionName);
      const docRef = await addDoc(ref, this.clean(data));
      return docRef.id;
    });
  }

  async update(collectionName: string, id: string, data: Partial<DocumentData>): Promise<void> {
    return this.run(async () => {
      const ref = doc(this.firestore, collectionName, id);
      await updateDoc(ref, this.clean(data));
    });
  }

  async delete(collectionName: string, id: string): Promise<void> {
    return this.run(async () => {
      const ref = doc(this.firestore, collectionName, id);
      await deleteDoc(ref);
    });
  }
}