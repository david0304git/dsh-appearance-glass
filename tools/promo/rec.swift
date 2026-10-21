import AppKit
import WebKit

/// 逐格錄影：載入 HTML，呼叫 window.__render(t) 後截圖，寫成 frame-%05d.png
final class Recorder: NSObject, WKNavigationDelegate {
    let web: WKWebView
    let outDir: String
    let width: CGFloat
    let height: CGFloat
    let fps: Double
    var total = 0
    var index = 0
    var prefix = "frame"
    var still: Double? = nil
    let dark: Bool

    init(html: URL, outDir: String, width: CGFloat, height: CGFloat, fps: Double, prefix: String, dark: Bool) {
        self.outDir = outDir; self.width = width; self.height = height; self.fps = fps
        self.prefix = prefix; self.dark = dark
        let config = WKWebViewConfiguration()
        self.web = WKWebView(frame: NSRect(x: 0, y: 0, width: width, height: height), configuration: config)
        super.init()
        web.navigationDelegate = self
        web.appearance = NSAppearance(named: dark ? .darkAqua : .aqua)
        web.loadFileURL(html, allowingReadAccessTo: html.deletingLastPathComponent())
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        // 讀 __duration 決定總格數
        web.evaluateJavaScript("window.__duration") { value, error in
            let seconds = (value as? Double) ?? (value as? NSNumber)?.doubleValue ?? 0
            guard seconds > 0 else {
                FileHandle.standardError.write("scene must define window.__duration (\(String(describing: error)))\n".data(using: .utf8)!)
                exit(1)
            }
            self.total = Int((seconds * self.fps).rounded())
            if CommandLine.arguments.count >= 9, let still = Double(CommandLine.arguments[8]) {
                self.still = still
            }
            self.step()
        }
    }

    func step() {
        guard index < total else {
            print("done \(total) frames")
            exit(0)
        }
        let t = still ?? Double(index) / fps
        web.evaluateJavaScript("window.__render(\(t)); true") { _, error in
            if let error = error {
                FileHandle.standardError.write("render error at \(self.index): \(error)\n".data(using: .utf8)!)
                exit(1)
            }
            // 讓樣式/版面套用後再截圖
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.004) {
                let cfg = WKSnapshotConfiguration()
                cfg.rect = NSRect(x: 0, y: 0, width: self.width, height: self.height)
                self.web.takeSnapshot(with: cfg) { image, _ in
                    self.write(image, frame: self.index)
                }
            }
        }
    }

    func write(_ image: NSImage?, frame: Int) {
        let path = still == nil
            ? String(format: "%@/%@-%05d.jpg", outDir, prefix, frame)
            : String(format: "%@/%@-still.jpg", outDir, prefix)
        guard let image = image, let tiff = image.tiffRepresentation,
              let rep = NSBitmapImageRep(data: tiff),
              let png = rep.representation(using: .jpeg, properties: [.compressionFactor: 0.94]) else {
            FileHandle.standardError.write("snapshot failed at \(frame)\n".data(using: .utf8)!); exit(1)
        }
        try? png.write(to: URL(fileURLWithPath: path))
        if still != nil { print("still written"); exit(0) }
        index += 1
        if index % 30 == 0 {
            FileHandle.standardError.write("  \(index)/\(total)\n".data(using: .utf8)!)
        }
        step()
    }
}

let args = CommandLine.arguments
guard args.count >= 8 else {
    FileHandle.standardError.write("usage: rec <html> <outdir> <width> <height> <fps> <prefix> <dark 0|1>\n".data(using: .utf8)!)
    exit(2)
}
let app = NSApplication.shared
app.setActivationPolicy(.accessory)
let recorder = Recorder(html: URL(fileURLWithPath: args[1]), outDir: args[2],
                        width: CGFloat(Double(args[3]) ?? 960), height: CGFloat(Double(args[4]) ?? 540),
                        fps: Double(args[5]) ?? 30, prefix: args[6], dark: args[7] == "1")
DispatchQueue.main.async { _ = recorder }
app.run()
