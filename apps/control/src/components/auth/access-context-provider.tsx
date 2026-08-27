import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  getAccessContext,
  selectAccessContext,
  type AccessContextOption,
  type AccessContextState,
} from "@/services/access-context";

interface AccessContextValue extends AccessContextState {
  error: string;
  loading: boolean;
  reload: () => Promise<void>;
  select: (option: AccessContextOption) => Promise<AccessContextOption>;
}

const AccessContext = createContext<AccessContextValue | null>(null);

export function AccessContextProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AccessContextState>({
    active: null,
    options: [],
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setState(await getAccessContext());
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Unable to load Account access.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const select = useCallback(async (option: AccessContextOption) => {
    setError("");
    const next = await selectAccessContext({
      level: option.level,
      resourceId: option.resourceId,
      roleId: option.roleId,
    });
    setState(next);
    return next.active ?? option;
  }, []);

  const value = useMemo(() => ({
    ...state,
    error,
    loading,
    reload,
    select,
  }), [error, loading, reload, select, state]);

  return (
    <AccessContext.Provider value={value}>
      {children}
    </AccessContext.Provider>
  );
}

export function useAccessContext(): AccessContextValue {
  const value = useContext(AccessContext);
  if (!value) {
    throw new Error("useAccessContext must be used inside AccessContextProvider.");
  }
  return value;
}
