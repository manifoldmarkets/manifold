import WidgetKit
import SwiftUI
import UIKit

// MARK: - Shared data (App Group)
//
// The RN app writes a streak snapshot into this App Group container on login and
// whenever the streak changes (native/lib/streak-widget.ts). We read it here and
// recompute lit/pending/frozen ourselves against the next midnight-Pacific reset,
// so the widget stays correct for hours after the last write. Only `resetDate`
// (the countdown) is fully live with no app/network.

private let kAppGroup = "group.com.markets.manifold"
private let kStreakKey = "streakData"

// When true, the widget uses the SIMPLE render path: it reads the App Group
// directly in the view and draws the streak on a solid colour — no Image, no
// gradient, no live timer. This is the proven-safe path (the diagnostic build
// rendered fine this way). The richer `content` design (gradients, crane
// watermark, lock-screen countdown) is layered back on once each piece is
// confirmed on-device. Set false to use the full design.
private let kDiagnostic = true

enum StreakState {
  case lit      // bet today — flame is hot
  case pending  // not bet yet today — greyed, urgency on the clock
  case frozen   // a streak-freeze covered a missed day
}

struct QuestItem {
  let title: String
  let rewardMana: Int
  let done: Bool
}

// Mirror of NativeStreakData (common/native-message.ts). Times are ms-epoch;
// 0 means "never". `loggedIn` may arrive as a JSON bool or 0/1, so decode it
// leniently; every field defaults so a partial/legacy blob never throws.
struct StreakData: Decodable {
  let loggedIn: Bool
  let streak: Int
  let lastBetTime: Double
  let lastStreakFreezeTime: Double
  let freezesLeft: Int

  enum CodingKeys: String, CodingKey {
    case loggedIn, streak, lastBetTime, lastStreakFreezeTime, freezesLeft
  }

  init(from decoder: Decoder) throws {
    let c = try decoder.container(keyedBy: CodingKeys.self)
    if let b = try? c.decode(Bool.self, forKey: .loggedIn) {
      loggedIn = b
    } else {
      loggedIn = ((try? c.decode(Int.self, forKey: .loggedIn)) ?? 0) != 0
    }
    streak = (try? c.decode(Int.self, forKey: .streak)) ?? 0
    lastBetTime = (try? c.decode(Double.self, forKey: .lastBetTime)) ?? 0
    lastStreakFreezeTime =
      (try? c.decode(Double.self, forKey: .lastStreakFreezeTime)) ?? 0
    freezesLeft = (try? c.decode(Int.self, forKey: .freezesLeft)) ?? 0
  }
}

func loadStreakData() -> StreakData? {
  guard let defaults = UserDefaults(suiteName: kAppGroup),
        let raw = defaults.data(forKey: kStreakKey) else { return nil }
  return try? JSONDecoder().decode(StreakData.self, from: raw)
}

private let kQuestKey = "questData"

// Mirror of NativeQuestItem (common/native-message.ts). `period` is "daily" or
// "weekly"; the widget resets `done` to false on its own once that period rolls.
struct QuestSnapshot: Decodable {
  let title: String
  let rewardMana: Int
  let done: Bool
  let period: String
}

private struct QuestPayload: Decodable {
  let quests: [QuestSnapshot]
}

func loadQuestData() -> [QuestSnapshot] {
  guard let defaults = UserDefaults(suiteName: kAppGroup),
        let raw = defaults.data(forKey: kQuestKey),
        let payload = try? JSONDecoder().decode(QuestPayload.self, from: raw)
  else { return [] }
  return payload.quests
}

// MARK: - Reset time (next midnight Pacific)

func nextPacificReset(after date: Date) -> Date {
  var cal = Calendar(identifier: .gregorian)
  cal.timeZone = TimeZone(identifier: "America/Los_Angeles")!
  let startOfToday = cal.startOfDay(for: date)
  return cal.date(byAdding: .day, value: 1, to: startOfToday)
    ?? date.addingTimeInterval(86_400)
}

// Most recent midnight Pacific (the streak "today" boundary).
func pacificStartOfDay(_ date: Date) -> Date {
  var cal = Calendar(identifier: .gregorian)
  cal.timeZone = TimeZone(identifier: "America/Los_Angeles")!
  return cal.startOfDay(for: date)
}

