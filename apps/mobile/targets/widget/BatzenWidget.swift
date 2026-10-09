import SwiftUI
import WidgetKit

// Batzen home-screen widget (M4-10, docs/WIDGETS.md).
//
// The app writes a JSON snapshot with every text already formatted (CHF amounts, labels in the
// app's language) to the App Group's UserDefaults (src/features/widget/snapshot.ts). This file
// only picks the entry for today and places the strings. The rule for picking the entry is the
// same as `widgetView` in snapshot.ts: today's entry; before the first entry the first one;
// after the last one (payday has passed) "new month: open Batzen" instead of old numbers.

private let snapshotKey = "batzen.widget.snapshot"
private let fallbackAddURL = URL(string: "batzen://add")!

struct WidgetDay: Codable {
  let date: String
  let balanceText: String
  let perDayText: String
  let daysText: String
  let daysLabel: String
  let overspent: Bool
}

struct WidgetLabels: Codable {
  let balance: String
  let perDay: String
  let add: String
  let open: String
  let newMonth: String
}

struct WidgetSnapshot: Codable {
  let version: Int
  let state: String
  let language: String
  let message: String?
  let labels: WidgetLabels
  let addUrl: String
  let days: [WidgetDay]
}

enum WidgetContent {
  case numbers(WidgetDay, WidgetLabels)
  case message(String)
}

struct BatzenEntry: TimelineEntry {
  let date: Date
  let content: WidgetContent
  let addURL: URL
}

/// The App Group is `group.<main app bundle id>`; the extension's id is `<main app id>.widget`.
private func appGroup() -> String {
  let id = Bundle.main.bundleIdentifier ?? ""
  let appId = id.hasSuffix(".widget") ? String(id.dropLast(".widget".count)) : id
  return "group.\(appId)"
}

private func loadSnapshot() -> WidgetSnapshot? {
  guard
    let json = UserDefaults(suiteName: appGroup())?.string(forKey: snapshotKey),
    let data = json.data(using: .utf8),
    let snapshot = try? JSONDecoder().decode(WidgetSnapshot.self, from: data),
    snapshot.version == 1
  else { return nil }
  return snapshot
}

private func localDateString(_ date: Date) -> String {
  let formatter = DateFormatter()
  formatter.locale = Locale(identifier: "en_US_POSIX")
  formatter.calendar = Calendar(identifier: .gregorian)
  formatter.timeZone = .current
  formatter.dateFormat = "yyyy-MM-dd"
  return formatter.string(from: date)
}

private func content(_ snapshot: WidgetSnapshot?, on date: Date) -> WidgetContent {
  guard let snapshot else { return .message("Batzen") }
  guard snapshot.state == "ready", let first = snapshot.days.first else {
    return .message(snapshot.message ?? snapshot.labels.open)
  }
  let today = localDateString(date)
  if let day = snapshot.days.first(where: { $0.date == today }) {
    return .numbers(day, snapshot.labels)
  }
  // "YYYY-MM-DD" strings sort like dates.
  if today < first.date { return .numbers(first, snapshot.labels) }
  return .message(snapshot.labels.newMonth)
}

struct Provider: TimelineProvider {
  func placeholder(in context: Context) -> BatzenEntry {
    BatzenEntry(date: Date(), content: .message("Batzen"), addURL: fallbackAddURL)
  }

  func getSnapshot(in context: Context, completion: @escaping (BatzenEntry) -> Void) {
    let snapshot = loadSnapshot()
    completion(
      BatzenEntry(
        date: Date(), content: content(snapshot, on: Date()),
        addURL: URL(string: snapshot?.addUrl ?? "") ?? fallbackAddURL))
  }

