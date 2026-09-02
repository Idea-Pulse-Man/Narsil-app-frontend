import { IonApp, setupIonicReact } from "@ionic/react";

import AppErrorBoundary from "@/components/AppErrorBoundary";
import MobileShell from "@/components/MobileShell";
import { AppStateProvider, useAppState } from "@/components/AppState";
import { AudioProvider } from "@/lib/audio/AudioProvider";
import { CatalogProvider } from "@/data/catalog";

setupIonicReact();

/** Start catalog hydration as soon as local app state is ready — public artwork
 *  data is not gated on Terms acceptance so the feed can load behind the overlay. */
function CatalogGate({ children }: { children: React.ReactNode }) {
  const { ready } = useAppState();
  return <CatalogProvider paused={!ready}>{children}</CatalogProvider>;
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
