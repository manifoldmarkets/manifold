import WidgetKit
import SwiftUI

// MARK: - Demo data
//
// Renders HARDCODED data for now. Only `resetDate` is real — the next midnight in
// America/Los_Angeles (matching the backend streak reset); the countdown to it
// ticks live with no app/network.
//
// To wire real data: read currentBettingStreak / lastBetTime /
// lastStreakFreezeTime / streakForgiveness + quest flags from a shared App Group
// UserDefaults written by the RN app.

private let kDemoStreak = 12

enum StreakState {
  case lit      // bet today — flame is hot
  case pending  // not bet yet today — greyed, urgency on the clock
  case frozen   // a streak-freeze covered a missed day
}

private let kDemoState: StreakState = .pending
private let kDemoFreezesLeft = 2

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

func pacificDayOfYear(_ date: Date) -> Int {
  var cal = Calendar(identifier: .gregorian)
  cal.timeZone = TimeZone(identifier: "America/Los_Angeles")!
  return cal.ordinality(of: .day, in: .year, for: date) ?? 1
}

// MARK: - Hooks (rotating daily nudge on the medium widget)

func hookText(state: StreakState, date: Date) -> String {
  switch state {
  case .lit:    return "Locked in. See you tomorrow 🔥"
  case .frozen: return "Saved by a freeze 🧊 — don't push your luck"
  case .pending: break
  }
  let day = pacificDayOfYear(date)
  let pct = 55 + (day * 7) % 40 // 55–94, varies by day but deterministic
  let hooks = [
    "Open the app today? \(pct)% 📈",
    "P(you predict today): \(pct)%",
    "Resolves YES if you predict today",
    "Your streak: trading at 96%",
    "Will your streak survive the week? \(pct)%",
    "Market says you'll bet today: \(pct)% ▲",
    "We miss you!",
    "Your streak is lonely",
    "Don't break the chain",
    "Keep the flame alive 🔥",
    "Come back — we saved your spot",
    "The future awaits",
    "Predict the future",
    "Be less wrong",
    "What do you know that we don't?",
    "Put your mana where your mouth is",
    "Someone's wrong on the internet 👀",
  ]
  return hooks[day % hooks.count]
}

// MARK: - Timeline

struct StreakEntry: TimelineEntry {
  let date: Date
  let streak: Int
  let resetDate: Date
  let state: StreakState
  let quests: [QuestItem]
  let freezesLeft: Int
}

struct Provider: TimelineProvider {
  func entry(_ date: Date) -> StreakEntry {
    StreakEntry(date: date, streak: kDemoStreak, resetDate: nextPacificReset(after: date),
                state: kDemoState, quests: kDemoQuests, freezesLeft: kDemoFreezesLeft)
  }
  func placeholder(in context: Context) -> StreakEntry { entry(Date()) }
  func getSnapshot(in context: Context, completion: @escaping (StreakEntry) -> Void) {
    completion(entry(Date()))
  }
  func getTimeline(in context: Context, completion: @escaping (Timeline<StreakEntry>) -> Void) {
    let e = entry(Date())
    completion(Timeline(entries: [e], policy: .after(e.resetDate)))
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
  state == .frozen ? "🧊" : "🔥"
}

// MARK: - Views

struct StreakWidgetEntryView: View {
  @Environment(\.widgetFamily) var family
  var entry: StreakEntry

  var body: some View {
    content
      .containerBackground(for: .widget) {
        switch family {
        case .systemSmall:
          ZStack(alignment: .bottomTrailing) {
            backgroundGradient(for: entry.state)
            logo(92, opacity: 0.13).padding(.trailing, 6).padding(.bottom, 22)
          }
        case .systemMedium:
          backgroundGradient(for: entry.state)
        default:
          Color.clear // lock-screen accessories use the system material
        }
      }
  }

