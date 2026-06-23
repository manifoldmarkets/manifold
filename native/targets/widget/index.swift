import WidgetKit
import SwiftUI

// MARK: - Demo data
//
// First on-device build renders HARDCODED data so we can ship fast without the
// App Group / RN data bridge. Only `resetDate` is real — it's the next midnight
// in America/Los_Angeles (matching the backend streak reset), and the countdown
// to it ticks live on the home/lock screen with no app or network involved.
//
// To wire real data later: read currentBettingStreak / lastBetTime /
// lastStreakFreezeTime from a shared App Group UserDefaults written by the RN app.

private let kDemoStreak = 12

enum StreakState {
  case lit      // bet today — flame is hot
  case pending  // not bet yet today — greyed, urgency on the clock
  case frozen   // a streak-freeze was auto-used
}

private let kDemoState: StreakState = .lit

// Quests shown on the medium widget (the streak/prediction quest is the left side).
struct QuestItem {
  let title: String
  let rewardMana: Int
  let done: Bool
}

private let kDemoQuests: [QuestItem] = [
  QuestItem(title: "Share a market", rewardMana: 5, done: true),
  QuestItem(title: "Create a market", rewardMana: 100, done: false),
]

// MARK: - Reset time (next midnight Pacific)

func nextPacificReset(after date: Date) -> Date {
  var cal = Calendar(identifier: .gregorian)
  cal.timeZone = TimeZone(identifier: "America/Los_Angeles")!
  let startOfToday = cal.startOfDay(for: date)
  return cal.date(byAdding: .day, value: 1, to: startOfToday)
    ?? date.addingTimeInterval(86_400)
}

// MARK: - Timeline

struct StreakEntry: TimelineEntry {
  let date: Date
  let streak: Int
  let resetDate: Date
  let state: StreakState
  let quests: [QuestItem]
}

struct Provider: TimelineProvider {
  func placeholder(in context: Context) -> StreakEntry {
    StreakEntry(date: Date(), streak: kDemoStreak,
                resetDate: nextPacificReset(after: Date()),
                state: kDemoState, quests: kDemoQuests)
  }

  func getSnapshot(in context: Context, completion: @escaping (StreakEntry) -> Void) {
    completion(placeholder(in: context))
  }

  func getTimeline(in context: Context, completion: @escaping (Timeline<StreakEntry>) -> Void) {
    let now = Date()
    let reset = nextPacificReset(after: now)
    let entry = StreakEntry(date: now, streak: kDemoStreak, resetDate: reset,
                            state: kDemoState, quests: kDemoQuests)
    // Reload at midnight PT so the day flips.
    completion(Timeline(entries: [entry], policy: .after(reset)))
  }
}

// MARK: - Palette

private let flameGradient = LinearGradient(
  colors: [Color(red: 1.0, green: 0.54, blue: 0.24), Color(red: 0.78, green: 0.20, blue: 0.10)],
  startPoint: .topLeading, endPoint: .bottomTrailing)

private let iceGradient = LinearGradient(
  colors: [Color(red: 0.56, green: 0.86, blue: 1.0), Color(red: 0.12, green: 0.37, blue: 0.85)],
  startPoint: .topLeading, endPoint: .bottomTrailing)

private let greyGradient = LinearGradient(
  colors: [Color(red: 0.20, green: 0.20, blue: 0.22), Color(red: 0.12, green: 0.12, blue: 0.14)],
  startPoint: .top, endPoint: .bottom)

private func emoji(for state: StreakState) -> String {
  state == .frozen ? "❄️" : "🔥"
}

// MARK: - Views

struct StreakWidgetEntryView: View {
  @Environment(\.widgetFamily) var family
  var entry: StreakEntry

  var body: some View {
    content
      .containerBackground(for: .widget) {
        if family == .systemSmall || family == .systemMedium {
          backgroundGradient(for: entry.state)
        } else {
          Color.clear // lock-screen accessories use the system material
        }
      }
  }

  // Manifold crane mark (white). Used everywhere; iOS tints it on the lock screen.
  private func logo(_ size: CGFloat, opacity: Double = 0.95) -> some View {
    Image("ManifoldLogo")
      .resizable()
      .aspectRatio(contentMode: .fit)
      .frame(width: size, height: size)
      .opacity(opacity)
  }

  private func backgroundGradient(for state: StreakState) -> LinearGradient {
    switch state {
    case .lit:     return flameGradient
    case .frozen:  return iceGradient
    case .pending: return greyGradient
    }
  }

  @ViewBuilder private var content: some View {
    switch family {
    case .accessoryCircular:   circular
    case .accessoryInline:     inline
    case .accessoryRectangular: rectangular
    case .systemMedium:        medium
    default:                   small
    }
  }

  // Live countdown to midnight PT — auto-shrinks so it never truncates.
  private var countdown: some View {
    Text(timerInterval: entry.date...entry.resetDate, countsDown: true)
      .monospacedDigit()
      .lineLimit(1)
      .minimumScaleFactor(0.5)
  }

  // Shared "done today vs time-left" status row. Used by small + medium so the
  // two never drift apart.
  @ViewBuilder private func statusLine(size: CGFloat) -> some View {
    switch entry.state {
    case .pending:
      countdown
        .font(.system(size: size, weight: .bold))
        .foregroundColor(.white)
    case .lit:
      // No label — the lit-up orange already says "done today".
      EmptyView()
    case .frozen:
      HStack(spacing: 5) {
        Image(systemName: "snowflake")
        Text("Frozen")
      }
      .font(.system(size: size, weight: .bold))
      .foregroundColor(.white)
      .lineLimit(1)
      .minimumScaleFactor(0.6)
    }
  }

