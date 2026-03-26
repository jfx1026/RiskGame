import UIKit
import Capacitor

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {

    var window: UIWindow?
    var snapshotView: UIView?

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        // Override point for customization after application launch.
        return true
    }

    func applicationWillResignActive(_ application: UIApplication) {
        // Take a snapshot of the current view for the app switcher
        // This ensures the WebView content is properly captured
        if let window = self.window {
            snapshotView = window.snapshotView(afterScreenUpdates: false)
            if let snapshot = snapshotView {
                snapshot.frame = window.bounds
                window.addSubview(snapshot)
            }
        }
    }

    func applicationDidEnterBackground(_ application: UIApplication) {
        // Keep the snapshot visible for app switcher
    }

    func applicationWillEnterForeground(_ application: UIApplication) {
        // Remove the snapshot when returning to foreground
        snapshotView?.removeFromSuperview()
        snapshotView = nil
    }

    func applicationDidBecomeActive(_ application: UIApplication) {
        // Ensure snapshot is removed when app becomes active
        snapshotView?.removeFromSuperview()
        snapshotView = nil
    }

    func applicationWillTerminate(_ application: UIApplication) {
        // Called when the application is about to terminate. Save data if appropriate. See also applicationDidEnterBackground:.
    }

    func application(_ app: UIApplication, open url: URL, options: [UIApplication.OpenURLOptionsKey: Any] = [:]) -> Bool {
        // Called when the app was launched with a url. Feel free to add additional processing here,
        // but if you want the App API to support tracking app url opens, make sure to keep this call
        return ApplicationDelegateProxy.shared.application(app, open: url, options: options)
    }

    func application(_ application: UIApplication, continue userActivity: NSUserActivity, restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void) -> Bool {
        // Called when the app was launched with an activity, including Universal Links.
        // Feel free to add additional processing here, but if you want the App API to support
        // tracking app url opens, make sure to keep this call
        return ApplicationDelegateProxy.shared.application(application, continue: userActivity, restorationHandler: restorationHandler)
    }

}
