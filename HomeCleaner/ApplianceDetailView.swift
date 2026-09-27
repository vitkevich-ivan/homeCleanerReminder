import SwiftUI
import SwiftData

struct ApplianceDetailView: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(\.modelContext) private var modelContext

    let appliance: Appliance

    @State private var isEditing = false
    @State private var showDeleteConfirmation = false

    var body: some View {
        List {
            Section {
                VStack(spacing: 14) {
                    Image(systemName: appliance.category.symbol)
                        .font(.system(size: 38))
                        .foregroundStyle(.indigo)
                        .frame(width: 76, height: 76)
                        .background(.indigo.opacity(0.12), in: RoundedRectangle(cornerRadius: 22))

                    Text(appliance.status.title)
                        .font(.title3.bold())

                    Text("Следующая чистка — \(appliance.nextCleaningDate.formatted(date: .long, time: .omitted))")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                        .multilineTextAlignment(.center)

                    Button {
                        markAsCleaned()
                    } label: {
                        Label("Очищено сегодня", systemImage: "checkmark.circle.fill")
                            .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.borderedProminent)
                    .controlSize(.large)
                }
                .frame(maxWidth: .infinity)
                .padding(.vertical, 16)
            }

            Section("График") {
                LabeledContent("Последняя чистка") {
                    Text(appliance.lastCleanedAt, format: .dateTime.day().month(.wide).year())
                }
                LabeledContent("Интервал", value: "\(appliance.cleaningIntervalDays) дн.")
                LabeledContent("Напоминание") {
                    Text(appliance.notificationEnabled
                         ? String(format: "%02d:00", appliance.notificationHour)
                         : "Выключено")
                }
            }

            Section("История") {
                if appliance.cleaningRecords.isEmpty {
                    Text("Здесь появятся выполненные чистки")
                        .foregroundStyle(.secondary)
                } else {
                    ForEach(sortedRecords) { record in
                        Label {
                            Text(record.cleanedAt, format: .dateTime.day().month(.wide).year())
                        } icon: {
                            Image(systemName: "checkmark.circle.fill")
                                .foregroundStyle(.green)
                        }
                    }
                    .onDelete(perform: deleteRecords)
                }
            }

            Section {
                Button("Удалить технику", role: .destructive) {
                    showDeleteConfirmation = true
                }
            }
        }
        .navigationTitle(appliance.name)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button("Изменить") { isEditing = true }
            }
        }
        .sheet(isPresented: $isEditing) {
            ApplianceFormView(appliance: appliance)
        }
        .confirmationDialog(
            "Удалить «\(appliance.name)»?",
            isPresented: $showDeleteConfirmation,
            titleVisibility: .visible
        ) {
            Button("Удалить", role: .destructive) { deleteAppliance() }
        } message: {
            Text("История чисток тоже будет удалена.")
        }
    }

    private var sortedRecords: [CleaningRecord] {
        appliance.cleaningRecords.sorted { $0.cleanedAt > $1.cleanedAt }
    }

    private func markAsCleaned() {
        let record = CleaningRecord(cleanedAt: .now, appliance: appliance)
        modelContext.insert(record)
        appliance.lastCleanedAt = .now
        try? modelContext.save()

        Task {
            await NotificationManager.schedule(for: appliance)
        }
    }

    private func deleteRecords(at offsets: IndexSet) {
        for index in offsets {
            modelContext.delete(sortedRecords[index])
        }
        try? modelContext.save()
    }

    private func deleteAppliance() {
        NotificationManager.cancel(for: appliance)
        modelContext.delete(appliance)
        try? modelContext.save()
        dismiss()
    }
}
