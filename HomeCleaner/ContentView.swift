import SwiftUI
import SwiftData

struct ContentView: View {
    @Query private var storedAppliances: [Appliance]
    @State private var isAddingAppliance = false

    var body: some View {
        NavigationStack {
            Group {
                if appliances.isEmpty {
                    ContentUnavailableView {
                        Label("Техники пока нет", systemImage: "sparkles")
                    } description: {
                        Text("Добавьте первое устройство, и мы напомним о следующей чистке.")
                    } actions: {
                        Button("Добавить технику") {
                            isAddingAppliance = true
                        }
                        .buttonStyle(.borderedProminent)
                    }
                } else {
                    List {
                        summary

                        ForEach(groupedSections, id: \.title) { section in
                            Section(section.title) {
                                ForEach(section.items) { appliance in
                                    NavigationLink(value: appliance) {
                                        ApplianceRow(appliance: appliance)
                                    }
                                }
                            }
                        }
                    }
                    .listStyle(.insetGrouped)
                }
            }
            .navigationTitle("Дом в порядке")
            .navigationDestination(for: Appliance.self) { appliance in
                ApplianceDetailView(appliance: appliance)
            }
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        isAddingAppliance = true
                    } label: {
                        Image(systemName: "plus")
                    }
                    .accessibilityLabel("Добавить технику")
                }
            }
            .sheet(isPresented: $isAddingAppliance) {
                ApplianceFormView()
            }
        }
        .tint(.indigo)
    }

    private var appliances: [Appliance] {
        storedAppliances.sorted { $0.nextCleaningDate < $1.nextCleaningDate }
    }

    private var summary: some View {
        let overdueCount = appliances.filter {
            if case .overdue = $0.status { return true }
            return false
        }.count

        return Section {
            HStack(spacing: 14) {
                Image(systemName: overdueCount == 0 ? "checkmark.seal.fill" : "exclamationmark.triangle.fill")
                    .font(.title)
                    .foregroundStyle(overdueCount == 0 ? .green : .orange)

                VStack(alignment: .leading, spacing: 3) {
                    Text(overdueCount == 0 ? "Всё под контролем" : "Нужна ваша забота")
                        .font(.headline)
                    Text(overdueCount == 0
                         ? "Просроченных чисток нет"
                         : "Просрочено: \(overdueCount)")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }
            }
            .padding(.vertical, 5)
        }
    }

    private var groupedSections: [(title: String, items: [Appliance])] {
        let overdue = appliances.filter {
            if case .overdue = $0.status { return true }
            return false
        }
        let soon = appliances.filter {
            if case .soon = $0.status { return true }
            return false
        }
        let planned = appliances.filter {
            if case .planned = $0.status { return true }
            return false
        }

        return [
            ("Просрочено", overdue),
            ("Скоро", soon),
            ("Позже", planned)
        ].filter { !$0.items.isEmpty }
    }
}

private struct ApplianceRow: View {
    let appliance: Appliance

    var body: some View {
        HStack(spacing: 14) {
            Image(systemName: appliance.category.symbol)
                .font(.title2)
                .foregroundStyle(.indigo)
                .frame(width: 42, height: 42)
                .background(.indigo.opacity(0.12), in: RoundedRectangle(cornerRadius: 12))

            VStack(alignment: .leading, spacing: 4) {
                Text(appliance.name)
                    .font(.headline)
                Text(appliance.nextCleaningDate, format: .dateTime.day().month(.wide))
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }

            Spacer()

            Text(appliance.status.title)
                .font(.caption.weight(.semibold))
                .foregroundStyle(statusColor)
                .multilineTextAlignment(.trailing)
        }
        .padding(.vertical, 4)
    }

    private var statusColor: Color {
        switch appliance.status {
        case .overdue: .red
        case .soon: .orange
        case .planned: .secondary
        }
    }
}

#Preview {
    ContentView()
        .modelContainer(for: [Appliance.self, CleaningRecord.self], inMemory: true)
}
