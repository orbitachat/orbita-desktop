// src/components/layout/ResizableSidebar.tsx
import React, { useState, useRef, useEffect, useCallback } from 'react';

interface ResizableSidebarProps {
  children: React.ReactNode;
  defaultWidth?: number;
  minWidth?: number;
  maxWidth?: number;
  className?: string;
  onWidthChange?: (width: number) => void;
}

const RESIZE_HANDLE_WIDTH = 6;
const MOBILE_BREAKPOINT = 680;
const MIN_CHAT_WIDTH = 300;
const MAX_WIDTH_PERCENT = 0.75;

export const ResizableSidebar: React.FC<ResizableSidebarProps> = ({
  children,
  defaultWidth = 320,
  minWidth = 260,
  maxWidth: propMaxWidth,
  className = '',
  onWidthChange,
}) => {
  const [width, setWidth] = useState(defaultWidth);
  const [isResizing, setIsResizing] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth < MOBILE_BREAKPOINT);

  const computeMaxWidth = useCallback(() => {
    if (propMaxWidth !== undefined) return propMaxWidth;
    const byChatReserve = window.innerWidth - MIN_CHAT_WIDTH;
    const byPercent = window.innerWidth * MAX_WIDTH_PERCENT;
    return Math.max(260, Math.min(byChatReserve, byPercent));
  }, [propMaxWidth]);

  const [maxWidth, setMaxWidth] = useState<number>(computeMaxWidth);
  const sidebarRef = useRef<HTMLDivElement>(null);
  const startXRef = useRef<number>(0);
  const startWidthRef = useRef<number>(0);

  useEffect(() => {
    if (propMaxWidth !== undefined) return;
    const handleResize = () => {
      const newMax = computeMaxWidth();
      setMaxWidth(newMax);
      setWidth((current) => Math.min(current, newMax));
    };
    window.addEventListener('resize', handleResize);
    handleResize();
    return () => window.removeEventListener('resize', handleResize);
  }, [propMaxWidth, computeMaxWidth]);

  useEffect(() => {
    if (propMaxWidth !== undefined) {
      setWidth((current) => Math.min(current, propMaxWidth));
    }
  }, [propMaxWidth]);

  useEffect(() => {
    const handleResize = () => {
      const mobile = window.innerWidth < MOBILE_BREAKPOINT;
      setIsMobile(mobile);
      if (mobile) setWidth(defaultWidth);
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [defaultWidth]);

  useEffect(() => {
    try {
      const savedWidth = localStorage.getItem('orbita-sidebar-width');
      if (savedWidth) {
        const parsed = parseInt(savedWidth, 10);
        if (!isNaN(parsed) && parsed >= minWidth && parsed <= maxWidth) {
          setWidth(parsed);
        }
      }
    } catch {}
  }, []);

  useEffect(() => {
    if (!isMobile) {
      try {
        localStorage.setItem('orbita-sidebar-width', String(width));
      } catch {}
    }
  }, [width, isMobile]);

  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (isMobile) return;
    e.preventDefault();
    setIsResizing(true);
    startXRef.current = e.clientX;
    startWidthRef.current = width;
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'col-resize';
  }, [isMobile, width]);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isResizing) return;
    const diff = e.clientX - startXRef.current;
    const newWidth = Math.min(maxWidth, Math.max(minWidth, startWidthRef.current + diff));
    setWidth(newWidth);
    onWidthChange?.(newWidth);
  }, [isResizing, minWidth, maxWidth, onWidthChange]);

  const handleMouseUp = useCallback(() => {
    if (isResizing) {
      setIsResizing(false);
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
    }
  }, [isResizing]);

  useEffect(() => {
    if (isResizing) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    } else {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
    };
  }, [isResizing, handleMouseMove, handleMouseUp]);

  const sidebarStyle: React.CSSProperties = {
    width: isMobile ? '100%' : `${width}px`,
    flexShrink: 0,
    position: 'relative',
    transition: 'none',
    backgroundColor: 'var(--chat-list-bg, #1e1e1e)',
    borderRight: 'none',
  };

  return (
    <div
      ref={sidebarRef}
      className={`flex flex-col h-full ${className}`}
      style={sidebarStyle}
    >
      {children}
      {!isMobile && (
        <div
          className="absolute top-0 right-0 h-full z-10"
          style={{
            width: RESIZE_HANDLE_WIDTH,
            transform: 'translateX(50%)',
            cursor: 'col-resize',
            background: 'transparent',
          }}
          onMouseDown={handleMouseDown}
        />
      )}
    </div>
  );
};