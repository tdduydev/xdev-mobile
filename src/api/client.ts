import { API_BASE, type Locale } from "./config";
import {
  IndexSchema,
  ManifestSchema,
  SeriesListSchema,
  TaxonomySchema,
  type IndexEntry,
  type Manifest,
  type Series,
  type Taxonomy,
} from "./schema";

/**
 * No `Accept-Encoding` header is set here on purpose.
 *
 * Verified in this repo's test environment: Node's `fetch` already
 * negotiates gzip by default and transparently decompresses the body — see
 * the "gzip" test in contract.test.ts, which measures the real response
 * (283 KB, not 2.07 MB) with no header set here.
 *
 * [Inference] React Native's Android networking is built on OkHttp, which
 * (per its own documentation) adds `Accept-Encoding: gzip` itself and
 * transparently decompresses — but explicitly stops doing the transparent
 * decompression when a *caller* sets that header, which would hand back raw
 * gzip bytes and break `response.json()`. This is a known historical sharp
 * edge in React Native's fetch on Android; this repo has not verified it
 * against RN 0.86.3 on-device, since this environment has no Android/iOS
 * runtime to test against. Not setting the header is the safer default
 * either way — see task-2-report.md for the concern this leaves open.
 */
async function getJson(path: string): Promise<unknown> {
  const url = `${API_BASE}/${path}`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`xdev API request failed: GET ${url} -> HTTP ${response.status}`);
  }
  return response.json();
}

export async function fetchManifest(): Promise<Manifest> {
  return ManifestSchema.parse(await getJson("manifest.json"));
}

export async function fetchIndex(locale: Locale): Promise<IndexEntry[]> {
  return IndexSchema.parse(await getJson(`${locale}/index.json`));
}

export async function fetchSeriesList(locale: Locale): Promise<Series[]> {
  return SeriesListSchema.parse(await getJson(`${locale}/series.json`));
}

export async function fetchTaxonomy(locale: Locale): Promise<Taxonomy> {
  return TaxonomySchema.parse(await getJson(`${locale}/taxonomy.json`));
}

/**
 * Fetches the raw markdown body for an index entry. `path` is relative to
 * `API_BASE` (as returned in `IndexEntry.path`), never a full URL.
 */
export async function fetchMarkdown(path: string): Promise<string> {
  const url = `${API_BASE}/${path}`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`xdev API request failed: GET ${url} -> HTTP ${response.status}`);
  }
  const text = await response.text();
  if (text.length === 0) {
    throw new Error(`xdev API returned empty markdown body: GET ${url}`);
  }
  return text;
}
