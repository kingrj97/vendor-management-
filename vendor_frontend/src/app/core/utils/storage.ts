const memoryStorage: Record<string, string> = {};
const memorySessionStorage: Record<string, string> = {};

export const safeStorage = {
  getItem: (key: string): string | null => {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        return window.localStorage.getItem(key);
      }
      return memoryStorage[key] || null;
    } catch (e) {
      console.warn(`localStorage read failed for key "${key}", using memory fallback:`, e);
      return memoryStorage[key] || null;
    }
  },
  setItem: (key: string, value: string): void => {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem(key, value);
      }
      memoryStorage[key] = value;
    } catch (e) {
      console.warn(`localStorage write failed for key "${key}", using memory fallback:`, e);
      memoryStorage[key] = value;
    }
  },
  removeItem: (key: string): void => {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.removeItem(key);
      }
      delete memoryStorage[key];
    } catch (e) {
      console.warn(`localStorage delete failed for key "${key}", using memory fallback:`, e);
      delete memoryStorage[key];
    }
  },
  clear: (): void => {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.clear();
      }
      Object.keys(memoryStorage).forEach((key) => {
        delete memoryStorage[key];
      });
    } catch (e) {
      console.warn("localStorage clear failed, using memory fallback:", e);
      Object.keys(memoryStorage).forEach((key) => {
        delete memoryStorage[key];
      });
    }
  }
};

export const safeSessionStorage = {
  getItem: (key: string): string | null => {
    try {
      if (typeof window !== 'undefined' && window.sessionStorage) {
        return window.sessionStorage.getItem(key);
      }
      return memorySessionStorage[key] || null;
    } catch (e) {
      console.warn(`sessionStorage read failed for key "${key}", using memory fallback:`, e);
      return memorySessionStorage[key] || null;
    }
  },
  setItem: (key: string, value: string): void => {
    try {
      if (typeof window !== 'undefined' && window.sessionStorage) {
        window.sessionStorage.setItem(key, value);
      }
      memorySessionStorage[key] = value;
    } catch (e) {
      console.warn(`sessionStorage write failed for key "${key}", using memory fallback:`, e);
      memorySessionStorage[key] = value;
    }
  },
  removeItem: (key: string): void => {
    try {
      if (typeof window !== 'undefined' && window.sessionStorage) {
        window.sessionStorage.removeItem(key);
      }
      delete memorySessionStorage[key];
    } catch (e) {
      console.warn(`sessionStorage delete failed for key "${key}", using memory fallback:`, e);
      delete memorySessionStorage[key];
    }
  },
  clear: (): void => {
    try {
      if (typeof window !== 'undefined' && window.sessionStorage) {
        window.sessionStorage.clear();
      }
      Object.keys(memorySessionStorage).forEach((key) => {
        delete memorySessionStorage[key];
      });
    } catch (e) {
      console.warn("sessionStorage clear failed, using memory fallback:", e);
      Object.keys(memorySessionStorage).forEach((key) => {
        delete memorySessionStorage[key];
      });
    }
  }
};
