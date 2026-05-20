/**
 * 智能自动滚动 Hook
 *
 * 提供消息列表的粘底能力，同时允许用户在处理中自由上滑查看历史消息。
 * 只有当用户明确回到底部附近时，才重新开启自动滚动。
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import type { ClaudeStreamMessage } from '@/types/claude';

interface SmartAutoScrollConfig {
  /** 可显示的消息列表（用于触发滚动） */
  displayableMessages: ClaudeStreamMessage[];
  /** 是否正在处理中（流式输出时） */
  isLoading: boolean;
}

interface SmartAutoScrollReturn {
  /** 滚动容器 ref */
  parentRef: React.RefObject<HTMLDivElement>;
  /** 用户是否主动离开底部 */
  userScrolled: boolean;
  /** 设置用户滚动状态 */
  setUserScrolled: (scrolled: boolean) => void;
  /** 设置自动滚动状态 */
  setShouldAutoScroll: (should: boolean) => void;
}

const RESUME_AUTO_SCROLL_THRESHOLD = 80;
const STOP_AUTO_SCROLL_THRESHOLD = 140;

/**
 * 计算最后一条消息的内容哈希，用于检测内容变化
 */
function getLastMessageContentHash(messages: ClaudeStreamMessage[]): string {
  if (messages.length === 0) return '';

  const lastMessage = messages[messages.length - 1];
  const contentLength = JSON.stringify(lastMessage.message?.content || '').length;

  return `${messages.length}-${lastMessage.type}-${contentLength}`;
}

/**
 * 获取距离底部的像素距离
 */
function getDistanceFromBottom(element: HTMLDivElement): number {
  return element.scrollHeight - element.scrollTop - element.clientHeight;
}

export function useSmartAutoScroll(config: SmartAutoScrollConfig): SmartAutoScrollReturn {
  const { displayableMessages, isLoading } = config;

  const [userScrolled, setUserScrolledState] = useState(false);
  const [shouldAutoScroll, setShouldAutoScrollState] = useState(true);

  const parentRef = useRef<HTMLDivElement>(null);
  const isAutoScrollingRef = useRef(false);
  const autoScrollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoScrollEnabledRef = useRef(true);

  const lastMessageHash = useMemo(
    () => getLastMessageContentHash(displayableMessages),
    [displayableMessages]
  );

  /**
   * 同步自动滚动与“用户已离开底部”两个状态，避免它们互相打架。
   */
  const syncAutoScrollState = (enabled: boolean) => {
    autoScrollEnabledRef.current = enabled;
    setShouldAutoScrollState(enabled);
    setUserScrolledState(!enabled);
  };

  const setUserScrolled = (scrolled: boolean) => {
    syncAutoScrollState(!scrolled);
  };

  const setShouldAutoScroll = (should: boolean) => {
    syncAutoScrollState(should);
  };

  /**
   * 执行自动滚动，并在滚动动画期间忽略由程序触发的 scroll 事件。
   */
  const performAutoScroll = (behavior: ScrollBehavior = 'smooth') => {
    const scrollElement = parentRef.current;
    if (!scrollElement) return;

    const targetScrollTop = scrollElement.scrollHeight - scrollElement.clientHeight;
    if (Math.abs(scrollElement.scrollTop - targetScrollTop) <= 1) {
      return;
    }

    isAutoScrollingRef.current = true;
    if (autoScrollTimerRef.current) {
      clearTimeout(autoScrollTimerRef.current);
    }

    const flagTimeout = behavior === 'smooth' ? 320 : 100;
    autoScrollTimerRef.current = setTimeout(() => {
      isAutoScrollingRef.current = false;
      autoScrollTimerRef.current = null;
    }, flagTimeout);

    scrollElement.scrollTo({
      top: targetScrollTop,
      behavior
    });
  };

  useEffect(() => {
    const scrollElement = parentRef.current;
    if (!scrollElement) return;

    const handleScroll = () => {
      if (isAutoScrollingRef.current) {
        return;
      }

      const distanceFromBottom = getDistanceFromBottom(scrollElement);

      if (distanceFromBottom <= RESUME_AUTO_SCROLL_THRESHOLD) {
        syncAutoScrollState(true);
        return;
      }

      if (distanceFromBottom >= STOP_AUTO_SCROLL_THRESHOLD) {
        syncAutoScrollState(false);
      }
    };

    scrollElement.addEventListener('scroll', handleScroll, { passive: true });

    return () => {
      scrollElement.removeEventListener('scroll', handleScroll);
    };
  }, []);

  useEffect(() => {
    return () => {
      if (autoScrollTimerRef.current) {
        clearTimeout(autoScrollTimerRef.current);
      }
    };
  }, []);

  /**
   * 新消息到达时，仅在仍然处于粘底状态下跟随到底部。
   */
  useEffect(() => {
    if (displayableMessages.length === 0 || !shouldAutoScroll || userScrolled) {
      return;
    }

    const timeoutId = setTimeout(() => {
      requestAnimationFrame(() => performAutoScroll(isLoading ? 'auto' : 'smooth'));
    }, 80);

    return () => clearTimeout(timeoutId);
  }, [displayableMessages.length, isLoading, lastMessageHash, shouldAutoScroll, userScrolled]);

  /**
   * 流式输出期间持续跟随最新内容，但用户一旦离开底部就立即停止。
   */
  useEffect(() => {
    if (!isLoading || !shouldAutoScroll || userScrolled) {
      return;
    }

    performAutoScroll('auto');

    let rafId = 0;
    let lastScrollTime = 0;

    const tick = (timestamp: number) => {
      if (timestamp - lastScrollTime >= 100) {
        performAutoScroll('auto');
        lastScrollTime = timestamp;
      }

      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);

    return () => cancelAnimationFrame(rafId);
  }, [isLoading, shouldAutoScroll, userScrolled, lastMessageHash]);

  /**
   * 非流式状态下给虚拟列表一个短暂的“粘底窗口”，用于处理高度重测后的补滚动。
   */
  useEffect(() => {
    if (isLoading || !shouldAutoScroll || userScrolled || displayableMessages.length === 0) {
      return;
    }

    let ticks = 0;
    const intervalId = setInterval(() => {
      ticks += 1;
      requestAnimationFrame(() => performAutoScroll('auto'));

      if (ticks >= 8) {
        clearInterval(intervalId);
      }
    }, 100);

    return () => clearInterval(intervalId);
  }, [displayableMessages.length, isLoading, lastMessageHash, shouldAutoScroll, userScrolled]);

  return {
    parentRef,
    userScrolled,
    setUserScrolled,
    setShouldAutoScroll
  };
}
