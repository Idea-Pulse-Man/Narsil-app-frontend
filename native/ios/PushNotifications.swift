import UIKit
import Capacitor

/**
 * Hands the APNs device token (or the failure) to Capacitor's
 * PushNotifications plugin. Without these two AppDelegate methods,
 * `PushNotifications.register()` never fires its `registration` event and no
 * token reaches the backend.
 *
 * Kept as an extension in its own file (rather than edits to the generated
 * AppDelegate.swift) so it survives `npx cap add ios`. Copy it into
 * ios/App/App/ — see native/ios/README.md, "Push notifications".
 */
extension AppDelegate {
    func application(
        _ application: UIApplication,
        didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data
    ) {
        NotificationCenter.default.post(
            name: .capacitorDidRegisterForRemoteNotifications,
            object: deviceToken
        )
    }

    func application(
        _ application: UIApplication,
        didFailToRegisterForRemoteNotificationsWithError error: Error
    ) {
        NotificationCenter.default.post(
            name: .capacitorDidFailToRegisterForRemoteNotifications,
            object: error
        )
    }
}