  /// One entry now and one at every midnight up to and including payday (the day after the last
  /// entry), so "per day" and "days until payday" move on at midnight and old numbers disappear
  /// on payday without the app running. Reloaded at the next midnight after that, and by the app
  /// (`WidgetCenter.reloadTimelines`) after every change.
  func getTimeline(in context: Context, completion: @escaping (Timeline<BatzenEntry>) -> Void) {
    let snapshot = loadSnapshot()
    let addURL = URL(string: snapshot?.addUrl ?? "") ?? fallbackAddURL
    let calendar = Calendar.current
    let now = Date()
    var entries = [BatzenEntry(date: now, content: content(snapshot, on: now), addURL: addURL)]
    var midnight = calendar.startOfDay(for: now)
    for _ in 0..<(snapshot?.days.count ?? 0) {
      guard let next = calendar.date(byAdding: .day, value: 1, to: midnight) else { break }
      midnight = next
      entries.append(
        BatzenEntry(date: midnight, content: content(snapshot, on: midnight), addURL: addURL))
    }
    let nextMidnight =
      calendar.date(byAdding: .day, value: 1, to: calendar.startOfDay(for: now)) ?? now
    completion(Timeline(entries: entries, policy: .after(nextMidnight)))
  }
}

struct AddButton: View {
  let url: URL
  let label: String

  var body: some View {
    Link(destination: url) {
      Image(systemName: "plus")
        .font(.system(size: 18, weight: .bold))
        .foregroundColor(Color("OnAccent"))
        .frame(width: 36, height: 36)
        .background(Circle().fill(Color("Accent")))
    }
    .accessibilityLabel(label)
  }
}

struct BatzenWidgetView: View {
  @Environment(\.widgetFamily) var family
  let entry: BatzenEntry

  var body: some View {
    Group {
      switch entry.content {
      case .numbers(let day, let labels):
        numbers(day, labels)
      case .message(let message):
        HStack(alignment: .top) {
          Text(message)
            .font(.headline)
            .foregroundColor(Color("TextPrimary"))
          Spacer(minLength: 4)
          AddButton(url: entry.addURL, label: "+")
        }
      }
    }
    .containerBackground(Color("Background"), for: .widget)
    // Small widgets are a single tap target (Links inside are ignored): the whole widget is the
    // "+" and opens quick add. Medium widgets open the app, and their "+" opens quick add.
    .widgetURL(family == .systemSmall ? entry.addURL : nil)
  }

  @ViewBuilder
  private func numbers(_ day: WidgetDay, _ labels: WidgetLabels) -> some View {
    VStack(alignment: .leading, spacing: 4) {
      HStack(alignment: .top) {
        VStack(alignment: .leading, spacing: 2) {
          Text(day.balanceText)
            .font(.system(size: family == .systemSmall ? 20 : 26, weight: .bold))
            .minimumScaleFactor(0.6)
            .lineLimit(1)
            .foregroundColor(Color(day.overspent ? "Danger" : "TextPrimary"))
          Text(labels.balance)
            .font(.caption)
            .foregroundColor(Color("TextSecondary"))
        }
        Spacer(minLength: 4)
        AddButton(url: entry.addURL, label: labels.add)
      }
      Spacer(minLength: 0)
      if family == .systemSmall {
        Text("\(day.perDayText) \(labels.perDay)")
          .font(.subheadline.weight(.semibold))
          .minimumScaleFactor(0.7)
          .lineLimit(1)
          .foregroundColor(Color("TextPrimary"))
        Text("\(day.daysText) \(day.daysLabel)")
          .font(.caption)
          .lineLimit(2)
          .foregroundColor(Color("TextSecondary"))
      } else {
        HStack(alignment: .lastTextBaseline) {
          Text("\(day.perDayText) \(labels.perDay)")
            .font(.subheadline.weight(.semibold))
            .lineLimit(1)
            .foregroundColor(Color("TextPrimary"))
          Spacer(minLength: 8)
          Text("\(day.daysText) \(day.daysLabel)")
            .font(.caption)
            .lineLimit(1)
            .foregroundColor(Color("TextSecondary"))
        }
      }
    }
  }
}

@main
struct BatzenWidget: Widget {
  // Must match IOS_WIDGET_KIND in src/features/widget/config.ts.
  let kind = "BatzenWidget"

  var body: some WidgetConfiguration {
    StaticConfiguration(kind: kind, provider: Provider()) { entry in
      BatzenWidgetView(entry: entry)
    }
    .configurationDisplayName("Batzen")
    .description("Balance, per day and days until payday.")
    .supportedFamilies([.systemSmall, .systemMedium])
  }
}
