import Foundation

enum OfficialBlogError: LocalizedError {
    case invalidURL
    case invalidResponse
    case httpError(group: BlogGroup, status: Int)
    case missingArticle
    case invalidData
    case pageLimit(group: BlogGroup, memberID: String)

    var errorDescription: String? {
        switch self {
        case .invalidURL:
            "公式サイトのURLを作成できませんでした。"
        case .invalidResponse:
            "公式サイトから正しい応答を受信できませんでした。"
        case let .httpError(group, status):
            "\(group.label)公式サイトの取得に失敗しました（HTTP \(status)）。"
        case .missingArticle:
            "ブログ本文を見つけられませんでした。"
        case .invalidData:
            "公式サイトのデータを読み取れませんでした。"
        case let .pageLimit(group, memberID):
            "取得ページ上限に達しました。\(group.label) メンバーID \(memberID) の取得を中断しました。"
        }
    }
}

actor OfficialBlogService {
    private let session: URLSession
    private let maximumPages = 500
    private let nogiPageSize = 100
    private let maximumRequestAttempts = 3

    init() {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.timeoutIntervalForRequest = 25
        configuration.timeoutIntervalForResource = 35
        configuration.requestCachePolicy = .reloadIgnoringLocalCacheData
        session = URLSession(configuration: configuration)
    }

    func fetchMembers(group: BlogGroup) async throws -> [BlogMember] {
        let html = try await fetchText(group: group, path: group.membersPath)
        let members = group == .keyaki
            ? parseKeyakiMembers(html, group: group)
            : parseOptionMembers(html, group: group)

        if members.isEmpty {
            throw OfficialBlogError.invalidData
        }
        return members
    }

    func fetchBlogs(group: BlogGroup, memberIDs: [String]) async throws -> [BlogPost] {
        if group == .nogi {
            return try await fetchNogiBlogs(memberIDs: memberIDs)
        }
        return try await fetchHTMLBlogs(group: group, memberIDs: memberIDs)
    }

    func printHTML(for post: BlogPost) async throws -> String {
        let officialHTML = try await fetchText(group: post.group, path: post.group.detailPath(id: post.id))
        let printData = try extractPrintData(post: post, officialHTML: officialHTML)
        let sourceURL = URL(string: post.group.detailPath(id: post.id), relativeTo: post.group.baseURL)?
            .absoluteURL.absoluteString ?? post.url.absoluteString
        let article = sanitisedArticleHTML(printData.article)

        return """
        <!doctype html>
        <html lang="ja">
          <head>
            <meta charset="utf-8">
            <base href="\(post.group.baseURL.absoluteString)/">
            <meta name="viewport" content="width=device-width, initial-scale=1">
            <title>\(HTMLHelpers.escape(printData.title))</title>
            <style>
              @page { size: A4; margin: 13mm 12mm 15mm; }
              * { box-sizing: border-box; }
              body {
                margin: 0;
                color: #20242b;
                background: #fff;
                font-family: "Hiragino Kaku Gothic ProN", "Yu Gothic", "MS Gothic", sans-serif;
                font-size: 14px;
                line-height: 1.86;
                letter-spacing: 0;
              }
              .print-shell { max-width: 760px; margin: 0 auto; }
              .print-kicker {
                margin: 0 0 7px;
                color: #2878b8;
                font-size: 11px;
                font-weight: 700;
              }
              .print-title {
                margin: 0 0 8px;
                font-size: 25px;
                line-height: 1.35;
                word-break: break-word;
              }
              .print-meta {
                display: flex;
                flex-wrap: wrap;
                gap: 6px 14px;
                margin: 0 0 20px;
                color: #626c78;
                font-size: 12px;
              }
              .p-blog-article__head { display: none; }
              .blog-content, .c-blog-article__text { word-break: break-word; }
              .blog-content p, .c-blog-article__text p { margin: 0; }
              .blog-content img, .c-blog-article__text img {
                display: block;
                width: auto !important;
                max-width: 25% !important;
                height: auto !important;
                margin: 8px auto;
                break-inside: avoid;
                border-radius: 2px;
              }
              .blog-content a, .c-blog-article__text a {
                color: #1d5f94;
                text-decoration: underline;
                overflow-wrap: anywhere;
              }
              .blog-content iframe, .blog-content video,
              .c-blog-article__text iframe, .c-blog-article__text video {
                max-width: 100%;
              }
              .print-source {
                margin-top: 26px;
                padding-top: 10px;
                border-top: 1px solid #dfe4ea;
                color: #6a7382;
                font-size: 10px;
                overflow-wrap: anywhere;
              }
            </style>
          </head>
          <body>
            <main class="print-shell">
              <p class="print-kicker">\(HTMLHelpers.escape(post.group.label)) 公式ブログ</p>
              <h1 class="print-title">\(HTMLHelpers.escape(printData.title))</h1>
              <div class="print-meta">
                <span>\(HTMLHelpers.escape(printData.date))</span>
                <span>\(HTMLHelpers.escape(printData.memberName))</span>
              </div>
              <div class="blog-content group-\(post.group.rawValue)">\(article)</div>
              <div class="print-source">\(HTMLHelpers.escape(sourceURL))</div>
            </main>
          </body>
        </html>
        """
    }

    private func fetchHTMLBlogs(group: BlogGroup, memberIDs: [String]) async throws -> [BlogPost] {
        var posts: [BlogPost] = []
        var globallySeen = Set<String>()

        for memberID in memberIDs {
            var seenForMember = Set<String>()

            for pageIndex in 0..<maximumPages {
                let path = try memberListPath(group: group, memberID: memberID, pageIndex: pageIndex)
                let html = try await fetchText(group: group, path: path)
                let pagePosts: [BlogPost]

                switch group {
                case .hinata:
                    pagePosts = parseHinataArticles(html, memberID: memberID, pageIndex: pageIndex)
                case .sakura:
                    pagePosts = parseSakuraArticles(html, memberID: memberID, pageIndex: pageIndex)
                case .keyaki:
                    pagePosts = parseKeyakiArticles(html, memberID: memberID, pageIndex: pageIndex)
                case .nogi:
                    pagePosts = []
                }

                if pagePosts.isEmpty {
                    break
                }

                var newForMember = 0
                for post in pagePosts {
                    if seenForMember.insert(post.id).inserted {
                        newForMember += 1
                    }
                    if globallySeen.insert(post.id).inserted {
                        posts.append(post)
                    }
                }

                if newForMember == 0 {
                    break
                }
                if pageIndex == maximumPages - 1 {
                    throw OfficialBlogError.pageLimit(group: group, memberID: memberID)
                }
            }
        }

        return sortedByNewest(posts)
    }

    private func fetchNogiBlogs(memberIDs: [String]) async throws -> [BlogPost] {
        let group = BlogGroup.nogi
        var posts: [BlogPost] = []
        var globallySeen = Set<String>()

        for memberID in memberIDs {
            var seenForMember = Set<String>()

            for offset in stride(from: 0, to: maximumPages * nogiPageSize, by: nogiPageSize) {
                var components = URLComponents(
                    url: group.baseURL.appendingPathComponent("/s/n46/api/list/blog"),
                    resolvingAgainstBaseURL: false
                )
                components?.queryItems = [
                    URLQueryItem(name: "rw", value: String(nogiPageSize)),
                    URLQueryItem(name: "st", value: String(offset)),
                    URLQueryItem(name: "ct", value: memberID)
                ]
                guard let url = components?.url else {
                    throw OfficialBlogError.invalidURL
                }

                let raw = try await fetchText(group: group, url: url)
                let payload = try parseNogiJSONP(raw)
                let pagePosts = parseNogiArticles(
                    payload.data,
                    memberID: memberID,
                    pageIndex: offset / nogiPageSize
                )
                if pagePosts.isEmpty {
                    break
                }

                var newForMember = 0
                for post in pagePosts {
                    if seenForMember.insert(post.id).inserted {
                        newForMember += 1
                    }
                    if globallySeen.insert(post.id).inserted {
                        posts.append(post)
                    }
                }

                if newForMember == 0 || (payload.count != nil && offset + pagePosts.count >= payload.count!) {
                    break
                }
            }
        }

        return sortedByNewest(posts)
    }

    private func fetchText(group: BlogGroup, path: String) async throws -> String {
        guard let url = URL(string: path, relativeTo: group.baseURL)?.absoluteURL else {
            throw OfficialBlogError.invalidURL
        }
        return try await fetchText(group: group, url: url)
    }

    private func fetchText(group: BlogGroup, url: URL) async throws -> String {
        guard url.host == group.baseURL.host else {
            throw OfficialBlogError.invalidURL
        }

        var request = URLRequest(url: url)
        request.setValue(
            "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1",
            forHTTPHeaderField: "User-Agent"
        )
        request.setValue(
            "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            forHTTPHeaderField: "Accept"
        )
        request.setValue("ja,en-US;q=0.8,en;q=0.6", forHTTPHeaderField: "Accept-Language")

        var lastError: Error = OfficialBlogError.invalidResponse
        for attempt in 0..<maximumRequestAttempts {
            do {
                let (data, response) = try await session.data(for: request)
                guard let httpResponse = response as? HTTPURLResponse else {
                    throw OfficialBlogError.invalidResponse
                }
                guard (200..<300).contains(httpResponse.statusCode) else {
                    throw OfficialBlogError.httpError(group: group, status: httpResponse.statusCode)
                }

                if let text = String(data: data, encoding: .utf8) {
                    return text
                }
                if let text = String(data: data, encoding: .japaneseEUC) {
                    return text
                }
                throw OfficialBlogError.invalidData
            } catch {
                lastError = error
                guard attempt < maximumRequestAttempts - 1, isRetryable(error) else {
                    throw error
                }
                try await Task.sleep(nanoseconds: UInt64(400_000_000 * (attempt + 1)))
            }
        }
        throw lastError
    }

    private func isRetryable(_ error: Error) -> Bool {
        if let urlError = error as? URLError {
            return urlError.code != .cancelled
        }
        if let blogError = error as? OfficialBlogError,
           case let .httpError(_, status) = blogError {
            return status == 429 || status >= 500
        }
        return false
    }

    private func memberListPath(group: BlogGroup, memberID: String, pageIndex: Int) throws -> String {
        let path: String
        let contentType: String?

        switch group {
        case .hinata:
            path = "/s/official/diary/member/list"
            contentType = "member"
        case .sakura:
            path = "/s/s46/diary/blog/list"
            contentType = "blog"
        case .keyaki:
            path = "/s/k46o/diary/member/list"
            contentType = "member"
        case .nogi:
            throw OfficialBlogError.invalidURL
        }

        var components = URLComponents()
        components.path = path
        var query = [URLQueryItem(name: "ima", value: "0000")]
        if pageIndex > 0 {
            query.append(URLQueryItem(name: "page", value: String(pageIndex)))
            if group != .hinata, let contentType {
                query.append(URLQueryItem(name: "cd", value: contentType))
            }
        }
        query.append(URLQueryItem(name: "ct", value: memberID))
        if group == .hinata {
            query.append(URLQueryItem(name: "cd", value: "member"))
        }
        components.queryItems = query

        guard let value = components.string else {
            throw OfficialBlogError.invalidURL
        }
        return value
    }

    private func parseOptionMembers(_ html: String, group: BlogGroup) -> [BlogMember] {
        var members: [BlogMember] = []
        let expectedPath = group == .nogi ? "/diary/MEMBER/list" : group == .sakura
            ? "/diary/blog/list"
            : "/diary/member/list"

        for match in HTMLHelpers.matches(
            #"<option\s+value="([^"]*ct=([^"&]+)[^"]*)"[^>]*>([\s\S]*?)</option>"#,
            in: html
        ) where match.count > 3 && match[1].range(of: expectedPath, options: .caseInsensitive) != nil {
            let label = HTMLHelpers.cleanText(match[3]).split(separator: "|").first.map(String.init) ?? ""
            let updated = HTMLHelpers.first(#"\(([^)]+更新)\)$"#, in: label)
            let name = label.replacingOccurrences(
                of: #"\([^)]*更新\)$"#,
                with: "",
                options: .regularExpression
            ).trimmingCharacters(in: .whitespacesAndNewlines)
            let id = match[2].removingPercentEncoding ?? match[2]

            if !id.isEmpty, !name.isEmpty,
               let url = HTMLHelpers.absoluteURL(match[1], baseURL: group.baseURL) {
                members.append(BlogMember(id: id, name: name, updated: updated, url: url))
            }
        }
        return members
    }

    private func parseKeyakiMembers(_ html: String, group: BlogGroup) -> [BlogMember] {
        var updates: [String: String] = [:]
        for match in HTMLHelpers.matches(
            #"member:\s*"([^"]+)"\s*,\s*update:\s*"([^"]+)""#,
            in: html
        ) where match.count > 2 {
            let parts = HTMLHelpers.matches(#"^(\d{4})-(\d{2})-(\d{2})"#, in: match[2]).first
            if let parts, parts.count > 3 {
                updates[match[1]] = "\(parts[1]).\(parts[2]).\(parts[3])更新"
            }
        }

        var members: [BlogMember] = []
        var seen = Set<String>()
        let pattern = #"<li\b[^>]*data-member="([^"]+)"[\s\S]*?<a href="([^"]*/s/k46o/diary/member/list[^"]*ct=([^"&]+)[^"]*)"[\s\S]*?<p\s+class="name"[^>]*>([\s\S]*?)</p>"#

        for match in HTMLHelpers.matches(pattern, in: html) where match.count > 4 {
            let encodedID = match[3].isEmpty ? match[1] : match[3]
            let id = encodedID.removingPercentEncoding ?? encodedID
            let name = HTMLHelpers.cleanText(match[4])
            guard !id.isEmpty, !name.isEmpty, seen.insert(id).inserted,
                  let url = HTMLHelpers.absoluteURL(match[2], baseURL: group.baseURL) else {
                continue
            }
            members.append(BlogMember(id: id, name: name, updated: updates[id] ?? "", url: url))
        }
        return members
    }

    private func parseHinataArticles(_ html: String, memberID: String, pageIndex: Int) -> [BlogPost] {
        html.components(separatedBy: #"<div class="p-blog-article">"#).dropFirst().compactMap { block in
            let detailTag = HTMLHelpers.first(
                #"(<a\b[^>]*class="[^"]*\bc-button-blog-detail\b[^"]*"[^>]*>)"#,
                in: block
            )
            guard
                let detail = HTMLHelpers.matches(
                    #"href="([^"]*/s/official/diary/detail/(\d+)[^"]*)""#,
                    in: detailTag
                ).first,
                detail.count > 2
            else {
                return nil
            }
            return makePost(
                id: detail[2],
                title: classContent(block, className: "c-blog-article__title"),
                date: classContent(block, className: "c-blog-article__date"),
                memberID: memberID,
                memberName: classContent(block, className: "c-blog-article__name"),
                pageIndex: pageIndex,
                group: .hinata,
                path: detail[1],
                imagePath: HTMLHelpers.first(#"<img[^>]+src="([^"]+)""#, in: block)
            )
        }
    }

    private func parseSakuraArticles(_ html: String, memberID: String, pageIndex: Int) -> [BlogPost] {
        guard let listMatch = HTMLHelpers.matches(#"<ul\s+class="com-blog-part[^"]*">"#, in: html).first,
              let startRange = html.range(of: listMatch[0]) else {
            return []
        }
        let tail = html[startRange.lowerBound...]
        let listBlock = tail.range(of: "</ul>").map { String(tail[..<$0.upperBound]) } ?? String(tail)
        let pattern = #"<li class="box"><a href="([^"]*/s/s46/diary/detail/(\d+)[^"]*)"[\s\S]*?(?=</a></li>)"#

        return HTMLHelpers.matches(pattern, in: listBlock).compactMap { match in
            guard match.count > 2 else { return nil }
            let block = match[0]
            let rawImage = HTMLHelpers.first(#"background-image:\s*url\(([^)]+)\)"#, in: block)
                .trimmingCharacters(in: CharacterSet(charactersIn: "'\""))
            return makePost(
                id: match[2],
                title: HTMLHelpers.first(#"<h3\s+class="title"[^>]*>([\s\S]*?)</h3>"#, in: block),
                date: HTMLHelpers.first(#"<p\s+class="date[^"]*"[^>]*>([\s\S]*?)</p>"#, in: block),
                memberID: memberID,
                memberName: HTMLHelpers.first(#"<p\s+class="name"[^>]*>([\s\S]*?)</p>"#, in: block),
                pageIndex: pageIndex,
                group: .sakura,
                path: match[1],
                imagePath: rawImage
            )
        }
    }

    private func parseKeyakiArticles(_ html: String, memberID: String, pageIndex: Int) -> [BlogPost] {
        guard let listStart = html.range(of: #"<div class="keyaki-blog_list">"#) else {
            return []
        }
        let tail = html[listStart.lowerBound...]
        let listBlock = tail.range(of: #"<div class="pager""#).map {
            String(tail[..<$0.lowerBound])
        } ?? String(tail)

        return HTMLHelpers.matches(#"<article\b[\s\S]*?</article>"#, in: listBlock).compactMap { article in
            let block = article[0]
            guard let titleMatch = HTMLHelpers.matches(
                #"<div\s+class="box-ttl"[\s\S]*?<a href="([^"]*/s/k46o/diary/detail/(\d+)[^"]*)"[^>]*>([\s\S]*?)</a>"#,
                in: block
            ).first, titleMatch.count > 3 else {
                return nil
            }
            let image = HTMLHelpers.matches(#"<img[^>]+src="([^"]*)""#, in: block)
                .first(where: { $0.count > 1 && !$0[1].isEmpty })?[1] ?? ""
            return makePost(
                id: titleMatch[2],
                title: titleMatch[3],
                date: keyakiListDate(block),
                memberID: memberID,
                memberName: HTMLHelpers.first(#"<p\s+class="name"[^>]*>([\s\S]*?)</p>"#, in: block),
                pageIndex: pageIndex,
                group: .keyaki,
                path: titleMatch[1],
                imagePath: image
            )
        }
    }

    private func parseNogiJSONP(_ raw: String) throws -> (count: Int?, data: [[String: Any]]) {
        let trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        let json = trimmed
            .replacingOccurrences(of: #"^res\("#, with: "", options: .regularExpression)
            .replacingOccurrences(of: #"\);?$"#, with: "", options: .regularExpression)
        guard let data = json.data(using: .utf8),
              let object = try JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            throw OfficialBlogError.invalidData
        }
        let count = Int(String(describing: object["count"] ?? ""))
        return (count, object["data"] as? [[String: Any]] ?? [])
    }

    private func parseNogiArticles(
        _ data: [[String: Any]],
        memberID: String,
        pageIndex: Int
    ) -> [BlogPost] {
        data.compactMap { item in
            let id = stringValue(item["code"])
            guard !id.isEmpty else { return nil }
            let path = stringValue(item["link"])
            let url = HTMLHelpers.absoluteURL(path, baseURL: BlogGroup.nogi.baseURL)
                ?? URL(string: BlogGroup.nogi.detailPath(id: id), relativeTo: BlogGroup.nogi.baseURL)!.absoluteURL
            return BlogPost(
                id: id,
                title: stringValue(item["title"]).isEmpty ? "blog-\(id)" : stringValue(item["title"]),
                date: formatNogiDate(stringValue(item["date"])),
                memberID: memberID,
                memberName: stringValue(item["name"]),
                sourcePage: pageIndex + 1,
                group: .nogi,
                url: url,
                imageURL: HTMLHelpers.absoluteURL(stringValue(item["img"]), baseURL: BlogGroup.nogi.baseURL)
            )
        }
    }

    private func makePost(
        id: String,
        title: String,
        date: String,
        memberID: String,
        memberName: String,
        pageIndex: Int,
        group: BlogGroup,
        path: String,
        imagePath: String
    ) -> BlogPost? {
        guard let url = HTMLHelpers.absoluteURL(path, baseURL: group.baseURL) else {
            return nil
        }
        let cleanTitle = HTMLHelpers.cleanText(title)
        return BlogPost(
            id: id,
            title: cleanTitle.isEmpty ? "blog-\(id)" : cleanTitle,
            date: HTMLHelpers.cleanText(date),
            memberID: memberID,
            memberName: HTMLHelpers.cleanText(memberName),
            sourcePage: pageIndex + 1,
            group: group,
            url: url,
            imageURL: HTMLHelpers.absoluteURL(imagePath, baseURL: group.baseURL)
        )
    }

    private func extractPrintData(
        post: BlogPost,
        officialHTML: String
    ) throws -> (article: String, title: String, memberName: String, date: String) {
        switch post.group {
        case .hinata:
            let article = try extractHinataArticle(officialHTML)
            return (
                article,
                cleanedOrFallback(classContent(article, className: "c-blog-article__title"), post.title),
                cleanedOrFallback(classContent(article, className: "c-blog-article__name"), post.memberName),
                cleanedOrFallback(classContent(article, className: "c-blog-article__date"), post.date)
            )

        case .sakura:
            let body = simpleDivContent(officialHTML, className: "box-article")
            guard !body.isEmpty else { throw OfficialBlogError.missingArticle }
            let foot = HTMLHelpers.matches(
                #"<div\s+class="blog-foot"[\s\S]*?<p\s+class="name">([\s\S]*?)</p>\s*<p\s+class="date[^"]*">([\s\S]*?)</p>"#,
                in: officialHTML
            ).first
            return (
                #"<div class="blog-content-body">\#(body)</div>"#,
                cleanedOrFallback(
                    HTMLHelpers.first(#"<h1\s+class="title"[^>]*>([\s\S]*?)</h1>"#, in: officialHTML),
                    post.title
                ),
                cleanedOrFallback(foot?.indices.contains(1) == true ? foot![1] : "", post.memberName),
                cleanedOrFallback(foot?.indices.contains(2) == true ? foot![2] : "", post.date)
            )

        case .keyaki:
            let body = HTMLHelpers.extractBalancedDiv(className: "box-article", from: officialHTML)
            guard !body.isEmpty else { throw OfficialBlogError.missingArticle }
            let single = HTMLHelpers.extractBalancedDiv(className: "keyaki-blog_single", from: officialHTML)
            let source = single.isEmpty ? officialHTML : single
            let member = HTMLHelpers.first(
                #"<p\s+class="name"[\s\S]*?<a[^>]*>([\s\S]*?)</a>"#,
                in: source
            )
            let fallbackMember = HTMLHelpers.first(
                #"<p\s+class="name"[^>]*>([\s\S]*?)</p>"#,
                in: source
            )
            return (
                #"<div class="blog-content-body">\#(body)</div>"#,
                cleanedOrFallback(
                    HTMLHelpers.first(#"<div\s+class="box-ttl"[\s\S]*?<h3[^>]*>([\s\S]*?)</h3>"#, in: source),
                    post.title
                ),
                cleanedOrFallback(member.isEmpty ? fallbackMember : member, post.memberName),
                cleanedOrFallback(
                    HTMLHelpers.first(#"<div\s+class="box-bottom"[\s\S]*?<li>\s*([\s\S]*?)\s*</li>"#, in: source),
                    post.date
                )
            )

        case .nogi:
            let body = HTMLHelpers.extractBalancedDiv(className: "bd--edit", from: officialHTML)
            guard !body.isEmpty else { throw OfficialBlogError.missingArticle }
            return (
                #"<div class="blog-content-body">\#(body)</div>"#,
                cleanedOrFallback(anyClassContent(officialHTML, className: "bd--hd__ttl"), post.title),
                cleanedOrFallback(anyClassContent(officialHTML, className: "bd--prof__name"), post.memberName),
                cleanedOrFallback(anyClassContent(officialHTML, className: "bd--hd__date"), post.date)
            )
        }
    }

    private func extractHinataArticle(_ html: String) throws -> String {
        guard let start = html.range(of: #"<div class="p-blog-article">"#) else {
            throw OfficialBlogError.missingArticle
        }
        let candidates = [
            #"<div class="p-pager""#,
            #"<div class="l-other-contents--blog""#,
            #"<div class="p-blog-entry__group""#,
            "<footer"
        ].compactMap { marker in
            html.range(of: marker, range: start.lowerBound..<html.endIndex)?.lowerBound
        }
        let end = candidates.min() ?? html.endIndex
        return String(html[start.lowerBound..<end])
    }

    private func classContent(_ html: String, className: String) -> String {
        let escaped = NSRegularExpression.escapedPattern(for: className)
        return HTMLHelpers.first(
            #"<div\s+class="\#(escaped)"[^>]*>([\s\S]*?)</div>"#,
            in: html
        )
    }

    private func simpleDivContent(_ html: String, className: String) -> String {
        let escaped = NSRegularExpression.escapedPattern(for: className)
        return HTMLHelpers.first(
            #"<div\b[^>]*class="[^"]*\b\#(escaped)\b[^"]*"[^>]*>([\s\S]*?)</div>"#,
            in: html
        )
    }

    private func anyClassContent(_ html: String, className: String) -> String {
        let escaped = NSRegularExpression.escapedPattern(for: className)
        return HTMLHelpers.first(
            #"<([a-z0-9]+)\b[^>]*class="[^"]*\b\#(escaped)\b[^"]*"[^>]*>([\s\S]*?)</\1>"#,
            in: html,
            group: 2
        )
    }

    private func keyakiListDate(_ block: String) -> String {
        guard let match = HTMLHelpers.matches(
            #"<div\s+class="box-date"[\s\S]*?<time[^>]*>([\s\S]*?)</time>\s*<time[^>]*>([\s\S]*?)</time>"#,
            in: block
        ).first, match.count > 2 else {
            return ""
        }
        let month = HTMLHelpers.cleanText(match[1])
        let day = HTMLHelpers.cleanText(match[2])
        return month.isEmpty || day.isEmpty ? "\(month)\(day)" : "\(month).\(day)"
    }

    private func formatNogiDate(_ value: String) -> String {
        guard let parts = HTMLHelpers.matches(
            #"^(\d{4})/(\d{2})/(\d{2})\s+(\d{2}):(\d{2})"#,
            in: value
        ).first, parts.count > 5 else {
            return value
        }
        return "\(parts[1]).\(parts[2]).\(parts[3]) \(parts[4]):\(parts[5])"
    }

    private func sortedByNewest(_ posts: [BlogPost]) -> [BlogPost] {
        posts.sorted {
            $0.id.compare($1.id, options: .numeric) == .orderedDescending
        }
    }

    private func stringValue(_ value: Any?) -> String {
        if let string = value as? String {
            return string
        }
        if let number = value as? NSNumber {
            return number.stringValue
        }
        return ""
    }

    private func cleanedOrFallback(_ value: String, _ fallback: String) -> String {
        let cleaned = HTMLHelpers.cleanText(value)
        return cleaned.isEmpty ? fallback : cleaned
    }

    private func sanitisedArticleHTML(_ html: String) -> String {
        var value = HTMLHelpers.replacing(#"(?s)<script\b.*?</script>"#, in: html, with: "")
        value = HTMLHelpers.replacing(#"(?s)<iframe\b.*?</iframe>"#, in: value, with: "")
        value = HTMLHelpers.replacing(#"\son\w+\s*=\s*"[^"]*""#, in: value, with: "")
        value = HTMLHelpers.replacing(#"\son\w+\s*=\s*'[^']*'"#, in: value, with: "")
        return value
    }
}
