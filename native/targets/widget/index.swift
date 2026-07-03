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

// Diagnostic fallback: when true, the widget uses the SIMPLE render path — it
// reads the App Group directly in the view and draws the streak on a solid
// colour with no Image, no gradient, no live timer (the path proven safe on
// device). False ships the full design: gradients, crane watermark, gold
// milestones, quest rows, lock-screen countdown. If the rich path ever breaks
// (blank widget / infinite shimmer), flip back to true to triage.
private let kDiagnostic = false

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

struct QuestPayload: Decodable {
  let quests: [QuestSnapshot]
  let updatedAt: Double? // ms-epoch snapshot time; absent in legacy blobs
}

func loadQuestData() -> QuestPayload? {
  guard let defaults = UserDefaults(suiteName: kAppGroup),
        let raw = defaults.data(forKey: kQuestKey) else { return nil }
  return try? JSONDecoder().decode(QuestPayload.self, from: raw)
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
// until the period that contained the snapshot rolls over (daily → the midnight
// PT after `updatedAt`, weekly → the Monday after it). Past that we assume
// "not done" — the safe empty state. Anchoring to `updatedAt` (not the timeline
// generation time) is what makes done rows actually reset: each midnight
// regeneration would otherwise re-extend a stale blob's validity forever.
// Mirrors effectiveQuests() in native/widgets/streak-widget.tsx.
func questItems(_ payload: QuestPayload?, at date: Date) -> [QuestItem] {
  guard let payload = payload, !payload.quests.isEmpty else { return [] }
  let updatedAt = Date(timeIntervalSince1970: (payload.updatedAt ?? 0) / 1000)
  let dayEnd = nextPacificReset(after: updatedAt).timeIntervalSince1970 * 1000
  let weekEnd = nextPacificWeekReset(after: updatedAt).timeIntervalSince1970 * 1000
  let t = date.timeIntervalSince1970 * 1000
  return payload.quests.map { s in
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
  case .frozen: return "Saved by a freeze 🧊"
  case .pending: break
  }
  let day = pacificDayOfYear(date)
  let pct = 55 + (day * 7) % 40 // 55–94, deterministic by day
  // Keep these short — the medium's hook column is narrow, so anything much
  // longer than ~30 chars truncates mid-word. Same set as streak-widget.tsx.
  let hooks = [
    "Predict today? \(pct)% 📈",
    "P(you predict): \(pct)%",
    "Resolves YES if you bet today",
    "Your streak: trading at 96%",
    "Survives the week? \(pct)%",
    "You'll bet today: \(pct)% ▲",
    "We miss you!",
    "Your streak is lonely",
    "Don't break the chain",
    "Keep the flame alive 🔥",
    "We saved your spot",
    "The future awaits",
    "Predict the future",
    "Be less wrong",
    "What do you know?",
    "Mana where your mouth is",
    "Someone's wrong online 👀",
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
    if kDiagnostic {
      // Diagnostic: a trivial entry that never reads the App Group, so the view
      // is guaranteed to render if the extension runs. The view does the reading.
      let e = trivialEntry()
      completion(Timeline(entries: [e], policy: .after(e.resetDate)))
      return
    }
    let now = Date()
    let first = currentEntry(now)
    var entries = [first]
    if first.loggedIn && first.state != .lit {
      // The countdown (home + lock, shown whenever today isn't done — pending
      // or frozen) steps white → amber (<12h) → red (<4h), like Android. A live
      // Text(timerInterval:) can't recolor mid-entry, so emit a fresh entry at
      // each boundary still ahead; the view derives the tier from
      // resetDate − entry.date.
      for hoursLeft in [12.0, 4.0] {
        let boundary = first.resetDate.addingTimeInterval(-hoursLeft * 3600)
        if boundary > now { entries.append(currentEntry(boundary)) }
      }
    }
    completion(Timeline(entries: entries, policy: .after(first.resetDate)))
  }

  private func trivialEntry() -> StreakEntry {
    let now = Date()
    return StreakEntry(date: now, streak: 0, resetDate: now.addingTimeInterval(3600),
                       state: .pending, quests: [], freezesLeft: 0, loggedIn: false)
  }

  // Entry as of `date` from the App Group snapshot (works for future same-day
  // dates too — the tier boundaries above). No data / logged out / no streak
  // yet → the logged-out invite.
  private func currentEntry(_ date: Date) -> StreakEntry {
    let reset0 = nextPacificReset(after: date)
    guard let d = loadStreakData(), d.loggedIn, d.streak > 0 else {
      return StreakEntry(date: date, streak: 0, resetDate: reset0, state: .pending,
                         quests: [], freezesLeft: 0, loggedIn: false)
    }
    return StreakEntry(date: date, streak: d.streak, resetDate: reset0,
                       state: computeState(d, now: date),
                       quests: questItems(loadQuestData(), at: date),
                       freezesLeft: d.freezesLeft, loggedIn: true)
  }
}

// MARK: - Palette (kept in lockstep with the Android widget, streak-widget.tsx)

private let flameGradient = LinearGradient(
  colors: [Color(red: 1.0, green: 0.54, blue: 0.24), Color(red: 0.78, green: 0.20, blue: 0.10)],
  startPoint: .topLeading, endPoint: .bottomTrailing)

private let iceGradient = LinearGradient(
  colors: [Color(red: 0.56, green: 0.86, blue: 1.0), Color(red: 0.12, green: 0.37, blue: 0.85)],
  startPoint: .topLeading, endPoint: .bottomTrailing)

private let greyGradient = LinearGradient(
  colors: [Color(red: 0.20, green: 0.20, blue: 0.22), Color(red: 0.12, green: 0.12, blue: 0.14)],
  startPoint: .top, endPoint: .bottom)

// Milestone "level up" gradients: the lit widget turns gold as the streak grows.
// GOLD = #FFD24D→#E0810E, GOLD_RICH = #FFE891→#BC5E00 (Android's exact stops).
private let goldGradient = LinearGradient(
  colors: [Color(red: 1.0, green: 0.824, blue: 0.302), Color(red: 0.878, green: 0.506, blue: 0.055)],
  startPoint: .topLeading, endPoint: .bottomTrailing)

private let goldRichGradient = LinearGradient(
  colors: [Color(red: 1.0, green: 0.910, blue: 0.569), Color(red: 0.737, green: 0.369, blue: 0.0)],
  startPoint: .topLeading, endPoint: .bottomTrailing)

// Unlit (grey) flame for pending / logged-out — they haven't bet today, so the
// flame shouldn't look lit. #9CA0A8, the fill of Android's UNLIT_FLAME_SVG.
private let unlitFlame = Color(red: 0.612, green: 0.627, blue: 0.659)

// Soft warm glow behind the big number (Android NUMBER_SHADOW); stronger and
// warmer on milestones (MILESTONE_SHADOW).
private let numberShadow = Color(red: 0.078, green: 0.031, blue: 0).opacity(0.34)
private let milestoneNumberShadow = Color(red: 0.353, green: 0.137, blue: 0).opacity(0.5)

// A "gold milestone" = a lit streak of 30+ (richer gold at 100+). Same
// thresholds as Android's isGoldMilestone/gradientFor.
func isGoldMilestone(_ state: StreakState, _ streak: Int) -> Bool {
  state == .lit && streak >= 30
}

// Gradient by state, escalating to gold once lit and past a milestone. Frozen
// and pending keep their state colours (pending stays grey — grey = "act today").
func gradientFor(state: StreakState, streak: Int) -> LinearGradient {
  if state == .frozen { return iceGradient }
  if state != .lit { return greyGradient }
  if streak >= 100 { return goldRichGradient }
  if streak >= 30 { return goldGradient }
  return flameGradient
}

// The label under the number — "day streak", except when a freeze saved the
// day, where the freeze count takes its place (one line, never two).
func streakLabel(state: StreakState, freezesLeft: Int) -> String {
  state == .frozen ? "Frozen · \(freezesLeft) left" : "day streak"
}

private func emoji(for state: StreakState) -> String {
  state == .frozen ? "🧊" : "🔥"
}

// MARK: - Mani, the mascot 🐦
//
// A faceted purple origami-crane head that peeks from the small widget's
// bottom-right corner and EMOTES: its mood tracks the streak state and the
// time left in the day (the same state + 12h/4h tier boundaries that drive the
// countdown colour), Duolingo-style — the face is the notification. The POSE
// within a mood rotates by (pacificDayOfYear + streak) % variants: changes
// daily and differs between users, but is stable all day (no flicker between
// re-renders). Drawn as vector paths in a 120×140 design space — no image
// assets, crisp at any size, and a new pose is a few lines.

enum ManiPose {
  case happyClassic, smug, starstruck, party, fireEye // lit
  case watching, sideEye, quizzical                   // pending, >12h
  case sweating, alarmed                              // pending, <12h
  case madClassic, fuming, disappointed               // pending, <4h
  case icy, shivering                                 // frozen
  case asleep                                         // logged out
}

// Streaks that get the one-day party hat (the day you cross a milestone).
private let kPartyStreaks: Set<Int> = [30, 50, 100, 200, 365, 500, 1000]

func maniPose(state: StreakState, loggedIn: Bool, remaining: TimeInterval,
              streak: Int, day: Int) -> ManiPose {
  if !loggedIn { return .asleep }
  let roll = day + streak
  switch state {
  case .frozen:
    return [.icy, .shivering][roll % 2]
  case .lit:
    if kPartyStreaks.contains(streak) { return .party }
    // fireEye is the rare manic roll (~1 in 6); starstruck joins on gold.
    let happy: [ManiPose] = isGoldMilestone(state, streak)
      ? [.happyClassic, .smug, .starstruck, .happyClassic, .fireEye, .smug]
      : [.happyClassic, .smug, .happyClassic, .fireEye, .smug, .happyClassic]
    return happy[roll % happy.count]
  case .pending:
    if remaining <= 4 * 3600 { return [.madClassic, .fuming, .disappointed][roll % 3] }
    if remaining <= 12 * 3600 { return [.sweating, .alarmed][roll % 2] }
    return [.watching, .sideEye, .quizzical][roll % 3]
  }
}

private struct ManiPalette {
  let neckShade, neck, head, jaw, beak: Color
}

private func rgb(_ r: Double, _ g: Double, _ b: Double) -> Color {
  Color(red: r / 255, green: g / 255, blue: b / 255)
}

private let maniPurple = ManiPalette(
  neckShade: rgb(79, 63, 214), neck: rgb(108, 92, 231), head: rgb(139, 123, 247),
  jaw: rgb(91, 75, 224), beak: rgb(59, 47, 184))
private let maniIce = ManiPalette(
  neckShade: rgb(53, 104, 184), neck: rgb(74, 127, 214), head: rgb(127, 183, 240),
  jaw: rgb(74, 127, 214), beak: rgb(47, 95, 184))
private let maniGrey = ManiPalette(
  neckShade: rgb(74, 74, 85), neck: rgb(92, 92, 104), head: rgb(115, 115, 127),
  jaw: rgb(92, 92, 104), beak: rgb(63, 63, 74))

private let maniInk = rgb(42, 34, 88)   // brows/lids on the purple body
private let maniPupil = rgb(28, 22, 51)

struct ManiView: View {
  let pose: ManiPose

  var body: some View {
    Canvas { ctx, size in
      let s = min(size.width / 120, size.height / 140)
      let pal: ManiPalette = {
        switch pose {
        case .icy, .shivering: return maniIce
        case .asleep: return maniGrey
        default: return maniPurple
        }
      }()

      func pt(_ x: Double, _ y: Double) -> CGPoint { CGPoint(x: x * s, y: y * s) }
      func poly(_ pts: [(Double, Double)], _ color: Color) {
        var p = Path()
        p.move(to: pt(pts[0].0, pts[0].1))
        for q in pts.dropFirst() { p.addLine(to: pt(q.0, q.1)) }
        p.closeSubpath()
        ctx.fill(p, with: .color(color))
      }
      func circle(_ x: Double, _ y: Double, _ r: Double, _ color: Color) {
        ctx.fill(Path(ellipseIn: CGRect(x: (x - r) * s, y: (y - r) * s,
                                        width: 2 * r * s, height: 2 * r * s)),
                 with: .color(color))
      }
      func line(_ x1: Double, _ y1: Double, _ x2: Double, _ y2: Double,
                _ w: Double, _ color: Color) {
        var p = Path()
        p.move(to: pt(x1, y1)); p.addLine(to: pt(x2, y2))
        ctx.stroke(p, with: .color(color),
                   style: StrokeStyle(lineWidth: w * s, lineCap: .round))
      }
      func quad(_ x1: Double, _ y1: Double, _ cx: Double, _ cy: Double,
                _ x2: Double, _ y2: Double, _ w: Double, _ color: Color) {
        var p = Path()
        p.move(to: pt(x1, y1)); p.addQuadCurve(to: pt(x2, y2), control: pt(cx, cy))
        ctx.stroke(p, with: .color(color),
                   style: StrokeStyle(lineWidth: w * s, lineCap: .round))
      }
      func glyphText(_ str: String, _ x: Double, _ y: Double, _ fontSize: Double,
                     _ color: Color, bold: Bool = false) {
        ctx.draw(Text(str)
                   .font(.system(size: fontSize * s, weight: bold ? .heavy : .regular))
                   .foregroundColor(color),
                 at: pt(x, y))
      }

      // Body (shared): neck shade, neck, head, jaw, beak.
      poly([(100, 140), (114, 140), (104, 68), (94, 70)], pal.neckShade)
      poly([(78, 140), (100, 140), (94, 70), (80, 74)], pal.neck)
      poly([(50, 36), (92, 30), (102, 66), (66, 74)], pal.head)
      poly([(66, 74), (102, 66), (94, 70), (80, 74)], pal.jaw)
      poly([(54, 48), (64, 70), (8, 62)], pal.beak)

      // Face per pose.
      switch pose {
      case .happyClassic:
        quad(68, 50, 77, 41, 86, 50, 4.5, .white)
      case .smug:
        var half = Path()
        half.move(to: pt(70, 49))
        half.addArc(center: pt(78, 49), radius: 8 * s,
                    startAngle: .degrees(180), endAngle: .degrees(0), clockwise: true)
        half.closeSubpath()
        ctx.fill(half, with: .color(.white))
        circle(78, 51, 2.6, maniPupil)
        line(69, 46, 87, 46, 3.5, maniInk)
      case .starstruck:
        poly([(78, 41), (81, 47), (88, 50), (81, 53), (78, 59), (75, 53), (68, 50), (75, 47)],
             rgb(255, 210, 77))
        glyphText("✦", 98, 22, 13, rgb(255, 232, 145))
        glyphText("✦", 106, 41, 9, rgb(255, 232, 145))
      case .party:
        quad(68, 50, 77, 41, 86, 50, 4.5, .white)
        poly([(72, 10), (86, 29), (57, 32)], rgb(255, 92, 138))
        circle(72, 10, 3.5, .white)
        circle(48, 22, 2, rgb(255, 210, 77))
        circle(102, 18, 2, rgb(143, 220, 255))
        circle(60, 14, 2, rgb(124, 255, 178))
        circle(96, 32, 2, rgb(255, 179, 199))
      case .fireEye:
        circle(78, 50, 8.5, .white)
        var flame = Path()
        flame.move(to: pt(78, 43.5))
        flame.addQuadCurve(to: pt(78, 57), control: pt(72.5, 51))
        flame.addQuadCurve(to: pt(78, 43.5), control: pt(83.5, 51))
        ctx.fill(flame, with: .color(rgb(255, 138, 61)))
        var core = Path()
        core.move(to: pt(78, 48))
        core.addQuadCurve(to: pt(78, 55.2), control: pt(75.4, 52.2))
        core.addQuadCurve(to: pt(78, 48), control: pt(80.6, 52.2))
        ctx.fill(core, with: .color(rgb(255, 210, 77)))
        quad(64, 38, 76, 29, 90, 35, 4, maniInk)
        glyphText("✦", 98, 27, 12, rgb(255, 184, 107))
      case .watching:
        circle(78, 50, 7, .white); circle(75, 51, 3.2, maniPupil)
      case .sideEye:
        circle(78, 51, 7, .white); circle(72, 52, 3.2, maniPupil)
      case .quizzical:
        circle(78, 52, 6.5, .white); circle(76, 53, 3, maniPupil)
        quad(66, 38, 78, 31, 90, 38, 4, maniInk)
      case .sweating:
        circle(78, 52, 6, .white); circle(76, 53, 2.8, maniPupil)
        line(66, 40, 90, 44, 4, maniInk)
        var drop = Path()
        drop.move(to: pt(97, 30))
        drop.addQuadCurve(to: pt(97, 42), control: pt(103, 38))
        drop.addQuadCurve(to: pt(97, 30), control: pt(91, 38))
        ctx.fill(drop, with: .color(rgb(159, 214, 255)))
      case .alarmed:
        circle(78, 51, 8.5, .white); circle(78, 52, 2.2, maniPupil)
        glyphText("!", 100, 27, 16, .white, bold: true)
      case .madClassic:
        circle(78, 52, 6.5, .white); circle(75, 52, 3, maniPupil)
        line(64, 47, 90, 37, 5, maniInk)
      case .fuming:
        line(70, 52, 86, 49, 4.5, .white)
        line(64, 46, 90, 36, 5, maniInk)
        glyphText("💢", 98, 27, 15, .white)
      case .disappointed:
        circle(78, 51, 6.5, .white); circle(77, 53, 2.8, maniPupil)
        line(70, 45, 86, 45, 4, maniInk)
      case .icy:
        circle(78, 51, 6, .white); circle(76, 52, 2.8, maniPupil)
        glyphText("❄", 101, 23, 15, rgb(223, 242, 255))
      case .shivering:
        circle(78, 51, 6, .white); circle(76, 52, 2.8, maniPupil)
        quad(46, 34, 41, 39, 46, 44, 2.5, rgb(223, 242, 255))
        quad(42, 30, 35, 38, 42, 46, 2, rgb(223, 242, 255).opacity(0.6))
        quad(106, 42, 111, 47, 106, 52, 2.5, rgb(223, 242, 255))
      case .asleep:
        line(70, 50, 86, 50, 4, .white)
        glyphText("z", 98, 29, 13, rgb(207, 207, 218), bold: true)
        glyphText("z", 107, 20, 10, rgb(181, 181, 194), bold: true)
      }
    }
  }
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
            // Mani replaces the old faint crane watermark: solid mascot peeking
            // from the corner, mood driven by state + time (see maniPose).
            ZStack(alignment: .bottomTrailing) {
              gradientFor(state: entry.state, streak: entry.streak)
              ManiView(pose: pose)
                .frame(width: 96, height: 112)
                .offset(x: 8, y: 12)
                .shadow(color: .black.opacity(0.3), radius: 4, x: 0, y: 2)
            }
          case .systemMedium:
            gradientFor(state: entry.state, streak: entry.streak)
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

  // Mani's mood for this entry (state + time-to-reset + daily variant roll).
  private var pose: ManiPose {
    maniPose(state: entry.state, loggedIn: entry.loggedIn,
             remaining: entry.resetDate.timeIntervalSince(entry.date),
             streak: entry.streak, day: pacificDayOfYear(entry.date))
  }

  // The streak glyph on home families. Lit = 🔥, frozen = 🧊 (with a dark halo
  // so they read on the warm gradient — Android's GLYPH_SHADOW), pending = the
  // grey unlit flame.
  @ViewBuilder private func glyph(size: CGFloat) -> some View {
    if entry.state == .pending {
      unlitFlameGlyph(size: size)
    } else {
      Text(emoji(for: entry.state))
        .font(.system(size: size))
        .shadow(color: .black.opacity(0.5), radius: 3, x: 0, y: 1)
    }
  }

  // Grey unlit flame (SF Symbol) — the same idea as Android's UNLIT_FLAME_SVG:
  // a flame *shape* in grey, not a desaturated emoji.
  private func unlitFlameGlyph(size: CGFloat) -> some View {
    Image(systemName: "flame.fill")
      .font(.system(size: size))
      .foregroundColor(unlitFlame)
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
      unlitFlameGlyph(size: 42)
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
        unlitFlameGlyph(size: 38)
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

  // NO AccessoryWidgetBackground here or in `circular` — it was the suspected
  // culprit in the earlier blank-widget failure, and the simple path proved
  // fine without it. Emoji instead of the crane Image (see `circular`).
  private var loggedOutCircular: some View {
    ZStack {
      Text("🔥").font(.system(size: 24)).grayscale(1).opacity(0.5)
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

  // Live countdown to midnight PT, shown wherever today isn't done (pending or
  // frozen) on home AND lock widgets — mirrors Android's Chronometer. Clamp
  // defensively so the range can never be degenerate (lowerBound must be <=
  // upperBound, or SwiftUI traps). Urgency steps white → amber (<12h) → red
  // (<4h), matching Android; the tier is fixed per timeline entry (getTimeline
  // emits boundary entries). The iPhone lock screen renders accessories in
  // vibrant (monochrome) mode where colour only shifts brightness, so the red
  // tier also goes bold to still read as urgent there. `weight` is the base
  // weight below the red tier (bold on home gradients, regular on lock).
  private func countdown(weight: Font.Weight = .regular) -> some View {
    let start = min(entry.date, entry.resetDate)
    let end = max(entry.resetDate, start.addingTimeInterval(1))
    let remaining = entry.resetDate.timeIntervalSince(entry.date)
    let color: Color = remaining > 12 * 3600 ? .white
      : remaining > 4 * 3600 ? Color(red: 1.0, green: 0.784, blue: 0.235)
      : Color(red: 1.0, green: 0.361, blue: 0.361)
    return Text(timerInterval: start...end, countsDown: true)
      .monospacedDigit()
      .fontWeight(remaining <= 4 * 3600 ? .bold : weight)
      .foregroundColor(color)
      .lineLimit(1).minimumScaleFactor(0.5)
  }

  // A single frost speck (used on frozen widgets).
  private func speck(_ s: String, _ size: CGFloat, _ op: Double, _ x: CGFloat, _ y: CGFloat) -> some View {
    Text(s).font(.system(size: size)).foregroundColor(.white).opacity(op).position(x: x, y: y)
  }

  // Home screen — small: streak pinned TOP-left (flame left of the number,
  // label under), Mani peeking bottom-right, and while today isn't done a live
  // countdown bottom-left. The content top-anchors in every state so the
  // mascot always owns the lower-right corner.
  private var small: some View {
    let milestone = isGoldMilestone(entry.state, entry.streak)
    let showTimer = entry.state != .lit
    return VStack(alignment: .leading, spacing: 0) {
      // NO trophy here (it over-crowded the row at 3+ digits; the gold gradient
      // + Mani's starstruck/party poses carry the milestone), and NO
      // layoutPriority on the number (it starved the glyph instead — the flame
      // compressed to invisible under a wide number). Instead: the glyph is
      // fixedSize so it can never be squeezed, and the number shrinks via
      // minimumScaleFactor. 24/44 match Android's flame/number proportions and
      // fit 3 digits with no scaling on every device size.
      HStack(spacing: 6) {
        glyph(size: 24)
          .fixedSize()
        Text("\(entry.streak)")
          .font(.system(size: 44, weight: .heavy)).foregroundColor(.white)
          .lineLimit(1).minimumScaleFactor(0.4)
          .shadow(color: milestone ? milestoneNumberShadow : numberShadow,
                  radius: milestone ? 5.5 : 3.5, x: 0, y: 2)
      }
      Text(streakLabel(state: entry.state, freezesLeft: entry.freezesLeft))
        .font(.system(size: 12, weight: .semibold)).foregroundColor(.white.opacity(0.85))
        .lineLimit(1).minimumScaleFactor(0.6)
        .padding(.top, 2)
      if showTimer {
        Spacer(minLength: 4)
        countdown(weight: .bold).font(.system(size: 16))
      }
    }
    .padding(16)
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
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

  // Home screen — medium: streak (left) + quests & rotating hook (right).
  // Android's medium uses a full-width quest panel instead (its cells are wide
  // but short) — an intentional per-platform divergence; the copy, colours,
  // milestone tiers, and quest-row content do match.
  private var medium: some View {
    let milestone = isGoldMilestone(entry.state, entry.streak)
    return HStack(spacing: 16) {
      VStack(alignment: .leading, spacing: 0) {
        HStack(spacing: 2) {
          glyph(size: 32)
          if milestone {
            Spacer(minLength: 2)
            Text("✨").font(.system(size: 13))
            Text("🏆").font(.system(size: 26))
          }
        }
        Spacer(minLength: 2)
        Text("\(entry.streak)")
          .font(.system(size: 42, weight: .heavy)).foregroundColor(.white)
          .lineLimit(1).minimumScaleFactor(0.4)
          .layoutPriority(1)
          .shadow(color: milestone ? milestoneNumberShadow : numberShadow,
                  radius: milestone ? 5.5 : 3.5, x: 0, y: 2)
        Text(streakLabel(state: entry.state, freezesLeft: entry.freezesLeft))
          .font(.system(size: 12, weight: .semibold)).foregroundColor(.white.opacity(0.85))
          .lineLimit(1).minimumScaleFactor(0.6)
        if entry.state != .lit {
          countdown(weight: .bold).font(.system(size: 14)).padding(.top, 3)
        }
      }
      .frame(width: 92, alignment: .leading)

      Rectangle().fill(.white.opacity(0.22)).frame(width: 1)

      VStack(alignment: .leading, spacing: 7) {
        // No quest data synced yet (e.g. the blob predates the quest sync) —
        // center the logo + hook. With quests they stack on top and the hook
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
  // (No AccessoryWidgetBackground — see loggedOutCircular. And NO UIImage
  // crane on ANY lock accessory: after a bet flipped the state to lit, the
  // lock widgets shimmered — the crane Image was the only non-emoji element
  // on that path, while the emoji-only frozen path rendered fine. Emoji only.)
  private var circular: some View {
    let done = entry.state == .lit
    return ZStack {
      if entry.state == .frozen {
        Text("🧊").font(.system(size: 40)).opacity(0.32)
        circularFrost
      } else {
        Text("🔥").font(.system(size: 40)).opacity(0.3)
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
        switch entry.state {
        case .pending:
          countdown().font(.system(size: 12)).opacity(0.9)
        case .frozen:
          // Just "Frozen" + the ticking timer — the freezes-left count lives on
          // the home widgets; three segments truncated here ("Frozen · 2 le…").
          HStack(spacing: 4) {
            Text("Frozen ·")
            countdown()
          }
          .font(.system(size: 12)).opacity(0.9)
          .lineLimit(1).minimumScaleFactor(0.6)
        case .lit:
          Text("Done today ✓").font(.system(size: 12)).opacity(0.9)
        }
      }
      Spacer(minLength: 0)
    }
  }

  // Lock screen — inline (beside the clock). The glyph already says lit/frozen,
  // so any not-done-today state shows the ticking countdown.
  private var inline: some View {
    HStack(spacing: 4) {
      Text(emoji(for: entry.state))
      if entry.state == .lit {
        Text("\(entry.streak)-day streak")
      } else {
        Text("\(entry.streak) ·")
        countdown()
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
