import { IonApp, setupIonicReact } from "@ionic/react";

import AppErrorBoundary from "@/components/AppErrorBoundary";
import MobileShell from "@/components/MobileShell";
import { AppStateProvider } from "@/components/AppState";
import { AudioProvider } from "@/lib/audio/AudioProvider";
import { CatalogProvider } from "@/data/catalog";

setupIonicReact();

export default function App() {
  return (
    <AppErrorBoundary>
      <IonApp>
        <CatalogProvider>
          <AppStateProvider>
            <AudioProvider>
              <MobileShell />
            </AudioProvider>
          </AppStateProvider>
        </CatalogProvider>
      </IonApp>
    </AppErrorBoundary>
  );
}
