import UIKit
import Capacitor

/**
 * Registers app-local Capacitor plugins.
 *
 * Capacitor 6+ auto-registers only plugins that arrive as packages (their
 * class names end up in the generated packageClassList). A plugin compiled
 * directly into the app target — like NarsilStoreKit — is invisible to that
 * mechanism and must be handed to the bridge here, or every call to it
 * rejects with UNIMPLEMENTED.
 *
 * Main.storyboard's view controller must have its Custom Class set to
 * MainViewController for this to run — see native/ios/README.md.
 */
class MainViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(NarsilStoreKit())
    }
}
