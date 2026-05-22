import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import type {
  CSSProperties,
  KeyboardEvent,
  ReactElement,
  ReactNode,
} from "react";

// ── Context ────────────────────────────────────────────────
interface TabsCtx {
  baseId: string;
  activeIndex: number;
  setActiveIndex: (i: number) => void;
  registerTab: (index: number, el: HTMLButtonElement | null) => void;
  focusTab: (index: number) => void;
  tabCount: number;
  registerTabCount: (count: number) => void;
}

const TabsContext = createContext<TabsCtx | null>(null);

function useTabsCtx(): TabsCtx {
  const ctx = useContext(TabsContext);
  if (!ctx) {
    throw new Error("Tabs subcomponents must be used inside <Tabs>");
  }
  return ctx;
}

// ── <Tabs> ─────────────────────────────────────────────────
export interface TabsProps {
  defaultIndex?: number;
  index?: number;
  onChange?: (index: number) => void;
  children?: ReactNode;
  className?: string;
  style?: CSSProperties;
}

export function Tabs({
  defaultIndex = 0,
  index,
  onChange,
  children,
  className,
  style,
}: TabsProps): ReactElement {
  const baseId = useId();
  const [internalIndex, setInternalIndex] = useState(defaultIndex);
  const [tabCount, setTabCount] = useState(0);
  const tabRefs = useRef<Map<number, HTMLButtonElement>>(new Map());

  const isControlled = index !== undefined;
  const activeIndex = isControlled ? (index as number) : internalIndex;

  const setActiveIndex = useCallback(
    (i: number) => {
      if (!isControlled) setInternalIndex(i);
      onChange?.(i);
    },
    [isControlled, onChange]
  );

  const registerTab = useCallback(
    (i: number, el: HTMLButtonElement | null) => {
      if (el) tabRefs.current.set(i, el);
      else tabRefs.current.delete(i);
    },
    []
  );

  const focusTab = useCallback((i: number) => {
    const el = tabRefs.current.get(i);
    el?.focus();
  }, []);

  const registerTabCount = useCallback((count: number) => {
    setTabCount((prev) => (prev === count ? prev : count));
  }, []);

  const ctxValue = useMemo<TabsCtx>(
    () => ({
      baseId,
      activeIndex,
      setActiveIndex,
      registerTab,
      focusTab,
      tabCount,
      registerTabCount,
    }),
    [
      baseId,
      activeIndex,
      setActiveIndex,
      registerTab,
      focusTab,
      tabCount,
      registerTabCount,
    ]
  );

  return (
    <TabsContext.Provider value={ctxValue}>
      <div
        className={className}
        style={{
          display: "flex",
          flexDirection: "column",
          width: "100%",
          color: "#e5e7eb",
          ...style,
        }}
      >
        {children}
      </div>
    </TabsContext.Provider>
  );
}

// ── <TabList> ──────────────────────────────────────────────
export interface TabListProps {
  children?: ReactNode;
  "aria-label"?: string;
  className?: string;
  style?: CSSProperties;
}

