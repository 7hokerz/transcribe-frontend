import { useState, useCallback } from 'react';

/**
 * Next.js 환경에서 안전하게 sessionStorage에 접근하기 위한 커스텀 훅
 *
 * @param key - sessionStorage 키
 * @param initialValue - 초기값 (선택사항)
 * @returns value: 저장된 값, setValue: 값 설정 함수, getItem: 값 가져오기 함수, removeItem: 값 삭제 함수
 */
export function useSessionStorage<T = string>(key: string, initialValue?: T) {
  const [storedValue, setStoredValue] = useState<T | null>(() => {
    // SSR 환경에서는 null 반환
    if (typeof window === 'undefined') {
      return initialValue ?? null;
    }

    try {
      const item = window.sessionStorage.getItem(key);
      if (!item) {
        return initialValue ?? null;
      }

      // JSON으로 파싱 시도, 실패하면 원본 문자열 반환
      try {
        return JSON.parse(item) as T;
      } catch {
        // JSON이 아닌 일반 문자열인 경우 그대로 반환
        return item as T;
      }
    } catch (error) {
      console.error(`sessionStorage 키 "${key}" 읽기 오류:`, error);
      return initialValue ?? null;
    }
  });

  const setValue = useCallback((value: T | null) => {
    try {
      setStoredValue(value);

      if (typeof window === 'undefined') {
        return;
      }

      if (value === null) {
        window.sessionStorage.removeItem(key);
      } else {
        // 문자열이면 그대로, 객체면 JSON.stringify
        const stringValue = typeof value === 'string' ? value : JSON.stringify(value);
        window.sessionStorage.setItem(key, stringValue);
      }
    } catch (error) {
      console.error(`sessionStorage 키 "${key}" 설정 오류:`, error);
    }
  }, [key]);

  const getItem = useCallback(() => {
    if (typeof window === 'undefined') {
      return null;
    }

    try {
      const item = window.sessionStorage.getItem(key);
      return item;
    } catch (error) {
      console.error(`sessionStorage 키 "${key}" 가져오기 오류:`, error);
      return null;
    }
  }, [key]);

  const removeItem = useCallback(() => {
    setValue(null);
  }, [setValue]);

  return { value: storedValue, setValue, getItem, removeItem };
}