// Next Monday 00:00 Pacific — the weekly-quest reset (backend: Mondays midnight LA).
func nextPacificWeekReset(after date: Date) -> Date {
  var cal = Calendar(identifier: .gregorian)
  cal.timeZone = TimeZone(identifier: "America/Los_Angeles")!
  var comps = DateComponents()
  comps.weekday = 2 // Monday (1 = Sunday)
  comps.hour = 0
  comps.minute = 0
  comps.second = 0
  return cal.nextDate(after: date, matching: comps, matchingPolicy: .nextTime)
    ?? nextPacificReset(after: date)
}

// Effective quest rows for an entry rendered at `date`: a quest stays done only
// until its period rolls over (daily → next midnight PT, weekly → next Monday).
// After that we assume "not done" — the safe empty state.
func questItems(_ snaps: [QuestSnapshot], at date: Date, now: Date) -> [QuestItem] {
  if snaps.isEmpty { return [] }
  let dayEnd = nextPacificReset(after: now).timeIntervalSince1970 * 1000
  let weekEnd = nextPacificWeekReset(after: now).timeIntervalSince1970 * 1000
  let t = date.timeIntervalSince1970 * 1000
  return snaps.map { s in
    let periodEnd = s.period == "weekly" ? weekEnd : dayEnd
    return QuestItem(title: s.title, rewardMana: s.rewardMana,
                     done: s.done && t < periodEnd)
  }
}

// Recompute state from the snapshot vs. the current Pacific day. Bet today →
// lit; else a freeze landed today → frozen; else the clock is ticking → pending.
func computeState(_ d: StreakData, now: Date) -> StreakState {
  let startMs = pacificStartOfDay(now).timeIntervalSince1970 * 1000
  if d.lastBetTime > 0 && d.lastBetTime >= startMs { return .lit }
  if d.lastStreakFreezeTime > 0 && d.lastStreakFreezeTime >= startMs { return .frozen }
  return .pending
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
  let loggedIn: Bool
}

struct Provider: TimelineProvider {
  // Representative sample for the widget gallery / loading shimmer.
  func placeholder(in context: Context) -> StreakEntry {
    let sample = [
      QuestItem(title: "Share a market", rewardMana: 5, done: true),
      QuestItem(title: "Create a market", rewardMana: 100, done: false),
    ]
    return StreakEntry(date: Date(), streak: 7, resetDate: nextPacificReset(after: Date()),
                       state: .lit, quests: sample, freezesLeft: 2, loggedIn: true)
  }

  func getSnapshot(in context: Context, completion: @escaping (StreakEntry) -> Void) {
    if kDiagnostic { completion(trivialEntry()); return }
    completion(context.isPreview ? placeholder(in: context) : currentEntry(Date()))
  }

  func getTimeline(in context: Context, completion: @escaping (Timeline<StreakEntry>) -> Void) {
    // Diagnostic: a trivial entry that never reads the App Group, so the view is
    // guaranteed to render if the extension runs. The view does the reading.
    let e = kDiagnostic ? trivialEntry() : currentEntry(Date())
    completion(Timeline(entries: [e], policy: .after(e.resetDate)))
  }

  private func trivialEntry() -> StreakEntry {
    let now = Date()
    return StreakEntry(date: now, streak: 0, resetDate: now.addingTimeInterval(3600),
                       state: .pending, quests: [], freezesLeft: 0, loggedIn: false)
  }

