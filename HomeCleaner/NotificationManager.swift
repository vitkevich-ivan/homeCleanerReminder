import Foundation
import UserNotifications

enum NotificationManager {
    static func requestPermission() async -> Bool {
        do {
            return try await UNUserNotificationCenter.current()
                .requestAuthorization(options: [.alert, .sound, .badge])
        } catch {
            return false
        }
    }

    static func schedule(for appliance: Appliance) async {
        let center = UNUserNotificationCenter.current()
        let identifier = appliance.id.uuidString
        center.removePendingNotificationRequests(withIdentifiers: [identifier])

        guard appliance.notificationEnabled else { return }

        let content = UNMutableNotificationContent()
        content.title = "Пора почистить технику"
        content.body = "\(appliance.name) ждёт плановой очистки."
        content.sound = .default

        let calendar = Calendar.current
        var fireDate = calendar.date(
            bySettingHour: appliance.notificationHour,
            minute: 0,
            second: 0,
            of: appliance.nextCleaningDate
        ) ?? appliance.nextCleaningDate

        if fireDate <= .now {
            let tomorrow = calendar.date(byAdding: .day, value: 1, to: .now) ?? .now
            fireDate = calendar.date(
                bySettingHour: appliance.notificationHour,
                minute: 0,
                second: 0,
                of: tomorrow
            ) ?? tomorrow
        }

        let components = calendar.dateComponents(
            [.year, .month, .day, .hour, .minute],
            from: fireDate
        )
        let trigger = UNCalendarNotificationTrigger(dateMatching: components, repeats: false)
        let request = UNNotificationRequest(
            identifier: identifier,
            content: content,
            trigger: trigger
        )

        try? await center.add(request)
    }

    static func cancel(for appliance: Appliance) {
        UNUserNotificationCenter.current()
            .removePendingNotificationRequests(withIdentifiers: [appliance.id.uuidString])
    }
}