  // Home screen — small
  private var small: some View {
    let dim = entry.state == .pending
    return VStack(alignment: .leading, spacing: 0) {
      // Flame (hero, left) + Manifold logo (right).
      HStack(alignment: .top) {
        Text(emoji(for: entry.state))
          .font(.system(size: 48))
          .grayscale(dim ? 1 : 0)
          .opacity(dim ? 0.75 : 1)
        Spacer(minLength: 0)
        logo(56)
      }
      Spacer(minLength: 4)
      Text("\(entry.streak)")
        .font(.system(size: 48, weight: .heavy))
        .foregroundColor(.white)
        .lineLimit(1)
        .minimumScaleFactor(0.4)
      Text("day streak")
        .font(.system(size: 12, weight: .semibold))
        .foregroundColor(.white.opacity(0.85))
      Spacer(minLength: 4)
      statusLine(size: 14)
    }
    .padding(16)
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
  }

  // Home screen — medium: pure streak, given room to breathe.
  private var medium: some View {
    let dim = entry.state == .pending
    return HStack(spacing: 16) {
      // Left: compact streak (the prediction quest lives here).
      VStack(alignment: .leading, spacing: 0) {
        Text(emoji(for: entry.state))
          .font(.system(size: 38))
          .grayscale(dim ? 1 : 0)
          .opacity(dim ? 0.75 : 1)
        Spacer(minLength: 2)
        Text("\(entry.streak)")
          .font(.system(size: 42, weight: .heavy))
          .foregroundColor(.white)
          .lineLimit(1)
          .minimumScaleFactor(0.4)
        Text("day streak")
          .font(.system(size: 12, weight: .semibold))
          .foregroundColor(.white.opacity(0.85))
        if entry.state == .pending {
          statusLine(size: 13).padding(.top, 4)
        }
      }
      .frame(width: 92, alignment: .leading)

      Rectangle().fill(.white.opacity(0.22)).frame(width: 1)

      // Right: the other quests you can still knock out.
      VStack(alignment: .leading, spacing: 8) {
        // Manifold wordmark heads the quests section.
        HStack(spacing: 6) {
          logo(18)
          Text("Manifold")
            .font(.system(size: 15, weight: .heavy))
            .foregroundColor(.white)
          Spacer(minLength: 0)
        }
        ForEach(Array(entry.quests.enumerated()), id: \.offset) { _, q in
          questRow(q)
        }
        Spacer(minLength: 0)
      }
      .frame(maxWidth: .infinity, alignment: .leading)
    }
    .padding(16)
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
  }

  // One quest row: checkbox + title + mana reward.
  private func questRow(_ q: QuestItem) -> some View {
    HStack(spacing: 7) {
      Image(systemName: q.done ? "checkmark.circle.fill" : "circle")
        .font(.system(size: 14))
        .foregroundColor(.white.opacity(q.done ? 1 : 0.65))
      Text(q.title)
        .font(.system(size: 13, weight: .semibold))
        .foregroundColor(.white.opacity(q.done ? 0.55 : 1))
        .strikethrough(q.done, color: .white.opacity(0.55))
        .lineLimit(1)
        .minimumScaleFactor(0.7)
      Spacer(minLength: 4)
      Text("Ṁ\(q.rewardMana)")
        .font(.system(size: 12, weight: .bold))
        .foregroundColor(.white.opacity(q.done ? 0.5 : 0.92))
    }
  }

  // Lock screen — circular
  private var circular: some View {
    // Ring fills once the day is secured (bet placed, or a freeze covered it).
    let done = entry.state != .pending
    return ZStack {
      AccessoryWidgetBackground()
      // Faint crane watermark behind the number.
      logo(44, opacity: 0.22)
      Text("\(entry.streak)")
        .font(.system(size: 22, weight: .bold))
        .lineLimit(1)
        .minimumScaleFactor(0.4)
        .padding(3)
    }
    .overlay(
      Circle().strokeBorder(.white.opacity(done ? 0.95 : 0.18),
                            lineWidth: done ? 3 : 2)
    )
  }

  // Lock screen — rectangular. Countdown only when not yet done today.
  private var rectangular: some View {
    HStack(spacing: 9) {
      Text(emoji(for: entry.state)).font(.title2)
      VStack(alignment: .leading, spacing: 1) {
        Text("\(entry.streak)-day streak")
          .font(.system(size: 15, weight: .semibold))
          .lineLimit(1).minimumScaleFactor(0.6)
        if entry.state == .pending {
          countdown
            .font(.system(size: 12)).opacity(0.9)
        } else {
          Text(entry.state == .frozen ? "Frozen today ❄️" : "Done today ✓")
            .font(.system(size: 12)).opacity(0.9)
        }
      }
      Spacer(minLength: 4)
      logo(18, opacity: 0.9)
    }
  }

  // Lock screen — inline (beside the clock). Countdown only when not yet done.
  private var inline: some View {
    HStack(spacing: 4) {
      Text(emoji(for: entry.state))
      if entry.state == .pending {
        Text("\(entry.streak) ·")
        countdown
      } else {
        Text("\(entry.streak)-day streak")
      }
    }
  }
}

// MARK: - Widget

struct StreakWidget: Widget {
  let kind = "StreakWidget"

  var body: some WidgetConfiguration {
    StaticConfiguration(kind: kind, provider: Provider()) { entry in
      StreakWidgetEntryView(entry: entry)
    }
    .configurationDisplayName("Streak")
    .description("Keep your Manifold streak alive 🔥")
    .supportedFamilies([
      .systemSmall, .systemMedium,
      .accessoryCircular, .accessoryRectangular, .accessoryInline,
    ])
  }
}

@main
struct StreakWidgetBundle: WidgetBundle {
  var body: some Widget {
    StreakWidget()
  }
}
