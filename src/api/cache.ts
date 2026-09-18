import AsyncStorage from "@react-native-async-storage/async-storage";
import { Directory, File, Paths } from "expo-file-system";
import type { Locale } from "./config";
import { fetchIndex, fetchMarkdown } from "./client";
import { IndexSchema, type IndexEntry } from "./schema";

const INDEX_CACHE_PREFIX = "xdev:index:";

function indexCacheKey(locale: Locale): string {
  return `${INDEX_CACHE_PREFIX}${locale}`;
}

/**
 * Read-through cache for a locale's index: returns the cached array if one
 * is stored on the device, otherwise fetches it from the network and stores
 * it for next time.
 */
export async function getCachedIndex(locale: Locale): Promise<IndexEntry[]> {
  const cached = await AsyncStorage.getItem(indexCacheKey(locale));
  if (cached !== null) {
    return IndexSchema.parse(JSON.parse(cached));
  }
  const entries = await fetchIndex(locale);
  await AsyncStorage.setItem(indexCacheKey(locale), JSON.stringify(entries));
  return entries;
}

const markdownDirectory = new Directory(Paths.cache, "markdown");

function markdownCacheFile(path: string): File {
  const safeName = path.replace(/[^a-zA-Z0-9._-]/g, "_");
  return new File(markdownDirectory, safeName);
}

/**
 * Read-through cache for a lesson/post's markdown body, backed by the
 * filesystem cache directory (`Paths.cache` — the system may reclaim it
 * under storage pressure, which is fine: it is a cache, not a source of
 * truth).
 */
export async function getCachedMarkdown(path: string): Promise<string> {
  const file = markdownCacheFile(path);
  if (file.exists) {
    return file.textSync();
  }
  const content = await fetchMarkdown(path);
  // `create()` throws if the target already exists (expo-file-system v57
  // .d.ts). The cache directory is shared across every call, so it already
  // exists after the first markdown write — `idempotent: true` is required
  // or the SECOND call of the app's lifetime throws. `overwrite: true` on
  // the file is the same guard for the (rare) case a stale, empty file was
  // left behind by a previous failed write.
  markdownDirectory.create({ idempotent: true, intermediates: true });
  file.create({ overwrite: true });
  file.write(content);
  return content;
}
