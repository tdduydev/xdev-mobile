import { beforeEach, describe, expect, it, vi } from "vitest";

// This is the ONE test the brief explicitly calls out: "Phiên còn sau khi
// khởi động lại app (test persistence layer, không cần test UI)" —
// asserting `initializeAuth` is wired to
// `getReactNativePersistence(AsyncStorage)`, not a bare `getAuth()` (which
// firebase's own RN entrypoint docs warn will NOT persist the session
// across a relaunch). Everything firebase-related is mocked wholesale, same
// style as tests/cache.test.ts and tests/firebase-sync.test.ts, so this
// suite asserts on wiring, never touches a real project.

const ASYNC_STORAGE_SENTINEL = { __kind: "async-storage-sentinel" };
vi.mock("@react-native-async-storage/async-storage", () => ({ default: ASYNC_STORAGE_SENTINEL }));

const FAKE_APP = { __kind: "fake-app" };
vi.mock("firebase/app", () => ({
  getApps: vi.fn(() => []),
  initializeApp: vi.fn(() => FAKE_APP),
}));

const PERSISTENCE_SENTINEL = { __kind: "persistence-sentinel" };
vi.mock("firebase/auth", () => ({
  getReactNativePersistence: vi.fn(() => PERSISTENCE_SENTINEL),
  initializeAuth: vi.fn(() => ({ __kind: "fake-auth" })),
}));

vi.mock("firebase/firestore", () => ({
  getFirestore: vi.fn(() => ({ __kind: "fake-firestore" })),
}));

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
});

describe("getFirebaseAuth", () => {
  it("calls initializeAuth with { persistence: getReactNativePersistence(AsyncStorage) }, never getAuth()", async () => {
    const { getReactNativePersistence, initializeAuth } = await import("firebase/auth");
    const { getFirebaseAuth } = await import("../src/firebase/app");

    getFirebaseAuth();

    expect(getReactNativePersistence).toHaveBeenCalledWith(ASYNC_STORAGE_SENTINEL);
    expect(initializeAuth).toHaveBeenCalledWith(FAKE_APP, { persistence: PERSISTENCE_SENTINEL });
  });

  it("only initializes once across repeated calls (lazy singleton, like cache.ts's Directory/File)", async () => {
    const { initializeAuth } = await import("firebase/auth");
    const { getFirebaseAuth } = await import("../src/firebase/app");

    const first = getFirebaseAuth();
    const second = getFirebaseAuth();

    expect(first).toBe(second);
    expect(initializeAuth).toHaveBeenCalledTimes(1);
  });
});

describe("getFirebaseApp", () => {
  it("reuses an existing app instead of calling initializeApp twice", async () => {
    const { getApps, initializeApp } = await import("firebase/app");
    vi.mocked(getApps).mockReturnValue([FAKE_APP] as never);
    const { getFirebaseApp } = await import("../src/firebase/app");

    const app = getFirebaseApp();

    expect(app).toBe(FAKE_APP);
    expect(initializeApp).not.toHaveBeenCalled();
  });
});