  // Manifold crane mark (white). iOS tints it on the lock screen.
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
    case .accessoryCircular:    circular
    case .accessoryInline:      inline
    case .accessoryRectangular: rectangular
    case .systemMedium:         medium
    default:                    small
    }
  }

  // Live countdown to midnight PT.
  private var countdown: some View {
    Text(timerInterval: entry.date...entry.resetDate, countsDown: true)
      .monospacedDigit().lineLimit(1).minimumScaleFactor(0.5)
  }

  @ViewBuilder private func statusLine(size: CGFloat) -> some View {
    switch entry.state {
    case .pending:
      countdown.font(.system(size: size, weight: .bold)).foregroundColor(.white)
    case .lit:
      EmptyView() // the lit-up orange already says "done today"
    case .frozen:
      Text("Frozen · \(entry.freezesLeft) left")
        .font(.system(size: size, weight: .bold))
        .foregroundColor(Color(red: 0.90, green: 0.96, blue: 1.0))
        .lineLimit(1).minimumScaleFactor(0.6)
    }
  }

  // A single frost speck (used on frozen widgets).
  private func speck(_ s: String, _ size: CGFloat, _ op: Double, _ x: CGFloat, _ y: CGFloat) -> some View {
    Text(s).font(.system(size: size)).foregroundColor(.white).opacity(op).position(x: x, y: y)
  }

  // Home screen — small
  private var small: some View {
    let dim = entry.state == .pending
    return VStack(alignment: .leading, spacing: 0) {
      Text(emoji(for: entry.state))
        .font(.system(size: 48))
        .grayscale(dim ? 1 : 0).opacity(dim ? 0.75 : 1)
      Spacer(minLength: 4)
      Text("\(entry.streak)")
        .font(.system(size: 48, weight: .heavy)).foregroundColor(.white)
        .lineLimit(1).minimumScaleFactor(0.4)
      Text("day streak")
        .font(.system(size: 12, weight: .semibold)).foregroundColor(.white.opacity(0.85))
      Spacer(minLength: 4)
      statusLine(size: 14)
    }
    .padding(16)
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
    .overlay { if entry.state == .frozen { smallFrost } }
  }

  // Frost scattered around the cube on the small frozen widget.
  private var smallFrost: some View {
    ZStack {
      speck("❄", 9, 0.55, 80, 30)
      speck("❅", 6, 0.5, 100, 52)
      speck("·", 6, 0.55, 66, 40)
      speck("❄", 7, 0.5, 86, 64)
      speck("❄", 7, 0.5, 18, 34)
      speck("·", 5, 0.45, 14, 58)
      speck("❅", 6, 0.5, 32, 78)
      speck("·", 4, 0.4, 42, 42)
    }
  }

  // Home screen — medium: streak (left) + quests & rotating hook (right)
  private var medium: some View {
    let dim = entry.state == .pending
    return HStack(spacing: 16) {
      VStack(alignment: .leading, spacing: 0) {
        Text(emoji(for: entry.state))
          .font(.system(size: 38))
          .grayscale(dim ? 1 : 0).opacity(dim ? 0.75 : 1)
        Spacer(minLength: 2)
        Text("\(entry.streak)")
          .font(.system(size: 42, weight: .heavy)).foregroundColor(.white)
          .lineLimit(1).minimumScaleFactor(0.4)
        Text("day streak")
          .font(.system(size: 12, weight: .semibold)).foregroundColor(.white.opacity(0.85))
        if entry.state != .lit {
          statusLine(size: 13).padding(.top, 4)
        }
      }
      .frame(width: 92, alignment: .leading)

      Rectangle().fill(.white.opacity(0.22)).frame(width: 1)

      VStack(alignment: .leading, spacing: 7) {
        ForEach(Array(entry.quests.enumerated()), id: \.offset) { _, q in
          questRow(q)
        }
        Spacer(minLength: 0)
        // Bigger logo + rotating daily hook, anchored at the bottom.
        HStack(spacing: 9) {
          logo(34)
          Text(hookText(state: entry.state, date: entry.date))
            .font(.system(size: 13, weight: .bold)).foregroundColor(.white)
            .lineLimit(2).minimumScaleFactor(0.75)
        }
      }
      .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }
    .padding(16)
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
  }

  private func questRow(_ q: QuestItem) -> some View {
    HStack(spacing: 7) {
      Image(systemName: q.done ? "checkmark.circle.fill" : "circle")
        .font(.system(size: 14)).foregroundColor(.white.opacity(q.done ? 1 : 0.65))
      Text(q.title)
        .font(.system(size: 13, weight: .semibold))
        .foregroundColor(.white.opacity(q.done ? 0.55 : 1))
        .strikethrough(q.done, color: .white.opacity(0.55))
        .lineLimit(1).minimumScaleFactor(0.7)
      Spacer(minLength: 4)
      Text("+M\(q.rewardMana)")
        .font(.system(size: 12, weight: .bold))
        .foregroundColor(.white.opacity(q.done ? 0.5 : 0.92))
    }
  }

  // Lock screen — circular. Ring fills ONLY when you've actually bet today.
  private var circular: some View {
    let done = entry.state == .lit
    return ZStack {
      AccessoryWidgetBackground()
      if entry.state == .frozen {
        Text("🧊").font(.system(size: 40)).opacity(0.32)
        circularFrost
      } else {
        logo(44, opacity: 0.22)
      }
      Text("\(entry.streak)")
        .font(.system(size: 22, weight: .bold)).lineLimit(1).minimumScaleFactor(0.4).padding(3)
    }
    .overlay(
      Circle().strokeBorder(.white.opacity(done ? 0.95 : 0.18), lineWidth: done ? 3 : 2)
    )
  }

  private var circularFrost: some View {
    ZStack {
      Text("❄").font(.system(size: 8)).foregroundColor(.white).opacity(0.7).offset(x: -17, y: -16)
      Text("❄").font(.system(size: 7)).foregroundColor(.white).opacity(0.6).offset(x: 15, y: 14)
      Text("·").font(.system(size: 7)).foregroundColor(.white).opacity(0.6).offset(x: 15, y: -13)
      Text("·").font(.system(size: 7)).foregroundColor(.white).opacity(0.6).offset(x: -14, y: 15)
    }
  }

  // Lock screen — rectangular (no trailing logo; full-width text)
  private var rectangular: some View {
    HStack(spacing: 10) {
      Text(emoji(for: entry.state)).font(.system(size: 26))
      VStack(alignment: .leading, spacing: 1) {
        Text("\(entry.streak)-day streak")
          .font(.system(size: 15, weight: .semibold)).lineLimit(1).minimumScaleFactor(0.6)
        if entry.state == .pending {
          countdown.font(.system(size: 12)).opacity(0.9)
        } else {
          Text(entry.state == .frozen ? "Frozen · \(entry.freezesLeft) left" : "Done today ✓")
            .font(.system(size: 12)).opacity(0.9)
        }
      }
      Spacer(minLength: 0)
    }
  }

  // Lock screen — inline (beside the clock)
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
