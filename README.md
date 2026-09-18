# xDev Asia — app di động

App React Native đọc nội dung từ [blog.xdev.asia](https://blog.xdev.asia): bài viết, series và bài học, bốn ngôn ngữ, đọc được khi không có mạng.

- **Expo SDK 57.0.23** · React Native 0.86.3 · React 19.2.3 · expo-router
- Bundle identifier: `asia.xdev.mobile` (iOS và Android dùng chung)

## Chạy thử

```bash
npm ci
npx expo start
```

Quét mã QR bằng **Expo Go**. Chưa cần development build — mọi thư viện native đang dùng đều nằm sẵn trong Expo Go.

## Nguồn dữ liệu

App đọc Content API tĩnh do chính repo blog sinh ra lúc build và phục vụ qua GitHub Pages:

```
https://blog.xdev.asia/api/v1/manifest.json
https://blog.xdev.asia/api/v1/{locale}/index.json
https://blog.xdev.asia/api/v1/{locale}/series.json
https://blog.xdev.asia/api/v1/{locale}/taxonomy.json
https://blog.xdev.asia/api/v1/content/**/*.md
```

Base URL nằm ở một chỗ duy nhất, đọc từ `EXPO_PUBLIC_API_BASE`. Muốn chạy với API dựng tại máy:

```bash
# trong repo blog
npm run build && npx serve out

# trong repo này
EXPO_PUBLIC_API_BASE=http://localhost:3000/api/v1 npx expo start
```

## Chat AI trong bài viết

Màn đọc bài (`src/app/post/[slug].tsx`) có nút 💬 trên header mở chat hỏi AI về
đúng bài đang đọc (Gemini 2.5 Flash qua Firebase AI Logic, project `xdev-asia`
— cùng project và model web `blog.xdev.asia` đang dùng ở
`AIChatWidget.tsx`). Chạy được cả khi chưa đăng nhập. Bài dài bị cắt còn 6000
ký tự đầu trước khi đưa vào prompt (`src/content/chat.ts`).

**⚠️ Chưa có App Check.** `firebase/ai` được gọi thẳng bằng `apiKey` public
trong `src/firebase/config.ts` — client nào lấy được config này (đọc được từ
bundle, không phải bí mật) đều gọi được Gemini bằng quota của project
`xdev-asia`, không chỉ từ app này. Đây là đánh đổi có chủ đích: bật App Check
cần rời Expo Go (App Attest / Play Integrity chỉ có ở
`@react-native-firebase/app-check`, một native module), và enforcement còn
chưa bật ở phía project. Việc bật App Check là Task 14b, làm gần lúc phát
hành. Đừng tưởng chat này đã được bảo vệ quota chỉ vì nó chạy được.

## Kiểm tra

```bash
npm run typecheck
npm run lint
npm test
```

Cả ba chạy trong CI trên mọi pull request. Contract test còn chạy theo lịch hằng ngày, vì Content API nằm ở repo khác và có thể đổi shape mà repo này không hay biết.

## Build và phát hành

| Workflow | Kích hoạt | Việc |
|---|---|---|
| `ci.yml` | mọi PR, push vào `main`, và cron hằng ngày | typecheck, lint, test |
| `build.yml` | tag `v*` hoặc bấm nút | EAS Build |
| `submit.yml` | chỉ bấm nút | EAS Submit |

**Cố ý không build trên mỗi lần push.** EAS free tier cho 15 build iOS và 15 build Android mỗi tháng, hàng chờ ưu tiên thấp có lúc chờ hơn 90 phút, timeout 45 phút. Build mỗi push sẽ dùng hết quota trong khoảng một tuần và làm nghẽn hàng chờ đúng lúc cần build thật.

`submit.yml` mặc định đẩy vào **TestFlight** (iOS) và **track internal testing** (Android), không phải bản public. Phát hành ra công chúng làm trong App Store Connect / Play Console.

## Cần cấu hình trước khi build được

Chưa làm những bước này thì `build.yml` và `submit.yml` sẽ fail. Đây là việc cần tài khoản và credential, không tự động hoá được.

### 1. Expo

```bash
npm install -g eas-cli@latest
eas login
eas init            # ghi projectId vào app.json
```

Tạo access token ở https://expo.dev/settings/access-tokens rồi thêm vào GitHub Secrets:

- `EXPO_TOKEN`

### 2. Apple

- Tạo app record trong App Store Connect với bundle identifier `asia.xdev.mobile`
- Sinh App Store Connect API Key (`.p8`), ghi lại **Key ID** và **Issuer ID**
- Ghi lại **Apple Team ID**
- Điền hai giá trị đang để trống trong `eas.json`: `submit.production.ios.ascAppId` và `appleTeamId`
- Nạp API key vào EAS: `eas credentials`

### 3. Google Play

- Tạo app trong Play Console với package `asia.xdev.mobile`
- Tạo Google Service Account, cấp quyền phát hành trong Play Console, tải JSON key
- Thêm vào GitHub Secrets dưới dạng base64:

```bash
base64 -i service-account.json | pbcopy
```

- `GOOGLE_SERVICE_ACCOUNT_JSON_BASE64`

Lần submit đầu tiên, `eas submit` tự tạo release ở track internal testing.

## Credential không bao giờ nằm trong repo

Repo này public. `.gitignore` chặn `*.p8`, `*.p12`, `*.jks`, `*.keystore`, `*service-account*.json`, `google-services.json`, `GoogleService-Info.plist` và mọi file `.env`. Credential thuộc về EAS và GitHub Secrets.

Trong `submit.yml`, service account key được ghi ra file ngay trước khi dùng và xoá ở bước `always()`, kể cả khi bước submit thất bại.

## Ghi chú cho người sửa code

`AGENTS.md` nhắc: Expo SDK 57 khác nhiều so với các bản trước. Đọc tài liệu đúng version tại https://docs.expo.dev/versions/v57.0.0/ trước khi viết code.

Hai chỗ lệch so với scaffold gốc của `create-expo-app`, đều có lý do:

- `types/expo-references.d.ts` — template không typecheck sạch vì thiếu tham chiếu tới `expo/types`. File `expo-env.d.ts` đảm nhiệm việc đó bị gitignore và không phải lệnh nào cũng sinh ra, nên CI trên checkout sạch sẽ đỏ. Tham chiếu được đặt vào một file của repo để không phụ thuộc artefact sinh tự động.
- `src/hooks/use-color-scheme.web.ts` — bản gốc dùng `useState` + `useEffect` để dò hydration, vi phạm rule `react-hooks/set-state-in-effect`. Viết lại bằng `useSyncExternalStore`.
