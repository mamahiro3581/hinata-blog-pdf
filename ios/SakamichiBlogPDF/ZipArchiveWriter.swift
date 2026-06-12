import Foundation

final class ZipArchiveWriter {
    private struct Entry {
        let name: Data
        let crc32: UInt32
        let size: UInt32
        let offset: UInt32
        let time: UInt16
        let date: UInt16
    }

    private let fileHandle: FileHandle
    private let url: URL
    private var entries: [Entry] = []
    private var offset: UInt32 = 0
    private var isFinished = false

    init(url: URL) throws {
        self.url = url
        let manager = FileManager.default
        try? manager.removeItem(at: url)
        manager.createFile(atPath: url.path, contents: nil)
        fileHandle = try FileHandle(forWritingTo: url)
    }

    deinit {
        try? fileHandle.close()
    }

    func addFile(name: String, data: Data, date: Date = Date()) throws {
        precondition(!isFinished)
        let nameData = Data(name.utf8)
        let crc = CRC32.checksum(data)
        let size = UInt32(clamping: data.count)
        let stamp = zipDate(date)
        let localOffset = offset

        var header = Data()
        header.appendLE(UInt32(0x04034b50))
        header.appendLE(UInt16(20))
        header.appendLE(UInt16(0x0800))
        header.appendLE(UInt16(0))
        header.appendLE(stamp.time)
        header.appendLE(stamp.date)
        header.appendLE(crc)
        header.appendLE(size)
        header.appendLE(size)
        header.appendLE(UInt16(clamping: nameData.count))
        header.appendLE(UInt16(0))
        header.append(nameData)

        try write(header)
        try write(data)
        entries.append(
            Entry(
                name: nameData,
                crc32: crc,
                size: size,
                offset: localOffset,
                time: stamp.time,
                date: stamp.date
            )
        )
    }

    func finish() throws -> URL {
        precondition(!isFinished)
        isFinished = true
        let centralStart = offset

        for entry in entries {
            var header = Data()
            header.appendLE(UInt32(0x02014b50))
            header.appendLE(UInt16(20))
            header.appendLE(UInt16(20))
            header.appendLE(UInt16(0x0800))
            header.appendLE(UInt16(0))
            header.appendLE(entry.time)
            header.appendLE(entry.date)
            header.appendLE(entry.crc32)
            header.appendLE(entry.size)
            header.appendLE(entry.size)
            header.appendLE(UInt16(clamping: entry.name.count))
            header.appendLE(UInt16(0))
            header.appendLE(UInt16(0))
            header.appendLE(UInt16(0))
            header.appendLE(UInt16(0))
            header.appendLE(UInt32(0))
            header.appendLE(entry.offset)
            header.append(entry.name)
            try write(header)
        }

        let centralSize = offset - centralStart
        var footer = Data()
        footer.appendLE(UInt32(0x06054b50))
        footer.appendLE(UInt16(0))
        footer.appendLE(UInt16(0))
        footer.appendLE(UInt16(clamping: entries.count))
        footer.appendLE(UInt16(clamping: entries.count))
        footer.appendLE(centralSize)
        footer.appendLE(centralStart)
        footer.appendLE(UInt16(0))
        try write(footer)
        try fileHandle.close()
        return url
    }

    private func write(_ data: Data) throws {
        try fileHandle.write(contentsOf: data)
        offset += UInt32(clamping: data.count)
    }

    private func zipDate(_ date: Date) -> (time: UInt16, date: UInt16) {
        let calendar = Calendar(identifier: .gregorian)
        let components = calendar.dateComponents(
            [.year, .month, .day, .hour, .minute, .second],
            from: date
        )
        let year = max(1980, components.year ?? 1980)
        let month = components.month ?? 1
        let day = components.day ?? 1
        let hour = components.hour ?? 0
        let minute = components.minute ?? 0
        let second = components.second ?? 0
        let dosTime = UInt16((hour << 11) | (minute << 5) | (second / 2))
        let dosDate = UInt16(((year - 1980) << 9) | (month << 5) | day)
        return (dosTime, dosDate)
    }
}

private enum CRC32 {
    private static let table: [UInt32] = (0..<256).map { value in
        var crc = UInt32(value)
        for _ in 0..<8 {
            crc = (crc & 1) == 1 ? (crc >> 1) ^ 0xedb88320 : crc >> 1
        }
        return crc
    }

    static func checksum(_ data: Data) -> UInt32 {
        var crc = UInt32.max
        for byte in data {
            let index = Int((crc ^ UInt32(byte)) & 0xff)
            crc = table[index] ^ (crc >> 8)
        }
        return crc ^ UInt32.max
    }
}

private extension Data {
    mutating func appendLE<T: FixedWidthInteger>(_ value: T) {
        var littleEndian = value.littleEndian
        Swift.withUnsafeBytes(of: &littleEndian) { append(contentsOf: $0) }
    }
}