export function TabList({
  children,
  "aria-label": ariaLabel,
  className,
  style,
}: TabListProps): ReactElement {
  const ctx = useTabsCtx();

  // Count Tab children
  const childArray = Array.isArray(children) ? children.flat() : [children];
  const validCount = childArray.filter(Boolean).length;

  useEffect(() => {
    ctx.registerTabCount(validCount);
  }, [ctx, validCount]);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const total = ctx.tabCount || validCount;
    if (total <= 0) return;
    let nextIndex = ctx.activeIndex;
    if (e.key === "ArrowRight") {
      nextIndex = (ctx.activeIndex + 1) % total;
    } else if (e.key === "ArrowLeft") {
      nextIndex = (ctx.activeIndex - 1 + total) % total;
    } else if (e.key === "Home") {
      nextIndex = 0;
    } else if (e.key === "End") {
      nextIndex = total - 1;
    } else {
      return;
    }
    e.preventDefault();
    ctx.setActiveIndex(nextIndex);
    // Focus next tick to let render commit
    window.requestAnimationFrame(() => ctx.focusTab(nextIndex));
  };

  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      onKeyDown={onKeyDown}
      className={className}
      style={{
        display: "flex",
        gap: 4,
        borderBottom: "1px solid rgba(255, 255, 255, 0.08)",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

// ── <Tab> ──────────────────────────────────────────────────
export interface TabProps {
  index: number;
  children?: ReactNode;
  disabled?: boolean;
  className?: string;
  style?: CSSProperties;
}

export function Tab({
  index,
  children,
  disabled = false,
  className,
  style,
}: TabProps): ReactElement {
  const ctx = useTabsCtx();
  const ref = useRef<HTMLButtonElement | null>(null);
  const isActive = ctx.activeIndex === index;

  useEffect(() => {
    ctx.registerTab(index, ref.current);
    return () => ctx.registerTab(index, null);
  }, [ctx, index]);

  const tabId = `${ctx.baseId}-tab-${index}`;
  const panelId = `${ctx.baseId}-panel-${index}`;

  const rootStyle: CSSProperties = {
    position: "relative",
    padding: "10px 14px",
    fontSize: 13,
    fontWeight: 600,
    fontFamily: "inherit",
    color: isActive ? "#f5f3ff" : "rgba(229, 231, 235, 0.65)",
    background: "transparent",
    border: "none",
    borderRadius: 6,
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.5 : 1,
    outline: "none",
    transition: "color 160ms ease, background 160ms ease",
    ...style,
  };

  const indicatorStyle: CSSProperties = {
    position: "absolute",
    left: 8,
    right: 8,
    bottom: -1,
    height: 2,
    background: "linear-gradient(90deg, #8b5cf6 0%, #ec4899 100%)",
    borderRadius: 2,
    transform: isActive ? "scaleX(1)" : "scaleX(0)",
    transformOrigin: "center",
    transition: "transform 220ms ease",
    boxShadow: isActive ? "0 0 8px rgba(139, 92, 246, 0.6)" : "none",
    pointerEvents: "none",
  };

  return (
    <button
      ref={ref}
      type="button"
      role="tab"
      id={tabId}
      aria-selected={isActive}
      aria-controls={panelId}
      tabIndex={isActive ? 0 : -1}
      disabled={disabled}
      onClick={() => {
        if (!disabled) ctx.setActiveIndex(index);
      }}
      className={className}
      style={rootStyle}
    >
      {children}
      <span style={indicatorStyle} aria-hidden />
    </button>
  );
}

// ── <TabPanels> ────────────────────────────────────────────
export interface TabPanelsProps {
  children?: ReactNode;
  className?: string;
  style?: CSSProperties;
}

export function TabPanels({
  children,
  className,
  style,
}: TabPanelsProps): ReactElement {
  return (
    <div
      className={className}
      style={{
        paddingTop: 12,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

// ── <TabPanel> ─────────────────────────────────────────────
export interface TabPanelProps {
  index: number;
  children?: ReactNode;
  keepMounted?: boolean;
  className?: string;
  style?: CSSProperties;
}

export function TabPanel({
  index,
  children,
  keepMounted = false,
  className,
  style,
}: TabPanelProps): ReactElement | null {
  const ctx = useTabsCtx();
  const isActive = ctx.activeIndex === index;

  if (!isActive && !keepMounted) return null;

  const panelId = `${ctx.baseId}-panel-${index}`;
  const tabId = `${ctx.baseId}-tab-${index}`;

  return (
    <div
      role="tabpanel"
      id={panelId}
      aria-labelledby={tabId}
      hidden={!isActive}
      tabIndex={0}
      className={className}
      style={{
        outline: "none",
        ...style,
      }}
    >
      {children}
    </div>
  );
}
