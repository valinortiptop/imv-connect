import { useCallback, useEffect, useState } from "react";

const KEY = "rep-office-auto-visit";
const EVT = "rep-office-auto-visit-change";

function read(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(KEY) === "1";
}

/**
 * Preferencia del representante: registrar automáticamente check-in/check-out
 * en la oficina IMV cuando su ubicación cae dentro del radio de la matriz.
 * Se comparte entre componentes (barra global y tarjeta de ruta de hoy).
 */
export function useOfficeAutoVisit() {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    setEnabled(read());
    const sync = () => setEnabled(read());
    window.addEventListener(EVT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(EVT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const set = useCallback((v: boolean) => {
    window.localStorage.setItem(KEY, v ? "1" : "0");
    setEnabled(v);
    window.dispatchEvent(new Event(EVT));
  }, []);

  return { enabled, setEnabled: set };
}
