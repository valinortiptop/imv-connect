// react-router-dom → @tanstack/react-router compatibility shim
// for ported reference files.
import {
  useNavigate as tsNavigate,
  useParams as tsParams,
  useSearch as tsSearch,
  Link as TSLink,
  type LinkProps,
} from "@tanstack/react-router";
import { forwardRef, useCallback, useMemo } from "react";

// useNavigate: support navigate("/path") and navigate(-1)
export function useNavigate() {
  const nav = tsNavigate();
  return (to: string | number, opts?: { replace?: boolean }) => {
    if (typeof to === "number") {
      if (typeof window !== "undefined") window.history.go(to);
      return;
    }
    nav({ to: to as any, replace: opts?.replace });
  };
}

// useParams<{ id: string }>() → TanStack's strict params
export function useParams<T extends Record<string, string> = Record<string, string>>(): T {
  return (tsParams as any)({ strict: false }) as T;
}

type SearchParamsValue = URLSearchParams | Record<string, string | number | boolean | null | undefined>;
type SearchParamsSetter = (
  next: SearchParamsValue | ((prev: URLSearchParams) => SearchParamsValue),
  opts?: { replace?: boolean },
) => void;

// useSearchParams: minimal URLSearchParams-compatible API
export function useSearchParams(): [URLSearchParams, SearchParamsSetter] {
  const search = tsSearch({ strict: false }) as Record<string, unknown>;
  const searchKey = JSON.stringify(search ?? {});
  const params = useMemo(() => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(search ?? {})) {
      if (v != null) p.set(k, String(v));
    }
    return p;
  }, [searchKey]);
  const nav = tsNavigate();
  const set = useCallback<SearchParamsSetter>((next, opts) => {
    const current = new URLSearchParams(params);
    const resolved = typeof next === "function" ? next(current) : next;
    const obj: Record<string, string> = {};
    if (resolved instanceof URLSearchParams) {
      resolved.forEach((v, k) => (obj[k] = v));
    } else {
      for (const [k, v] of Object.entries(resolved)) {
        if (v != null) obj[k] = String(v);
      }
    }
    nav({ search: obj as any, replace: opts?.replace ?? true } as any);
  }, [nav, params]);
  return [params, set];
}

// Link: forward `to` as TanStack accepts it; ignore unknown props.
type AnyLinkProps = Omit<LinkProps, "to"> & {
  to: string;
  children?: React.ReactNode;
  className?: string;
  state?: unknown;
  replace?: boolean;
};

export const Link = forwardRef<HTMLAnchorElement, AnyLinkProps>(function Link(
  { to, children, className, ...rest },
  ref,
) {
  // Strip react-router-only props that TanStack doesn't understand
  const { state: _state, ...safe } = rest as any;
  return (
    <TSLink ref={ref as any} to={to as any} className={className} {...(safe as any)}>
      {children}
    </TSLink>
  );
});
