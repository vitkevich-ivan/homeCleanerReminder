import SwiftUI
import SwiftData

struct ApplianceFormView: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(\.modelContext) private var modelContext

    private let appliance: Appliance?

    @State private var name: String
    @State private var category: ApplianceCategory
    @State private var intervalDays: Int
    @State private var lastCleanedAt: Date
    @State private var notificationEnabled: Bool
    @State private var notificationHour: Int
    @State private var showNotificationWarning = false

    init(appliance: Appliance? = nil) {
        self.appliance = appliance
        let initialCategory = appliance?.category ?? .washingMachine
        _name = State(initialValue: appliance?.name ?? "")
        _category = State(initialValue: initialCategory)
        _intervalDays = State(initialValue: appliance?.cleaningIntervalDays ?? initialCategory.suggestedInterval)
        _lastCleanedAt = State(initialValue: appliance?.lastCleanedAt ?? .now)
        _notificationEnabled = State(initialValue: appliance?.notificationEnabled ?? true)
        _notificationHour = State(initialValue: appliance?.notificationHour ?? 10)
    }

    var body: some View {
        NavigationStack {
            Form {
                Section("Техника") {
                    TextField("Название, например «Кофемашина»", text: $name)

                    Picker("Категория", selection: $category) {
                        ForEach(ApplianceCategory.allCases) { category in
                            Label(category.rawValue, systemImage: category.symbol)
                                .tag(category)
                        }
                    }
                    .onChange(of: category) { oldValue, newValue in
                        if intervalDays == oldValue.suggestedInterval {
                            intervalDays = newValue.suggestedInterval
                        }
                    }
                }

                Section("График") {
                    DatePicker(
                        "Последняя чистка",
                        selection: $lastCleanedAt,
                        in: ...Date.now,
                        displayedComponents: .date
                    )

                    Stepper(value: $intervalDays, in: 1...730) {
                        LabeledContent("Повторять", value: intervalDescription)
                    }

                    LabeledContent("Следующая чистка") {
                        Text(nextCleaningDate, format: .dateTime.day().month(.wide).year())
                            .foregroundStyle(.secondary)
                    }
                }

                Section("Напоминание") {
                    Toggle("Уведомлять", isOn: $notificationEnabled)

                    if notificationEnabled {
                        Picker("Время", selection: $notificationHour) {
                            ForEach(7..<22) { hour in
                                Text(String(format: "%02d:00", hour)).tag(hour)
                            }
                        }
                    }
                }
            }
            .navigationTitle(appliance == nil ? "Новая техника" : "Редактирование")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Отмена") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Сохранить") { save() }
                        .disabled(name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                }
            }
            .alert("Уведомления выключены", isPresented: $showNotificationWarning) {
                Button("Понятно", role: .cancel) { dismiss() }
            } message: {
                Text("Техника сохранена. Разрешить уведомления можно позже в настройках iPhone.")
            }
        }
    }

    private var intervalDescription: String {
        if intervalDays == 1 { return "каждый день" }
        return "каждые \(intervalDays) дн."
    }

    private var nextCleaningDate: Date {
        Calendar.current.date(byAdding: .day, value: intervalDays, to: lastCleanedAt) ?? lastCleanedAt
    }

    private func save() {
        let trimmedName = name.trimmingCharacters(in: .whitespacesAndNewlines)
        let savedAppliance: Appliance

        if let appliance {
            appliance.name = trimmedName
            appliance.category = category
            appliance.cleaningIntervalDays = intervalDays
            appliance.lastCleanedAt = lastCleanedAt
            appliance.notificationEnabled = notificationEnabled
            appliance.notificationHour = notificationHour
            savedAppliance = appliance
        } else {
            let newAppliance = Appliance(
                name: trimmedName,
                category: category,
                cleaningIntervalDays: intervalDays,
                lastCleanedAt: lastCleanedAt,
                notificationEnabled: notificationEnabled,
                notificationHour: notificationHour
            )
            modelContext.insert(newAppliance)
            savedAppliance = newAppliance
        }

        try? modelContext.save()

        Task {
            if notificationEnabled {
                let granted = await NotificationManager.requestPermission()
                await NotificationManager.schedule(for: savedAppliance)
                if !granted {
                    showNotificationWarning = true
                    return
                }
            } else {
                NotificationManager.cancel(for: savedAppliance)
            }
            dismiss()
        }
    }
}