  // Single current entry from the App Group snapshot. No data / logged out / no
  // streak yet → the logged-out invite.
  private func currentEntry(_ now: Date) -> StreakEntry {
    let reset0 = nextPacificReset(after: now)
    guard let d = loadStreakData(), d.loggedIn, d.streak > 0 else {
      return StreakEntry(date: now, streak: 0, resetDate: reset0, state: .pending,
                         quests: [], freezesLeft: 0, loggedIn: false)
    }
    return StreakEntry(date: now, streak: d.streak, resetDate: reset0,
                       state: computeState(d, now: now),
                       quests: questItems(loadQuestData(), at: now, now: now),
                       freezesLeft: d.freezesLeft, loggedIn: true)
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

  @ViewBuilder var body: some View {
    if kDiagnostic {
      simpleStreakView
        .containerBackground(for: .widget) {
          switch family {
          case .systemSmall:
            ZStack(alignment: .bottomTrailing) {
              gradientBG()
              logo(92, opacity: 0.13).padding(.trailing, 6).padding(.bottom, 22)
            }
          case .systemMedium:
            ZStack(alignment: .bottomTrailing) {
              gradientBG()
              logo(120, opacity: 0.10).padding(.trailing, 12).padding(.bottom, 10)
            }
          default:
            Color.clear // lock-screen accessories use the system material
          }
        }
    } else {
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
  }

  // MARK: Simple render path — reads the App Group directly (the provider returns
  // a trivial entry). Solid colours, no Image, no gradient, no timer: the
  // proven-safe path from the diagnostic build. The richer design layers back on
  // once each piece is confirmed.

  private func snapshot() -> StreakData? {
    guard let d = loadStreakData(), d.loggedIn, d.streak > 0 else { return nil }
    return d
  }

  // State-based gradient (pure SwiftUI; the same palette as the full design).
  private func gradientBG() -> LinearGradient {
    guard let d = snapshot() else { return greyGradient }
    switch computeState(d, now: Date()) {
    case .lit:     return flameGradient
    case .frozen:  return iceGradient
    case .pending: return greyGradient
    }
  }

  @ViewBuilder private var simpleStreakView: some View {
    switch family {
    case .accessoryCircular:    simpleCircular
    case .accessoryInline:      simpleInline
    case .accessoryRectangular: simpleRectangular
    case .systemMedium:         simpleMedium
    default:                    simpleHome
    }
  }

  // Lock screen — circular: ring fills white once you've bet today; crane (nil-safe)
  // or ice in the middle. NO AccessoryWidgetBackground (the suspected culprit) —
  // everything here is standard SwiftUI.
  private var simpleCircular: some View {
    let d = snapshot()
    let state = d.map { computeState($0, now: Date()) } ?? .pending
    let done = state == .lit
    return ZStack {
      if state == .frozen {
        Text("🧊").font(.system(size: 38)).opacity(0.32)
        circularFrost
      } else {
        logo(44, opacity: 0.18)
      }
      Text(d.map { "\($0.streak)" } ?? "0")
        .font(.system(size: 22, weight: .bold)).lineLimit(1).minimumScaleFactor(0.4).padding(3)
    }
    .overlay(Circle().strokeBorder(.white.opacity(done ? 0.95 : 0.18), lineWidth: done ? 3 : 2))
  }

  // Lock screen — rectangular: streak + static status line (no countdown).
  @ViewBuilder private var simpleRectangular: some View {
    let d = snapshot()
    let state = d.map { computeState($0, now: Date()) } ?? .pending
    HStack(spacing: 10) {
      Text(state == .frozen ? "🧊" : "🔥").font(.system(size: 26))
      VStack(alignment: .leading, spacing: 1) {
        Text(d.map { "\($0.streak)-day streak" } ?? "Start a streak")
          .font(.system(size: 15, weight: .semibold)).lineLimit(1).minimumScaleFactor(0.6)
        if let d = d {
          switch state {
          case .pending:
            Text("Bet today to keep it 🔥")
              .font(.system(size: 12)).opacity(0.9).lineLimit(1).minimumScaleFactor(0.6)
          case .lit:
            Text("Done today ✓").font(.system(size: 12)).opacity(0.9)
          case .frozen:
            Text("Frozen · \(d.freezesLeft) left").font(.system(size: 12)).opacity(0.9)
          }
        } else {
          Text("Open Manifold").font(.system(size: 12)).opacity(0.9)
        }
      }
      Spacer(minLength: 0)
    }
  }

  // Lock screen — inline (beside the clock). No countdown.
  private var simpleInline: some View {
    let d = snapshot()
    let glyph = d.map { computeState($0, now: Date()) == .frozen ? "🧊" : "🔥" } ?? "🔥"
    return HStack(spacing: 4) {
      Text(glyph)
      Text(d.map { "\($0.streak)-day streak" } ?? "Start a streak")
        .lineLimit(1).minimumScaleFactor(0.6)
    }
  }

  // Medium home: streak on the left, rotating daily hook on the right.
  @ViewBuilder private var simpleMedium: some View {
    if let d = snapshot() {
      let state = computeState(d, now: Date())
      HStack(spacing: 16) {
        VStack(alignment: .leading, spacing: 0) {
          Text(state == .frozen ? "🧊" : "🔥")
            .font(.system(size: 38))
            .grayscale(state == .pending ? 1 : 0)
            .opacity(state == .pending ? 0.8 : 1)
          Spacer(minLength: 2)
          Text("\(d.streak)")
            .font(.system(size: 42, weight: .heavy)).foregroundColor(.white)
            .lineLimit(1).minimumScaleFactor(0.4)
          Text("day streak")
            .font(.system(size: 12, weight: .semibold)).foregroundColor(.white.opacity(0.85))
          if state == .frozen {
            Text("Frozen · \(d.freezesLeft) left")
              .font(.system(size: 11, weight: .bold)).foregroundColor(.white.opacity(0.9))
              .lineLimit(1).minimumScaleFactor(0.6)
          }
        }
        .frame(width: 92, alignment: .leading)
        Rectangle().fill(.white.opacity(0.22)).frame(width: 1)
        Text(hookText(state: state, date: Date()))
          .font(.system(size: 14, weight: .bold)).foregroundColor(.white)
          .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
          .lineLimit(3).minimumScaleFactor(0.7)
      }
      .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
      .padding(16)
    } else {
      simpleHome
    }
  }

  @ViewBuilder private var simpleHome: some View {
    if let d = snapshot() {
      let state = computeState(d, now: Date())
      VStack(alignment: .leading, spacing: 0) {
        Text(state == .frozen ? "🧊" : "🔥")
          .font(.system(size: 44))
          .grayscale(state == .pending ? 1 : 0)
          .opacity(state == .pending ? 0.8 : 1)
        Spacer(minLength: 4)
        Text("\(d.streak)")
          .font(.system(size: 46, weight: .heavy)).foregroundColor(.white)
          .lineLimit(1).minimumScaleFactor(0.4)
        Text("day streak")
          .font(.system(size: 12, weight: .semibold)).foregroundColor(.white.opacity(0.85))
        if state == .frozen {
          Text("Frozen · \(d.freezesLeft) left")
            .font(.system(size: 11, weight: .bold)).foregroundColor(.white.opacity(0.9))
            .lineLimit(1).minimumScaleFactor(0.6)
        }
      }
      .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
      .padding(14)
      .overlay { if state == .frozen { smallFrost } }
    } else {
      VStack(alignment: .leading, spacing: 2) {
        Text("🔥").font(.system(size: 42)).grayscale(1).opacity(0.7)
        Spacer(minLength: 4)
        Text("Start a streak")
          .font(.system(size: 18, weight: .heavy)).foregroundColor(.white)
          .lineLimit(2).minimumScaleFactor(0.6)
        Text("Open Manifold")
          .font(.system(size: 12, weight: .semibold)).foregroundColor(.white.opacity(0.85))
      }
      .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
      .padding(14)
    }
  }

  // Manifold crane mark (white). Loaded via UIImage with a nil-check so a missing
  // asset falls back to nothing instead of breaking the render — if the crane
  // shows, the asset resolves; if it's blank, the asset isn't in the widget bundle.
  @ViewBuilder private func logo(_ size: CGFloat, opacity: Double = 0.95) -> some View {
    if let ui = UIImage(named: "ManifoldLogo") {
      Image(uiImage: ui)
        .resizable()
        .aspectRatio(contentMode: .fit)
        .frame(width: size, height: size)
        .opacity(opacity)
    } else {
      Color.clear.frame(width: size, height: size)
    }
  }

  private func backgroundGradient(for state: StreakState) -> LinearGradient {
    switch state {
    case .lit:     return flameGradient
    case .frozen:  return iceGradient
    case .pending: return greyGradient
    }
  }

  @ViewBuilder private var content: some View {
    if !entry.loggedIn {
      loggedOut
    } else {
      switch family {
      case .accessoryCircular:    circular
      case .accessoryInline:      inline
      case .accessoryRectangular: rectangular
      case .systemMedium:         medium
      default:                    small
      }
    }
  }

  // MARK: Logged-out — invite to start a streak.

  @ViewBuilder private var loggedOut: some View {
    switch family {
    case .accessoryCircular:    loggedOutCircular
    case .accessoryInline:      Text("🔥 Start a streak")
    case .accessoryRectangular: loggedOutRectangular
    case .systemMedium:         loggedOutMedium
    default:                    loggedOutSmall
    }
  }

  private var loggedOutSmall: some View {
    VStack(alignment: .leading, spacing: 0) {
      Text("🔥").font(.system(size: 46)).grayscale(1).opacity(0.7)
      Spacer(minLength: 4)
      Text("Start a streak")
        .font(.system(size: 20, weight: .heavy)).foregroundColor(.white)
        .lineLimit(2).minimumScaleFactor(0.6)
      Text("Open Manifold")
        .font(.system(size: 12, weight: .semibold)).foregroundColor(.white.opacity(0.85))
    }
    .padding(16)
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
  }

  private var loggedOutMedium: some View {
    HStack(spacing: 16) {
      VStack(alignment: .leading, spacing: 0) {
        Text("🔥").font(.system(size: 40)).grayscale(1).opacity(0.7)
        Spacer(minLength: 6)
        Text("Start a streak")
          .font(.system(size: 22, weight: .heavy)).foregroundColor(.white)
          .lineLimit(2).minimumScaleFactor(0.6)
        Text("Predict daily to keep it alive")
          .font(.system(size: 12, weight: .semibold)).foregroundColor(.white.opacity(0.8))
          .lineLimit(2).minimumScaleFactor(0.8)
      }
      .frame(maxWidth: .infinity, alignment: .leading)
      VStack(spacing: 8) {
        logo(48)
        Text("Open Manifold")
          .font(.system(size: 12, weight: .bold)).foregroundColor(.white.opacity(0.9))
      }
    }
    .padding(16)
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
  }

  private var loggedOutCircular: some View {
    ZStack {
      AccessoryWidgetBackground()
      logo(26, opacity: 0.9)
    }
    .overlay(Circle().strokeBorder(.white.opacity(0.18), lineWidth: 2))
  }

  private var loggedOutRectangular: some View {
    HStack(spacing: 10) {
      Text("🔥").font(.system(size: 24)).grayscale(1)
      VStack(alignment: .leading, spacing: 1) {
        Text("Start a streak")
          .font(.system(size: 15, weight: .semibold)).lineLimit(1).minimumScaleFactor(0.6)
        Text("Open Manifold").font(.system(size: 12)).opacity(0.9)
      }
      Spacer(minLength: 0)
    }
  }

  // Live countdown to midnight PT. Clamp defensively so the range can never be
  // degenerate (lowerBound must be <= upperBound, or SwiftUI traps).
  private var countdown: some View {
    let start = min(entry.date, entry.resetDate)
    let end = max(entry.resetDate, start.addingTimeInterval(1))
    return Text(timerInterval: start...end, countsDown: true)
      .monospacedDigit().lineLimit(1).minimumScaleFactor(0.5)
  }

  @ViewBuilder private func statusLine(size: CGFloat) -> some View {
    switch entry.state {
    case .pending:
      // Home widgets convey urgency via the greyed-out state, not a live timer
      // (Duolingo-style). The countdown lives on the lock-screen accessories.
      EmptyView()
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
        // Quests aren't fetched natively yet, so this is empty for now — center
        // the logo + hook. Once quests are wired, they stack on top and the hook
        // anchors to the bottom.
        if entry.quests.isEmpty {
          Spacer(minLength: 0)
          bottomHookRow
          Spacer(minLength: 0)
        } else {
          ForEach(Array(entry.quests.enumerated()), id: \.offset) { _, q in
            questRow(q)
          }
          Spacer(minLength: 0)
          bottomHookRow
        }
      }
      .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }
    .padding(16)
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
  }

  // Bigger logo + rotating daily hook (medium widget).
  private var bottomHookRow: some View {
    HStack(spacing: 9) {
      logo(34)
      Text(hookText(state: entry.state, date: entry.date))
        .font(.system(size: 13, weight: .bold)).foregroundColor(.white)
        .lineLimit(2).minimumScaleFactor(0.75)
    }
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
