// react-router-dom → @tanstack/react-router compatibility shim
// for ported reference files.
import {
  useNavigate as tsNavigate,
  useParams as tsParams,
  useSearch as tsSearch,
  Link as TSLink,
  type LinkProps,
} from "@tanstack/react-router";
import { forwardRef } from "react";

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
  return tsParams({ strict: false }) as T;
}

// useSearchParams: minimal URLSearchParams-compatible API
export function useSearchParams(): [URLSearchParams, (next: URLSearchParams | Record<string, string>) => void] {
  const search = tsSearch({ strict: false }) as Record<string, unknown>;
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(search)) {
    if (v != null) params.set(k, String(v));
  }
  const nav = tsNavigate();
  const set = (next: URLSearchParams | Record<string, string>) => {
    const obj: Record<string, string> = {};
    if (next instanceof URLSearchParams) {
      next.forEach((v, k) => (obj[k] = v));
    } else Object.assign(obj, next);
    nav({ search: obj as any, replace: true } as any);
  };
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
