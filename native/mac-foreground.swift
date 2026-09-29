import AppKit
import ApplicationServices
import Darwin

// Read-only Accessibility client: no screenshots, keystrokes, AX setters or network.
let args = CommandLine.arguments
let full = args.contains("--full")
let once = args.contains("--once")
let parent = args.firstIndex(of: "--parent").flatMap { $0 + 1 < args.count ? Int32(args[$0 + 1]) : nil }
if args.contains("--request-permission") {
    let options = [kAXTrustedCheckOptionPrompt.takeUnretainedValue() as String: true] as CFDictionary
    _ = AXIsProcessTrustedWithOptions(options)
    exit(0)
}
var last = Data()
func emit(_ value: [String: Any]) {
    guard let data = try? JSONSerialization.data(withJSONObject: value, options: [.sortedKeys]), data != last else { return }
    last = data
    FileHandle.standardOutput.write(data)
    FileHandle.standardOutput.write(Data([10]))
}
func attribute(_ element: AXUIElement, _ name: String) -> CFTypeRef? {
    var result: CFTypeRef?
    guard AXUIElementCopyAttributeValue(element, name as CFString, &result) == .success else { return nil }
    return result
}
func poll() {
    if let parent = parent, getppid() != parent { exit(0) }
    guard AXIsProcessTrusted() else { emit(["error": "permission"]); return }
    guard let app = NSWorkspace.shared.frontmostApplication,
          app.processIdentifier != parent, app.processIdentifier != getpid(),
          app.activationPolicy == .regular else { emit(["h": 0, "r": "", "f": false]); return }
    let application = AXUIElementCreateApplication(app.processIdentifier)
    AXUIElementSetMessagingTimeout(application, 0.3)
    guard let ref = attribute(application, kAXFocusedWindowAttribute), CFGetTypeID(ref) == AXUIElementGetTypeID() else {
        emit(["h": 0, "r": "", "f": false]); return
    }
    let window = unsafeBitCast(ref, to: AXUIElement.self)
    AXUIElementSetMessagingTimeout(window, 0.3)
    if (attribute(window, kAXMinimizedAttribute) as? Bool) == true { emit(["h": 0, "r": "", "f": false]); return }
    guard let p = attribute(window, kAXPositionAttribute), CFGetTypeID(p) == AXValueGetTypeID(),
          let s = attribute(window, kAXSizeAttribute), CFGetTypeID(s) == AXValueGetTypeID() else {
        emit(["h": 0, "r": "", "f": false]); return
    }
    var point = CGPoint.zero
    var size = CGSize.zero
    guard AXValueGetValue(unsafeBitCast(p, to: AXValue.self), .cgPoint, &point),
          AXValueGetValue(unsafeBitCast(s, to: AXValue.self), .cgSize, &size),
          size.width > 0, size.height > 0 else { emit(["h": 0, "r": "", "f": false]); return }
    // AX uses logical top-left coordinates, including negative coordinates for other displays.
    var info: [String: Any] = ["h": "\(app.processIdentifier):\(CFHash(window))",
        "r": "\(point.x),\(point.y),\(point.x + size.width),\(point.y + size.height)",
        "f": (attribute(window, "AXFullScreen") as? Bool) ?? false]
    if full {
        info["p"] = app.bundleIdentifier ?? app.localizedName ?? ""
        info["t"] = String((attribute(window, kAXTitleAttribute) as? String ?? "").prefix(512))
    }
    emit(info)
}
poll()
if !once {
    _ = Timer.scheduledTimer(withTimeInterval: 0.25, repeats: true) { _ in poll() }
    RunLoop.main.run()
}
