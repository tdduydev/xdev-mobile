import { useSyncExternalStore } from 'react';
import { useColorScheme as useRNColorScheme } from 'react-native';

import { useThemeMode } from '@/state/theme';

/**
 * To support static rendering, this value needs to be re-calculated on the client side for web
 */

// Không bao giờ phát tín hiệu thay đổi: giá trị chỉ khác nhau giữa server và
// client, và chuyển trạng thái đó đã do chính quá trình hydrate thực hiện.
const subscribe = () => () => {};

/** Web counterpart of `use-color-scheme.ts` — see its docstring. */
export function useColorScheme(): 'light' | 'dark' {
  // useSyncExternalStore trả snapshot của server khi render trên server và
  // snapshot của client sau khi hydrate. Bản cũ dùng useState + useEffect để
  // dò hydration, nhưng đó là setState-trong-effect — rule react-hooks của
  // React Compiler bắt lỗi, và nó gây thêm một lần render thừa.
  const hasHydrated = useSyncExternalStore(
    subscribe,
    () => true,
    () => false
  );

  const { mode } = useThemeMode();
  const system = useRNColorScheme();

  if (!hasHydrated) return 'light';
  if (mode === 'light' || mode === 'dark') return mode;
  return system === 'dark' ? 'dark' : 'light';
}
