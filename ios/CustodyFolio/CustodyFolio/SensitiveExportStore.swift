import Foundation

struct SensitiveExportStore {
    static let shared = SensitiveExportStore()

    private let fileManager: FileManager
    let directoryURL: URL

    init(
        fileManager: FileManager = .default,
        directoryURL: URL? = nil
    ) {
        self.fileManager = fileManager
        self.directoryURL = directoryURL ?? fileManager.temporaryDirectory
            .appendingPathComponent("CustodyFolioExports", isDirectory: true)
    }

    @discardableResult
    func purge() -> Bool {
        guard fileManager.fileExists(atPath: directoryURL.path) else { return true }

        do {
            try fileManager.removeItem(at: directoryURL)
            return true
        } catch {
            return false
        }
    }

    func write(_ data: Data, fileName: String) throws -> URL {
        guard let safeFileName = ExportSecurityPolicy.sanitizedFileName(fileName),
              safeFileName == fileName
        else {
            throw CocoaError(.fileWriteInvalidFileName)
        }

        try fileManager.createDirectory(
            at: directoryURL,
            withIntermediateDirectories: true,
            attributes: [.protectionKey: FileProtectionType.complete]
        )

        let fileURL = directoryURL.appendingPathComponent(safeFileName, isDirectory: false)
        try data.write(to: fileURL, options: [.atomic, .completeFileProtection])
        try fileManager.setAttributes(
            [.protectionKey: FileProtectionType.complete],
            ofItemAtPath: fileURL.path
        )
        return fileURL
    }

    func remove(_ fileURL: URL) {
        guard fileURL.deletingLastPathComponent().standardizedFileURL == directoryURL.standardizedFileURL else {
            return
        }

        try? fileManager.removeItem(at: fileURL)

        if (try? fileManager.contentsOfDirectory(atPath: directoryURL.path).isEmpty) == true {
            try? fileManager.removeItem(at: directoryURL)
        }
    }
}
