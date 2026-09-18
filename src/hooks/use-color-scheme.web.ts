import { useSyncExternalStore } from 'react';
import { useColorScheme as useRNColorScheme } from 'react-native';

/**
 * To support static rendering, this value needs to be re-calculated on the client side for web
 */

// Không bao giờ phát tín hiệu thay đổi: giá trị chỉ khác nhau giữa server và
// client, và chuyển trạng thái đó đã do chính quá trình hydrate thực hiện.
const subscribe = () => () => {};

export function useColorScheme() {
  // useSyncExternalStore trả snapshot của server khi render trên server và
  // snapshot của client sau khi hydrate. Bản cũ dùng useState + useEffect để
  // dò hydration, nhưng đó là setState-trong-effect — rule react-hooks của
  // React Compiler bắt lỗi, và nó gây thêm một lần render thừa.
  const hasHydrated = useSyncExternalStore(
    subscribe,
    () => true,
    () => false
  );

  const colorScheme = useRNColorScheme();

  return hasHydrated ? colorScheme : 'light';
}
