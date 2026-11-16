import Foundation
import Vision
import ImageIO

// System framework only. Input: PNG bytes on stdin. Output: top-left pixel quads.
struct Point: Codable { let x: Double; let y: Double }
struct Candidate: Codable { let id: String; let text: String; let confidence: Float; let quad: [Point] }
struct Result: Codable { let width: Int; let height: Int; let candidates: [Candidate] }
do {
    let data = FileHandle.standardInput.readDataToEndOfFile()
    guard data.count <= 24 * 1024 * 1024,
          let source = CGImageSourceCreateWithData(data as CFData, nil),
          let props = CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [CFString: Any],
          let width = props[kCGImagePropertyPixelWidth] as? Int,
          let height = props[kCGImagePropertyPixelHeight] as? Int,
          width > 0, height > 0, width <= 4_194_304 / height,
          let image = CGImageSourceCreateImageAtIndex(source, 0, nil) else { throw NSError(domain: "OCR image exceeds limits or cannot decode", code: 1) }
    let request = VNRecognizeTextRequest()
    request.recognitionLevel = .accurate
    request.recognitionLanguages = ["zh-Hans", "zh-Hant", "en-US"]
    request.usesLanguageCorrection = false
    try VNImageRequestHandler(cgImage: image, options: [:]).perform([request])
    let candidates = (request.results ?? []).prefix(256).enumerated().compactMap { index, observation -> Candidate? in
        guard let text = observation.topCandidates(1).first else { return nil }
        let points = [observation.topLeft, observation.topRight, observation.bottomRight, observation.bottomLeft].map {
            Point(x: Double($0.x) * Double(image.width), y: (1 - Double($0.y)) * Double(image.height))
        }
        return Candidate(id: "vision-\(index)", text: text.string, confidence: text.confidence, quad: points)
    }
    let output = try JSONEncoder().encode(Result(width: image.width, height: image.height, candidates: candidates))
    FileHandle.standardOutput.write(output)
} catch {
    FileHandle.standardError.write(Data("Apple Vision OCR failed: \(error.localizedDescription)".utf8))
    exit(1)
}
