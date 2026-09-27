import Foundation
import SwiftData

enum ApplianceCategory: String, CaseIterable, Identifiable {
    case washingMachine = "Стиральная машина"
    case coffeeMachine = "Кофемашина"
    case dishwasher = "Посудомоечная машина"
    case kettle = "Чайник"
    case airConditioner = "Кондиционер"
    case vacuum = "Пылесос"
    case refrigerator = "Холодильник"
    case other = "Другое"

    var id: String { rawValue }

    var symbol: String {
        switch self {
        case .washingMachine: "washer"
        case .coffeeMachine: "cup.and.saucer.fill"
        case .dishwasher: "dishwasher"
        case .kettle: "kettle.fill"
        case .airConditioner: "air.conditioner.horizontal.fill"
        case .vacuum: "fan.fill"
        case .refrigerator: "refrigerator.fill"
        case .other: "wrench.and.screwdriver.fill"
        }
    }

    var suggestedInterval: Int {
        switch self {
        case .coffeeMachine, .kettle: 30
        case .washingMachine, .dishwasher, .vacuum: 60
        case .airConditioner, .refrigerator: 180
        case .other: 90
        }
    }
}

enum CleaningStatus {
    case overdue(days: Int)
    case soon(days: Int)
    case planned(days: Int)

    var title: String {
        switch self {
        case .overdue(let days): "Просрочено на \(days) дн."
        case .soon(let days): days == 0 ? "Очистить сегодня" : "Через \(days) дн."
        case .planned(let days): "Через \(days) дн."
        }
    }
}

@Model
final class Appliance {
    var id: UUID
    var name: String
    var categoryRawValue: String
    var cleaningIntervalDays: Int
    var lastCleanedAt: Date
    var createdAt: Date
    var notificationEnabled: Bool
    var notificationHour: Int

    @Relationship(deleteRule: .cascade, inverse: \CleaningRecord.appliance)
    var cleaningRecords: [CleaningRecord]

    init(
        name: String,
        category: ApplianceCategory,
        cleaningIntervalDays: Int,
        lastCleanedAt: Date,
        notificationEnabled: Bool = true,
        notificationHour: Int = 10
    ) {
        self.id = UUID()
        self.name = name
        self.categoryRawValue = category.rawValue
        self.cleaningIntervalDays = cleaningIntervalDays
        self.lastCleanedAt = lastCleanedAt
        self.createdAt = .now
        self.notificationEnabled = notificationEnabled
        self.notificationHour = notificationHour
        self.cleaningRecords = []
    }

    var category: ApplianceCategory {
        get { ApplianceCategory(rawValue: categoryRawValue) ?? .other }
        set { categoryRawValue = newValue.rawValue }
    }

    var nextCleaningDate: Date {
        Calendar.current.date(
            byAdding: .day,
            value: cleaningIntervalDays,
            to: lastCleanedAt
        ) ?? lastCleanedAt
    }

    var status: CleaningStatus {
        let calendar = Calendar.current
        let today = calendar.startOfDay(for: .now)
        let dueDate = calendar.startOfDay(for: nextCleaningDate)
        let days = calendar.dateComponents([.day], from: today, to: dueDate).day ?? 0

        if days < 0 { return .overdue(days: abs(days)) }
        if days <= 7 { return .soon(days: days) }
        return .planned(days: days)
    }
}

@Model
final class CleaningRecord {
    var id: UUID
    var cleanedAt: Date
    var appliance: Appliance?

    init(cleanedAt: Date, appliance: Appliance? = nil) {
        self.id = UUID()
        self.cleanedAt = cleanedAt
        self.appliance = appliance
    }
}
