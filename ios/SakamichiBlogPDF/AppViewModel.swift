import Foundation

@MainActor
final class AppViewModel: ObservableObject {
    @Published var group: BlogGroup = .hinata
    @Published private(set) var members: [BlogMember] = []
    @Published var selectedMemberIDs = Set<String>()
    @Published var memberSearch = ""
    @Published private(set) var blogs: [BlogPost] = []
    @Published var selectedBlogIDs = Set<String>()
    @Published var pageSize = 30
    @Published var currentPage = 1
    @Published private(set) var isLoadingMembers = false
    @Published private(set) var isLoadingBlogs = false
    @Published private(set) var isExporting = false
    @Published private(set) var exportProgress = 0.0
    @Published private(set) var statusMessage = "メンバーを選択してください。"
    @Published var alertMessage: String?
    @Published var exportedFile: ExportedFile?

    private let service = OfficialBlogService()
    private let pdfExporter = PDFExporter()

    var filteredMembers: [BlogMember] {
        let query = memberSearch.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !query.isEmpty else { return members }
        return members.filter {
            $0.name.localizedCaseInsensitiveContains(query)
                || $0.updated.localizedCaseInsensitiveContains(query)
        }
    }

    var totalPages: Int {
        max(1, Int(ceil(Double(blogs.count) / Double(pageSize))))
    }

    var currentPageBlogs: [BlogPost] {
        guard !blogs.isEmpty else { return [] }
        let safePage = min(max(1, currentPage), totalPages)
        let start = (safePage - 1) * pageSize
        let end = min(start + pageSize, blogs.count)
        guard start < end else { return [] }
        return Array(blogs[start..<end])
    }

    var selectedBlogCount: Int {
        selectedBlogIDs.count
    }

    var isBusy: Bool {
        isLoadingMembers || isLoadingBlogs || isExporting
    }

    func loadMembers() async {
        let requestedGroup = group
        isLoadingMembers = true
        statusMessage = "\(requestedGroup.label)のメンバーを取得しています..."
        defer { isLoadingMembers = false }

        do {
            let result = try await service.fetchMembers(group: requestedGroup)
            guard group == requestedGroup else { return }
            members = result
            statusMessage = "\(result.count)名のメンバーを取得しました。"
        } catch {
            show(error)
        }
    }

    func reloadForSelectedGroup() async {
        members = []
        selectedMemberIDs = []
        memberSearch = ""
        blogs = []
        selectedBlogIDs = []
        currentPage = 1
        exportedFile = nil
        await loadMembers()
    }

    func toggleMember(_ member: BlogMember) {
        if selectedMemberIDs.contains(member.id) {
            selectedMemberIDs.remove(member.id)
        } else {
            selectedMemberIDs.insert(member.id)
        }
    }

    func selectAllFilteredMembers() {
        selectedMemberIDs.formUnion(filteredMembers.map(\.id))
    }

    func clearMembers() {
        selectedMemberIDs.removeAll()
    }

    func fetchBlogs() async {
        let memberIDs = members.map(\.id).filter(selectedMemberIDs.contains)
        guard !memberIDs.isEmpty else {
            alertMessage = "対象メンバーを1名以上選択してください。"
            return
        }

        isLoadingBlogs = true
        blogs = []
        selectedBlogIDs = []
        currentPage = 1
        statusMessage = "公式ブログをすべて取得しています..."
        defer { isLoadingBlogs = false }

        do {
            blogs = try await service.fetchBlogs(group: group, memberIDs: memberIDs)
            statusMessage = "\(blogs.count)件のブログを取得しました。"
        } catch {
            show(error)
        }
    }

    func toggleBlog(_ blog: BlogPost) {
        if selectedBlogIDs.contains(blog.id) {
            selectedBlogIDs.remove(blog.id)
        } else {
            selectedBlogIDs.insert(blog.id)
        }
    }

    func selectAllVisibleBlogs() {
        selectedBlogIDs.formUnion(currentPageBlogs.map(\.id))
    }

    func clearBlogs() {
        selectedBlogIDs.removeAll()
    }

    func setPageSize(_ size: Int) {
        pageSize = size
        currentPage = 1
    }

    func moveToPage(_ page: Int) {
        currentPage = min(max(1, page), totalPages)
    }

    func exportSelectedBlogs() async {
        let selected = blogs.filter { selectedBlogIDs.contains($0.id) }
        guard !selected.isEmpty else {
            alertMessage = "保存するブログを1件以上選択してください。"
            return
        }

        isExporting = true
        exportProgress = 0
        statusMessage = "\(selected.count)件のPDFを生成しています..."
        defer { isExporting = false }

        do {
            let directory = try makeExportDirectory()
            if selected.count == 1, let post = selected.first {
                let data = try await render(post: post)
                let url = directory.appendingPathComponent(pdfFilename(for: post))
                try data.write(to: url, options: .atomic)
                exportProgress = 1
                exportedFile = ExportedFile(url: url)
            } else {
                let zipURL = directory.appendingPathComponent(zipFilename())
                let writer = try ZipArchiveWriter(url: zipURL)
                for (index, post) in selected.enumerated() {
                    statusMessage = "\(index + 1)/\(selected.count)件目のPDFを生成しています..."
                    let data = try await render(post: post)
                    try writer.addFile(name: pdfFilename(for: post), data: data)
                    exportProgress = Double(index + 1) / Double(selected.count)
                }
                exportedFile = ExportedFile(url: try writer.finish())
            }
            statusMessage = selected.count == 1
                ? "PDFを生成しました。"
                : "\(selected.count)件のPDFをZIPにまとめました。"
        } catch {
            show(error)
        }
    }

    private func render(post: BlogPost) async throws -> Data {
        let html = try await service.printHTML(for: post)
        return try await pdfExporter.render(html: html, baseURL: post.group.baseURL)
    }

    private func makeExportDirectory() throws -> URL {
        let root = FileManager.default.temporaryDirectory
            .appendingPathComponent("SakamichiBlogPDF", isDirectory: true)
        try? FileManager.default.removeItem(at: root)
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
        return root
    }

    private func pdfFilename(for post: BlogPost) -> String {
        let raw = "\(post.date)_\(post.memberName)_\(post.title)_\(post.id)"
        return "\(sanitiseFilename(raw, limit: 120)).pdf"
    }

    private func zipFilename() -> String {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.dateFormat = "yyyyMMdd_HHmmss"
        return "\(group.rawValue)_blogs_\(formatter.string(from: Date())).zip"
    }

    private func sanitiseFilename(_ value: String, limit: Int) -> String {
        let forbidden = CharacterSet(charactersIn: "/\\:?*\"<>|\n\r\t")
        let parts = value.components(separatedBy: forbidden)
        let cleaned = parts.joined(separator: "_")
            .replacingOccurrences(of: #"\s+"#, with: " ", options: .regularExpression)
            .trimmingCharacters(in: .whitespacesAndNewlines)
        return String((cleaned.isEmpty ? "blog" : cleaned).prefix(limit))
    }

    private func show(_ error: Error) {
        let message = (error as? LocalizedError)?.errorDescription ?? error.localizedDescription
        statusMessage = "処理に失敗しました。"
        alertMessage = message
    }
}
