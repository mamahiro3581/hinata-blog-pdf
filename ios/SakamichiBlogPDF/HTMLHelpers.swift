import Foundation

enum HTMLHelpers {
    static func matches(
        _ pattern: String,
        in text: String,
        options: NSRegularExpression.Options = [.caseInsensitive]
    ) -> [[String]] {
        guard let expression = try? NSRegularExpression(pattern: pattern, options: options) else {
            return []
        }

        let range = NSRange(text.startIndex..<text.endIndex, in: text)
        return expression.matches(in: text, range: range).map { result in
            (0..<result.numberOfRanges).map { index in
                let range = result.range(at: index)
                guard range.location != NSNotFound, let swiftRange = Range(range, in: text) else {
                    return ""
                }
                return String(text[swiftRange])
            }
        }
    }

    static func first(_ pattern: String, in text: String, group: Int = 1) -> String {
        matches(pattern, in: text).first.flatMap { captures in
            captures.indices.contains(group) ? captures[group] : nil
        } ?? ""
    }

    static func replacing(_ pattern: String, in text: String, with replacement: String) -> String {
        guard let expression = try? NSRegularExpression(pattern: pattern, options: [.caseInsensitive]) else {
            return text
        }
        let range = NSRange(text.startIndex..<text.endIndex, in: text)
        return expression.stringByReplacingMatches(in: text, range: range, withTemplate: replacement)
    }

    static func cleanText(_ html: String) -> String {
        var value = replacing("(?s)<script\\b.*?</script>", in: html, with: "")
        value = replacing("(?s)<style\\b.*?</style>", in: value, with: "")
        value = replacing("(?s)<[^>]+>", in: value, with: " ")
        value = decodeEntities(value)
        return value.replacingOccurrences(of: "\\s+", with: " ", options: .regularExpression)
            .trimmingCharacters(in: .whitespacesAndNewlines)
    }

    static func decodeEntities(_ value: String) -> String {
        var result = value
            .replacingOccurrences(of: "&nbsp;", with: " ")
            .replacingOccurrences(of: "&amp;", with: "&")
            .replacingOccurrences(of: "&quot;", with: "\"")
            .replacingOccurrences(of: "&#39;", with: "'")
            .replacingOccurrences(of: "&lt;", with: "<")
            .replacingOccurrences(of: "&gt;", with: ">")

        for match in matches("&#x([0-9a-f]+);", in: result) {
            guard
                match.count > 1,
                let value = UInt32(match[1], radix: 16),
                let scalar = UnicodeScalar(value)
            else { continue }
            result = result.replacingOccurrences(of: match[0], with: String(scalar))
        }

        for match in matches("&#(\\d+);", in: result) {
            guard
                match.count > 1,
                let value = UInt32(match[1]),
                let scalar = UnicodeScalar(value)
            else { continue }
            result = result.replacingOccurrences(of: match[0], with: String(scalar))
        }
        return result
    }

    static func absoluteURL(_ value: String, baseURL: URL) -> URL? {
        guard !value.isEmpty else { return nil }
        return URL(string: decodeEntities(value), relativeTo: baseURL)?.absoluteURL
    }

    static func extractBalancedDiv(className: String, from html: String) -> String {
        let escaped = NSRegularExpression.escapedPattern(for: className)
        let pattern = "<div\\b[^>]*class=\"[^\"]*\\b\(escaped)\\b[^\"]*\"[^>]*>"
        guard
            let expression = try? NSRegularExpression(pattern: pattern, options: [.caseInsensitive]),
            let startMatch = expression.firstMatch(
                in: html,
                range: NSRange(html.startIndex..<html.endIndex, in: html)
            ),
            let tagStart = Range(startMatch.range, in: html)
        else {
            return ""
        }

        let contentStart = tagStart.upperBound
        let tail = String(html[contentStart...])
        guard let tagExpression = try? NSRegularExpression(
            pattern: "</?div\\b[^>]*>",
            options: [.caseInsensitive]
        ) else {
            return tail
        }

        var depth = 1
        let matches = tagExpression.matches(
            in: tail,
            range: NSRange(tail.startIndex..<tail.endIndex, in: tail)
        )
        for match in matches {
            guard let range = Range(match.range, in: tail) else { continue }
            let tag = String(tail[range])
            depth += tag.hasPrefix("</") ? -1 : 1
            if depth == 0 {
                return String(tail[..<range.lowerBound])
            }
        }
        return tail
    }

    static func escape(_ value: String) -> String {
        value
            .replacingOccurrences(of: "&", with: "&amp;")
            .replacingOccurrences(of: "<", with: "&lt;")
            .replacingOccurrences(of: ">", with: "&gt;")
            .replacingOccurrences(of: "\"", with: "&quot;")
            .replacingOccurrences(of: "'", with: "&#39;")
    }
}
