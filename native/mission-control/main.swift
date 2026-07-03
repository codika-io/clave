// Mission Control detector for Clave.
//
// Watches the window server's catenated transform of a target window via the
// private SkyLight framework: outside Mission Control the transform is the
// identity; the instant Mission Control (or App Exposé) lays windows out in
// its grid, the window server multiplies in a scale, so the transform
// deviating from identity is the "entered" signal. CGS notification 1328
// gives an immediate "exited" signal; polling covers both edges regardless.
//
// All private symbols are resolved with dlopen/dlsym so the binary carries no
// load command against a private framework and degrades to a clean
// `registered: false` if a future macOS removes them.
//
// Protocol (newline-delimited JSON):
//   stdin  ← {"cmd":"set-target-window","windowId":<CGWindowID>}
//   stdin  ← {"cmd":"shutdown"}
//   stdout → {"event":"initialized","registered":true|false}
//   stdout → {"event":"entered"} / {"event":"exited"}

import CoreGraphics
import Foundation

private typealias SLSMainConnectionIDFn = @convention(c) () -> Int32
private typealias SLSGetCatenatedWindowTransformFn = @convention(c) (
    Int32, UInt32, UnsafeMutablePointer<CGAffineTransform>
) -> Int32
private typealias CGSNotifyProcPtr = UnsafeMutableRawPointer
private typealias CGSRegisterNotifyProcFn = @convention(c) (
    CGSNotifyProcPtr, UInt32, UnsafeMutableRawPointer?
) -> Int32

private let kCGSMissionControlExited: UInt32 = 1328
private let skyLightPath = "/System/Library/PrivateFrameworks/SkyLight.framework/Versions/A/SkyLight"
private let pollInterval: TimeInterval = 0.066
private let scaleTolerance: CGFloat = 0.001

setbuf(stdout, nil)

private func emit(_ object: [String: Any]) {
    guard let data = try? JSONSerialization.data(withJSONObject: object),
          let line = String(data: data, encoding: .utf8) else { return }
    print(line)
}

// MARK: - Resolve private symbols

guard let skyLight = dlopen(skyLightPath, RTLD_LAZY),
      let mainConnectionSym = dlsym(skyLight, "SLSMainConnectionID"),
      let getTransformSym = dlsym(skyLight, "SLSGetCatenatedWindowTransform")
else {
    emit(["event": "initialized", "registered": false])
    exit(0)
}

private let mainConnectionID = unsafeBitCast(mainConnectionSym, to: SLSMainConnectionIDFn.self)
private let getCatenatedWindowTransform = unsafeBitCast(
    getTransformSym, to: SLSGetCatenatedWindowTransformFn.self
)
private let connectionID = mainConnectionID()

// MARK: - State (main runloop thread only)

var targetWindowID: UInt32?
var missionControlActive = false
var pendingScaledTicks = 0
var previousScale: CGFloat = 1.0

private let scaleGrowthEpsilon: CGFloat = 0.005

private func setActive(_ active: Bool) {
    guard active != missionControlActive else { return }
    missionControlActive = active
    emit(["event": active ? "entered" : "exited"])
}

// MARK: - Transform polling

private func pollTransform() {
    // Orphan guard: if the parent Electron process died without sending
    // shutdown (crash, SIGKILL), we get reparented to launchd — exit.
    if getppid() == 1 { exit(0) }
    guard let windowID = targetWindowID else { return }
    var transform = CGAffineTransform.identity
    guard getCatenatedWindowTransform(connectionID, windowID, &transform) == 0 else {
        // Stale/invalid window id — treat as not scaled.
        pendingScaledTicks = 0
        setActive(false)
        return
    }
    let scale = max(abs(transform.a), abs(transform.d))
    let scaled = abs(transform.a - 1) > scaleTolerance || abs(transform.d - 1) > scaleTolerance
    defer { previousScale = scale }
    if scaled {
        // While active, a growing scale means the exit animation started
        // (window flying back to full size) — hide immediately rather than
        // waiting for the transform to reach identity.
        if missionControlActive && scale > previousScale + scaleGrowthEpsilon {
            pendingScaledTicks = 0
            setActive(false)
            return
        }
        // Debounce one tick so transient window-server animations don't flash the overlay.
        pendingScaledTicks += 1
        if pendingScaledTicks >= 2 { setActive(true) }
    } else {
        pendingScaledTicks = 0
        setActive(false)
    }
}

let timer = CFRunLoopTimerCreateWithHandler(
    kCFAllocatorDefault,
    CFAbsoluteTimeGetCurrent() + pollInterval,
    pollInterval, 0, 0
) { _ in pollTransform() }
CFRunLoopAddTimer(CFRunLoopGetMain(), timer, .commonModes)

// MARK: - CGS "Mission Control exited" notification (belt-and-braces exit edge)

private let missionControlExitedProc: @convention(c) (
    UInt32, UnsafeMutableRawPointer?, UInt32, UnsafeMutableRawPointer?
) -> Void = { _, _, _, _ in
    CFRunLoopPerformBlock(CFRunLoopGetMain(), CFRunLoopMode.commonModes.rawValue) {
        pendingScaledTicks = 0
        setActive(false)
    }
    CFRunLoopWakeUp(CFRunLoopGetMain())
}

if let registerSym = dlsym(skyLight, "CGSRegisterNotifyProc") {
    let registerNotifyProc = unsafeBitCast(registerSym, to: CGSRegisterNotifyProcFn.self)
    _ = registerNotifyProc(
        unsafeBitCast(missionControlExitedProc, to: UnsafeMutableRawPointer.self),
        kCGSMissionControlExited, nil
    )
}

// MARK: - stdin command loop

FileHandle.standardInput.readabilityHandler = { handle in
    let data = handle.availableData
    if data.isEmpty {
        // Parent closed stdin (crashed or quit) — exit rather than linger.
        CFRunLoopPerformBlock(CFRunLoopGetMain(), CFRunLoopMode.commonModes.rawValue) { exit(0) }
        CFRunLoopWakeUp(CFRunLoopGetMain())
        return
    }
    for line in data.split(separator: UInt8(ascii: "\n")) {
        guard let json = try? JSONSerialization.jsonObject(with: Data(line)) as? [String: Any],
              let cmd = json["cmd"] as? String else { continue }
        CFRunLoopPerformBlock(CFRunLoopGetMain(), CFRunLoopMode.commonModes.rawValue) {
            switch cmd {
            case "set-target-window":
                if let windowID = json["windowId"] as? UInt32 {
                    targetWindowID = windowID
                } else if let windowID = json["windowId"] as? Int, windowID > 0 {
                    targetWindowID = UInt32(windowID)
                }
            case "shutdown":
                exit(0)
            default:
                break
            }
        }
        CFRunLoopWakeUp(CFRunLoopGetMain())
    }
}

emit(["event": "initialized", "registered": true])
CFRunLoopRun()
