import 'react-native-url-polyfill/auto';
import { createClient } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';

const SUPABASE_URL = 'https://vznyoinrahdeiyqfsrcb.supabase.co';
const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ6bnlvaW5yYWhkZWl5cWZzcmNiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg4Nzk4NzIsImV4cCI6MjA5NDQ1NTg3Mn0.lLc3_SOW3ZroFVZIGuvL-LX5IzP_eKplFYLgW8OFvmo';

const CHUNK_SIZE = 1800;
const CHUNK_MARKER = '__sb_chunked_v1__:';

function utf8ByteLength(str) {
  let len = 0;
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i);
    if (code < 0x80) len += 1;
    else if (code < 0x800) len += 2;
    else if (code >= 0xd800 && code <= 0xdbff) {
      len += 4;
      i++;
    } else len += 3;
  }
  return len;
}

function splitByBytes(str, maxBytes) {
  const chunks = [];
  let start = 0;
  while (start < str.length) {
    let bytes = 0;
    let end = start;
    while (end < str.length) {
      const code = str.charCodeAt(end);
      let cb;
      if (code < 0x80) cb = 1;
      else if (code < 0x800) cb = 2;
      else if (code >= 0xd800 && code <= 0xdbff) cb = 4;
      else cb = 3;
      if (bytes + cb > maxBytes) break;
      bytes += cb;
      end += code >= 0xd800 && code <= 0xdbff ? 2 : 1;
    }
    if (end === start) end = start + 1;
    chunks.push(str.slice(start, end));
    start = end;
  }
  return chunks;
}

async function clearChunks(key, count) {
  for (let i = 0; i < count; i++) {
    try {
      await SecureStore.deleteItemAsync(`${key}.${i}`);
    } catch {}
  }
}

const ExpoSecureStoreAdapter = {
  async getItem(key) {
    const head = await SecureStore.getItemAsync(key);
    if (head == null) return null;
    if (!head.startsWith(CHUNK_MARKER)) return head;
    const count = parseInt(head.slice(CHUNK_MARKER.length), 10);
    if (isNaN(count) || count < 1) return null;
    let result = '';
    for (let i = 0; i < count; i++) {
      const part = await SecureStore.getItemAsync(`${key}.${i}`);
      if (part == null) return null;
      result += part;
    }
    return result;
  },

  async setItem(key, value) {
    const prev = await SecureStore.getItemAsync(key);
    if (prev && prev.startsWith(CHUNK_MARKER)) {
      const oldCount = parseInt(prev.slice(CHUNK_MARKER.length), 10);
      if (!isNaN(oldCount)) await clearChunks(key, oldCount);
    }

    if (utf8ByteLength(value) <= CHUNK_SIZE) {
      await SecureStore.setItemAsync(key, value);
      return;
    }

    const chunks = splitByBytes(value, CHUNK_SIZE);
    for (let i = 0; i < chunks.length; i++) {
      await SecureStore.setItemAsync(`${key}.${i}`, chunks[i]);
    }
    await SecureStore.setItemAsync(key, `${CHUNK_MARKER}${chunks.length}`);
  },

  async removeItem(key) {
    const head = await SecureStore.getItemAsync(key);
    if (head && head.startsWith(CHUNK_MARKER)) {
      const count = parseInt(head.slice(CHUNK_MARKER.length), 10);
      if (!isNaN(count)) await clearChunks(key, count);
    }
    await SecureStore.deleteItemAsync(key);
  },
};

const FETCH_TIMEOUT_MS = 15000;

const fetchWithTimeout = (input, init = {}) => {
  const controller = new AbortController();
  const userSignal = init.signal;
  if (userSignal) {
    if (userSignal.aborted) controller.abort();
    else userSignal.addEventListener('abort', () => controller.abort(), { once: true });
  }
  const timer = setTimeout(() => {
    console.warn('[supabase] fetch aborted after', FETCH_TIMEOUT_MS, 'ms ->', input);
    controller.abort();
  }, FETCH_TIMEOUT_MS);
  return fetch(input, { ...init, signal: controller.signal }).finally(() =>
    clearTimeout(timer)
  );
};

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: ExpoSecureStoreAdapter,
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
  global: {
    fetch: fetchWithTimeout,
  },
});
