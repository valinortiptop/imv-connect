type GoogleMapsNamespace = any;

let googleMapsPromise: Promise<GoogleMapsNamespace> | null = null;

declare global {
  interface Window {
    google?: any;
    __imvGoogleMapsReady?: () => void;
  }
}

export function loadGoogleMapsViaValinor(): Promise<GoogleMapsNamespace> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Google Maps sólo está disponible en el navegador"));
  }

  if (window.google?.maps?.Map) {
    return Promise.resolve(window.google.maps);
  }

  if (googleMapsPromise) return googleMapsPromise;

  googleMapsPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(
      'script[data-imv-google-maps="true"]',
    );

    window.__imvGoogleMapsReady = () => {
      if (window.google?.maps?.Map) resolve(window.google.maps);
      else reject(new Error("Google Maps no terminó de inicializar"));
    };

    if (existing) return;

    const script = document.createElement("script");
    script.dataset.imvGoogleMaps = "true";
    script.async = true;
    script.defer = true;
    script.src = "/api/public/maps/script?callback=__imvGoogleMapsReady";
    script.onerror = () => reject(new Error("No se pudo cargar Google Maps vía Valinor"));
    document.head.appendChild(script);
  });

  return googleMapsPromise;
}
