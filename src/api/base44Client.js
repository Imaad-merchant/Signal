// Firebase drop-in replacement for Base44 SDK
// Exposes the same API surface so all consumer files work without changes
import { auth, db, storage } from "./firebase";
import {
  collection, addDoc, getDocs, getDoc, doc, updateDoc, deleteDoc,
  query, where, orderBy, limit as firestoreLimit, writeBatch, serverTimestamp
} from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";

// Helper: parse Base44-style sort string like "-created_date" into Firestore orderBy
function parseSort(sortStr) {
  if (!sortStr) return null;
  const desc = sortStr.startsWith("-");
  const field = desc ? sortStr.slice(1) : sortStr;
  return { field, direction: desc ? "desc" : "asc" };
}

// Helper: get current user ID or throw
function requireUser() {
  const user = auth.currentUser;
  if (!user) throw new Error("Not authenticated");
  return user;
}

// Entity CRUD factory — creates handlers for a Firestore collection
function createEntityHandler(collectionName) {
  return {
    async create(data) {
      const user = requireUser();
      const docData = {
        ...data,
        userId: user.uid,
        created_by: user.email,
        created_date: new Date().toISOString(),
        updated_date: new Date().toISOString(),
      };
      const docRef = await addDoc(collection(db, collectionName), docData);
      return { id: docRef.id, ...docData };
    },

    async bulkCreate(items) {
      const user = requireUser();
      const batch = writeBatch(db);
      const results = [];
      for (const data of items) {
        const docRef = doc(collection(db, collectionName));
        const docData = {
          ...data,
          userId: user.uid,
          created_by: user.email,
          created_date: new Date().toISOString(),
          updated_date: new Date().toISOString(),
        };
        batch.set(docRef, docData);
        results.push({ id: docRef.id, ...docData });
      }
      await batch.commit();
      return results;
    },

    async list(sortStr, limitNum) {
      const user = requireUser();
      try {
        const q = query(collection(db, collectionName), where("userId", "==", user.uid));
        const snap = await getDocs(q);
        let results = snap.docs.map(d => ({ id: d.id, ...d.data() }));

        const sort = parseSort(sortStr);
        if (sort) {
          results.sort((a, b) => {
            const av = a[sort.field] || "";
            const bv = b[sort.field] || "";
            const cmp = av < bv ? -1 : av > bv ? 1 : 0;
            return sort.direction === "desc" ? -cmp : cmp;
          });
        }
        if (limitNum) results = results.slice(0, limitNum);
        return results;
      } catch (err) {
        console.error(`Firestore list error (${collectionName}):`, err);
        return [];
      }
    },

    async filter(filterObj, sortStr, limitNum) {
      const user = requireUser();
      try {
        const q = query(collection(db, collectionName), where("userId", "==", user.uid));
        const snap = await getDocs(q);
        let results = snap.docs.map(d => ({ id: d.id, ...d.data() }));

      // Filter client-side
      if (filterObj) {
        for (const [key, value] of Object.entries(filterObj)) {
          if (key === "created_by") continue;
          if (value !== undefined && value !== null) {
            results = results.filter(r => r[key] === value);
          }
        }
      }

      // Sort client-side
      const sort = parseSort(sortStr);
      if (sort) {
        results.sort((a, b) => {
          const av = a[sort.field] || "";
          const bv = b[sort.field] || "";
          const cmp = av < bv ? -1 : av > bv ? 1 : 0;
          return sort.direction === "desc" ? -cmp : cmp;
        });
      }
      if (limitNum) results = results.slice(0, limitNum);
      return results;
      } catch (err) {
        console.error(`Firestore filter error (${collectionName}):`, err);
        return [];
      }
    },

    async update(id, data) {
      const docRef = doc(db, collectionName, id);
      await updateDoc(docRef, {
        ...data,
        updated_date: new Date().toISOString(),
      });
      const updated = await getDoc(docRef);
      return { id: updated.id, ...updated.data() };
    },

    async delete(id) {
      await deleteDoc(doc(db, collectionName, id));
    },
  };
}

// The drop-in replacement object
export const base44 = {
  auth: {
    async me() {
      const user = requireUser();
      return {
        email: user.email,
        name: user.displayName || user.email?.split("@")[0] || "User",
        uid: user.uid,
        photoURL: user.photoURL,
      };
    },
    logout(redirectUrl) {
      auth.signOut().then(() => {
        if (redirectUrl) window.location.href = redirectUrl;
      });
    },
    redirectToLogin() {
      // No-op — login is handled by AuthContext/Login page
    },
  },

  entities: {
    Task: createEntityHandler("tasks"),
    Category: createEntityHandler("categories"),
    DailyLog: createEntityHandler("dailyLogs"),
    FocusSession: createEntityHandler("focusSessions"),
  },

  functions: {
    async invoke(name, payload) {
      const user = requireUser();
      const token = await user.getIdToken();
      const baseUrl = import.meta.env.VITE_API_URL || "";
      const res = await fetch(`${baseUrl}/api/${name}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(`Function ${name} failed: ${res.status}`);
      const data = await res.json();
      return { data };
    },
  },

  integrations: {
    Core: {
      async UploadFile({ file }) {
        const user = requireUser();
        const fileRef = ref(storage, `uploads/${user.uid}/${Date.now()}_${file.name}`);
        await uploadBytes(fileRef, file);
        const file_url = await getDownloadURL(fileRef);
        return { file_url };
      },
      async InvokeLLM({ prompt, file_urls, response_json_schema }) {
        const user = requireUser();
        const token = await user.getIdToken();
        const baseUrl = import.meta.env.VITE_API_URL || "";
        const res = await fetch(`${baseUrl}/api/invoke-llm`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ prompt, file_urls, response_json_schema }),
        });
        if (!res.ok) throw new Error("InvokeLLM failed");
        return await res.json();
      },
    },
  },

  appLogs: {
    logUserInApp() {
      // No-op — not needed outside Base44
      return Promise.resolve();
    },
  },
};
