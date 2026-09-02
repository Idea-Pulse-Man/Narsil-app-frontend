import { IonApp, setupIonicReact } from "@ionic/react";

import AppErrorBoundary from "@/components/AppErrorBoundary";
import MobileShell from "@/components/MobileShell";
import { AppStateProvider, useAppState } from "@/components/AppState";
import { AudioProvider } from "@/lib/audio/AudioProvider";
import { CatalogProvider } from "@/data/catalog";

setupIonicReact();

/** Hold catalog/network hydration until first-launch terms are accepted. */
function CatalogGate({ children }: { children: React.ReactNode }) {
  const { ready, termsAccepted } = useAppState();
  return (
    <CatalogProvider paused={!ready || !termsAccepted}>{children}</CatalogProvider>
  );
}

export default function App() {
  return (
    <AppErrorBoundary>
      <IonApp>
        <AppStateProvider>
          <CatalogGate>
            <AudioProvider>
              <MobileShell />
            </AudioProvider>
          </CatalogGate>
        </AppStateProvider>
      </IonApp>
    </AppErrorBoundary>
  );
}
