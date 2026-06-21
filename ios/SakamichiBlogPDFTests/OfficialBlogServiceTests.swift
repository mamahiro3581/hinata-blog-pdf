import CoreGraphics
import XCTest
@testable import SakamichiBlogPDF

final class OfficialBlogServiceTests: XCTestCase {
    func testFetchesMembersForEveryGroup() async throws {
        let service = OfficialBlogService()

        for group in BlogGroup.allCases {
            let members = try await service.fetchMembers(group: group)
            XCTAssertFalse(members.isEmpty, "\(group.label)のメンバーが空です。")
            XCTAssertTrue(members.allSatisfy { !$0.id.isEmpty && !$0.name.isEmpty })
        }
    }

    func testFetchesNogiBlogsForCurrentMember() async throws {
        let service = OfficialBlogService()
        let members = try await service.fetchMembers(group: .nogi)
        let member = try XCTUnwrap(members.first(where: { $0.id == "55396" }))

        let blogs = try await service.fetchBlogs(group: .nogi, memberIDs: [member.id])
        XCTAssertFalse(blogs.isEmpty)
        XCTAssertTrue(blogs.allSatisfy { $0.memberID == member.id && $0.group == .nogi })
    }

    func testHinataBlogUsesItsOwnDetailLinkWhenBodyLinksAnotherBlog() async throws {
        let service = OfficialBlogService()
        let blogs = try await service.fetchBlogs(group: .hinata, memberIDs: ["24"])
        let blog = try XCTUnwrap(blogs.first(where: { $0.id == "58154" }))

        XCTAssertEqual(blog.title, "( ¨̮ )>≡本日にぶぱるVALORANT生配信")
        XCTAssertEqual(blog.url.path, "/s/official/diary/detail/58154")
    }

    func testNogiNestedArticleBodiesAreNotTruncated() async throws {
        let service = OfficialBlogService()
        let blogs = try await service.fetchBlogs(group: .nogi, memberIDs: ["36751"])
        let expectedText = [
            "57257": "明日も明後日も明明後日も",
            "57323": "宝物がまた一つ増えました",
            "57443": "この後21時に"
        ]

        for (id, marker) in expectedText {
            let blog = try XCTUnwrap(blogs.first(where: { $0.id == id }))
            let html = try await service.printHTML(for: blog)

            XCTAssertTrue(HTMLHelpers.cleanText(html).contains(marker), "\(id)の本文末尾が欠けています。")
            XCTAssertEqual(html.components(separatedBy: "<img").count - 1, 5, "\(id)の画像が欠けています。")
        }
    }

    @MainActor
    func testRendersOfficialBlogAsPDF() async throws {
        let service = OfficialBlogService()
        let blogs = try await service.fetchBlogs(group: .nogi, memberIDs: ["55396"])
        let blog = try XCTUnwrap(blogs.first)
        let html = try await service.printHTML(for: blog)
        let data = try await PDFExporter().render(html: html, baseURL: blog.group.baseURL)
        let provider = try XCTUnwrap(CGDataProvider(data: data as CFData))
        let document = try XCTUnwrap(CGPDFDocument(provider))

        XCTAssertTrue(data.starts(with: Data("%PDF".utf8)))
        XCTAssertGreaterThan(document.numberOfPages, 0)
    }

    @MainActor
    func testReusesPDFRendererAndIgnoresBrokenImages() async throws {
        let exporter = PDFExporter()
        let html = """
        <html><body><h1>PDF test</h1><img src="broken://image"><p>本文</p></body></html>
        """

        for _ in 0..<2 {
            let data = try await exporter.render(html: html, baseURL: BlogGroup.nogi.baseURL)
            let provider = try XCTUnwrap(CGDataProvider(data: data as CFData))
            let document = try XCTUnwrap(CGPDFDocument(provider))
            XCTAssertGreaterThan(document.numberOfPages, 0)
        }
    }

    func testWritesMultipleFilesAsZip() throws {
        let url = FileManager.default.temporaryDirectory
            .appendingPathComponent("\(UUID().uuidString).zip")
        defer { try? FileManager.default.removeItem(at: url) }

        let writer = try ZipArchiveWriter(url: url)
        try writer.addFile(name: "one.pdf", data: Data("%PDF-one".utf8))
        try writer.addFile(name: "日本語.pdf", data: Data("%PDF-two".utf8))
        let archive = try Data(contentsOf: writer.finish())

        XCTAssertTrue(archive.starts(with: Data([0x50, 0x4b, 0x03, 0x04])))
        XCTAssertNotNil(archive.range(of: Data([0x50, 0x4b, 0x01, 0x02])))
        XCTAssertNotNil(archive.range(of: Data([0x50, 0x4b, 0x05, 0x06])))
    }
}
