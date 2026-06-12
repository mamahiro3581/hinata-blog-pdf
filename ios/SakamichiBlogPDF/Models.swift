import Foundation
import SwiftUI

enum BlogGroup: String, CaseIterable, Identifiable, Codable {
    case hinata
    case sakura
    case keyaki
    case nogi

    var id: String { rawValue }

    var label: String {
        switch self {
        case .hinata: "日向坂46"
        case .sakura: "櫻坂46"
        case .keyaki: "欅坂46"
        case .nogi: "乃木坂46"
        }
    }

    var baseURL: URL {
        switch self {
        case .hinata: URL(string: "https://www.hinatazaka46.com")!
        case .sakura: URL(string: "https://sakurazaka46.com")!
        case .keyaki: URL(string: "https://www.keyakizaka46.com")!
        case .nogi: URL(string: "https://www.nogizaka46.com")!
        }
    }

    var officialURL: URL {
        switch self {
        case .hinata: URL(string: "https://www.hinatazaka46.com/s/official/?ima=0000")!
        case .sakura: URL(string: "https://sakurazaka46.com/s/s46/?ima=0335")!
        case .keyaki: URL(string: "https://www.keyakizaka46.com/s/k46o/diary/member?ima=0000")!
        case .nogi: URL(string: "https://sp.nogizaka46.com/")!
        }
    }

    var membersPath: String {
        switch self {
        case .hinata: "/s/official/diary/member/list?ima=0000"
        case .sakura: "/s/s46/diary/blog/list?ima=0000"
        case .keyaki: "/s/k46o/diary/member?ima=0000"
        case .nogi: "/s/n46/diary/MEMBER?ima=0000"
        }
    }

    func detailPath(id: String) -> String {
        switch self {
        case .hinata: "/s/official/diary/detail/\(id)?ima=0000&cd=member"
        case .sakura: "/s/s46/diary/detail/\(id)?ima=0000&cd=blog"
        case .keyaki: "/s/k46o/diary/detail/\(id)?ima=0000&cd=member"
        case .nogi: "/s/n46/diary/detail/\(id)?ima=0000&cd=MEMBER"
        }
    }

    var color: Color {
        switch self {
        case .hinata: Color(red: 0.486, green: 0.780, blue: 0.910)
        case .sakura: Color(red: 0.945, green: 0.616, blue: 0.710)
        case .keyaki: Color(red: 0.369, green: 0.725, blue: 0.329)
        case .nogi: Color(red: 0.506, green: 0.161, blue: 0.565)
        }
    }
}

struct BlogMember: Identifiable, Hashable {
    let id: String
    let name: String
    let updated: String
    let url: URL
}

struct BlogPost: Identifiable, Hashable {
    let id: String
    let title: String
    let date: String
    let memberID: String
    let memberName: String
    let sourcePage: Int
    let group: BlogGroup
    let url: URL
    let imageURL: URL?
}

struct ExportedFile: Identifiable {
    let url: URL
    var id: URL { url }
}
