// Kéo type toàn cục của Expo vào, gồm cả khai báo cho `*.css` và `*.module.css`
// mà template mặc định có dùng (src/constants/theme.ts, animated-icon.web.tsx).
//
// Bình thường việc này do `expo-env.d.ts` làm, nhưng file đó nằm trong .gitignore
// của Expo và không phải lệnh nào cũng sinh ra nó — `expo export` thì không.
// Hệ quả: `tsc --noEmit` đỏ trên một checkout sạch, tức CI đỏ ngay ngày đầu.
//
// Đặt tham chiếu vào một file của chính repo thì nó được commit, và typecheck
// không còn phụ thuộc vào một artefact sinh tự động.
/// <reference types="expo/types" />
