import SwiftUI
import SwiftData

@main
struct HomeCleanerApp: App {
    var body: some Scene {
        WindowGroup {
            ContentView()
        }
        .modelContainer(for: [Appliance.self, CleaningRecord.self])
    }
}
