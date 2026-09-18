import { describe, expect, it } from "vitest";
import app from "../app.json";

// Bundle identifier là thứ không được đổi sau khi app đã lên store: đổi nó là
// tạo một app MỚI trên store chứ không phải cập nhật app cũ. Người dùng cũ
// không nhận được bản mới, đánh giá và lượt cài bắt đầu lại từ 0.
//
// Test này tồn tại để một lần sửa app.json vô ý không âm thầm làm việc đó.
describe("danh tính app", () => {
  it("bundle identifier iOS cố định", () => {
    expect(app.expo.ios.bundleIdentifier).toBe("asia.xdev.mobile");
  });

  it("package Android cố định", () => {
    expect(app.expo.android.package).toBe("asia.xdev.mobile");
  });

  it("iOS và Android dùng chung một identifier", () => {
    expect(app.expo.ios.bundleIdentifier).toBe(app.expo.android.package);
  });

  it("scheme deep link cố định", () => {
    expect(app.expo.scheme).toBe("xdevasia");
  });
});
