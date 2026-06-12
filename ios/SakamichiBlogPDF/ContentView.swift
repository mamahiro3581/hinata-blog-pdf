import SwiftUI

struct ContentView: View {
    @StateObject private var model = AppViewModel()
    @EnvironmentObject private var advertising: AdvertisingManager

    var body: some View {
        NavigationStack {
            List {
                groupSection
                memberSection
                blogSection
            }
            .listStyle(.insetGrouped)
            .navigationTitle("Sakamichi Blog PDF")
            .toolbar { toolbarContent }
            .safeAreaInset(edge: .bottom) { bottomArea }
            .task { await model.loadMembers() }
            .alert(
                "処理できませんでした",
                isPresented: Binding(
                    get: { model.alertMessage != nil },
                    set: { if !$0 { model.alertMessage = nil } }
                )
            ) {
                Button("OK", role: .cancel) { model.alertMessage = nil }
            } message: {
                Text(model.alertMessage ?? "")
            }
            .sheet(item: $model.exportedFile) { file in
                ActivityView(activityItems: [file.url])
            }
        }
        .tint(model.group.color)
    }

    private var groupSection: some View {
        Section("グループ") {
            Picker("公式ブログ", selection: $model.group) {
                ForEach(BlogGroup.allCases) { group in
                    Text(group.label).tag(group)
                }
            }
            .pickerStyle(.menu)
            .disabled(model.isBusy)
            .onChange(of: model.group) {
                Task { await model.reloadForSelectedGroup() }
            }

            Link(destination: model.group.officialURL) {
                Label("公式サイトを開く", systemImage: "safari")
            }
        }
    }

    private var memberSection: some View {
        Section {
            HStack(spacing: 10) {
                Image(systemName: "magnifyingglass")
                    .foregroundStyle(.secondary)
                TextField("メンバーを検索", text: $model.memberSearch)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                if !model.memberSearch.isEmpty {
                    Button {
                        model.memberSearch = ""
                    } label: {
                        Image(systemName: "xmark.circle.fill")
                            .foregroundStyle(.secondary)
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("検索を消去")
                }
            }

            HStack {
                Button("表示中を全選択") {
                    model.selectAllFilteredMembers()
                }
                Spacer()
                Button("選択解除", role: .destructive) {
                    model.clearMembers()
                }
            }
            .font(.subheadline)

            if model.isLoadingMembers {
                HStack {
                    ProgressView()
                    Text("メンバーを取得中...")
                        .foregroundStyle(.secondary)
                }
            } else {
                ForEach(model.filteredMembers) { member in
                    Button {
                        model.toggleMember(member)
                    } label: {
                        HStack(spacing: 12) {
                            selectionIcon(model.selectedMemberIDs.contains(member.id))
                            VStack(alignment: .leading, spacing: 3) {
                                Text(member.name)
                                    .foregroundStyle(.primary)
                                if !member.updated.isEmpty {
                                    Text(member.updated)
                                        .font(.caption)
                                        .foregroundStyle(.secondary)
                                }
                            }
                            Spacer()
                        }
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                }
            }

            Button {
                Task { await model.fetchBlogs() }
            } label: {
                Label("ブログ取得", systemImage: "arrow.clockwise")
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.borderedProminent)
            .tint(model.group.color)
            .disabled(model.selectedMemberIDs.isEmpty || model.isBusy)
        } header: {
            HStack {
                Text("対象メンバー")
                Spacer()
                Text("\(model.selectedMemberIDs.count)名選択")
            }
        }
    }

    private var blogSection: some View {
        Section {
            if model.isLoadingBlogs {
                HStack {
                    ProgressView()
                    Text("全ブログを取得中...")
                        .foregroundStyle(.secondary)
                }
            } else if model.blogs.isEmpty {
                ContentUnavailableView(
                    "ブログ未取得",
                    systemImage: "doc.text.magnifyingglass",
                    description: Text("メンバーを選び、ブログ取得を押してください。")
                )
            } else {
                pageSizePicker

                HStack {
                    Button("表示中を全選択") {
                        model.selectAllVisibleBlogs()
                    }
                    Spacer()
                    Button("選択解除", role: .destructive) {
                        model.clearBlogs()
                    }
                }
                .font(.subheadline)

                ForEach(model.currentPageBlogs) { blog in
                    blogRow(blog)
                }

                pagination
            }
        } header: {
            HStack {
                Text("ブログ")
                Spacer()
                if !model.blogs.isEmpty {
                    Text("\(model.blogs.count)件・\(model.selectedBlogCount)件選択")
                }
            }
        }
    }

    private var pageSizePicker: some View {
        Picker("表示件数", selection: $model.pageSize) {
            Text("10件").tag(10)
            Text("30件").tag(30)
            Text("60件").tag(60)
        }
        .pickerStyle(.segmented)
        .onChange(of: model.pageSize) {
            model.moveToPage(1)
        }
    }

    private func blogRow(_ blog: BlogPost) -> some View {
        Button {
            model.toggleBlog(blog)
        } label: {
            HStack(alignment: .top, spacing: 12) {
                selectionIcon(model.selectedBlogIDs.contains(blog.id))
                    .padding(.top, 2)

                AsyncImage(url: blog.imageURL) { phase in
                    switch phase {
                    case let .success(image):
                        image.resizable().scaledToFill()
                    default:
                        ZStack {
                            Color(uiColor: .secondarySystemFill)
                            Image(systemName: "doc.text.image")
                                .foregroundStyle(.secondary)
                        }
                    }
                }
                .frame(width: 64, height: 64)
                .clipShape(RoundedRectangle(cornerRadius: 6))

                VStack(alignment: .leading, spacing: 4) {
                    Text(blog.title)
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(.primary)
                        .multilineTextAlignment(.leading)
                    Text([blog.date, blog.memberName].filter { !$0.isEmpty }.joined(separator: "  "))
                        .font(.caption)
                        .foregroundStyle(.secondary)
                    Link(destination: blog.url) {
                        Label("公式ページ", systemImage: "arrow.up.right.square")
                            .font(.caption)
                    }
                    .buttonStyle(.plain)
                }
                Spacer(minLength: 0)
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }

    private var pagination: some View {
        VStack(spacing: 8) {
            Text("\(model.currentPage) / \(model.totalPages)ページ")
                .font(.caption)
                .foregroundStyle(.secondary)

            ScrollView(.horizontal, showsIndicators: false) {
                LazyHStack(spacing: 8) {
                    Button {
                        model.moveToPage(model.currentPage - 1)
                    } label: {
                        Image(systemName: "chevron.left")
                    }
                    .disabled(model.currentPage == 1)
                    .accessibilityLabel("前のページ")

                    ForEach(1...model.totalPages, id: \.self) { page in
                        if page == model.currentPage {
                            Button("\(page)") {
                                model.moveToPage(page)
                            }
                            .buttonStyle(.borderedProminent)
                        } else {
                            Button("\(page)") {
                                model.moveToPage(page)
                            }
                            .buttonStyle(.bordered)
                        }
                    }

                    Button {
                        model.moveToPage(model.currentPage + 1)
                    } label: {
                        Image(systemName: "chevron.right")
                    }
                    .disabled(model.currentPage == model.totalPages)
                    .accessibilityLabel("次のページ")
                }
                .padding(.vertical, 2)
            }
        }
    }

    private var exportBar: some View {
        VStack(spacing: 8) {
            if model.isExporting {
                ProgressView(value: model.exportProgress)
                    .tint(model.group.color)
            }

            HStack(spacing: 12) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(model.statusMessage)
                        .font(.caption)
                        .lineLimit(2)
                    if model.selectedBlogCount > 0 {
                        Text("\(model.selectedBlogCount)件を保存")
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                    }
                }
                Spacer()
                Button {
                    Task { await model.exportSelectedBlogs() }
                } label: {
                    Label("選択PDF保存", systemImage: "square.and.arrow.down")
                }
                .buttonStyle(.borderedProminent)
                .tint(model.group.color)
                .disabled(model.selectedBlogCount == 0 || model.isBusy)
            }
        }
        .padding(.horizontal)
        .padding(.vertical, 10)
        .background(.regularMaterial)
    }

    private var bottomArea: some View {
        VStack(spacing: 0) {
            if advertising.canShowAds {
                AdBannerSlot()
            }
            exportBar
        }
    }

    @ToolbarContentBuilder
    private var toolbarContent: some ToolbarContent {
        ToolbarItem(placement: .topBarLeading) {
            Menu {
                Link(destination: AppLinks.privacyPolicy) {
                    Label("プライバシーポリシー", systemImage: "hand.raised")
                }

                Link(destination: AppLinks.support) {
                    Label("サポート", systemImage: "questionmark.circle")
                }

                if advertising.privacyOptionsRequired {
                    Button {
                        Task { await advertising.presentPrivacyOptions() }
                    } label: {
                        Label("広告のプライバシー設定", systemImage: "slider.horizontal.3")
                    }
                }
            } label: {
                Image(systemName: "ellipsis.circle")
            }
            .accessibilityLabel("アプリ情報")
        }

        ToolbarItem(placement: .topBarTrailing) {
            if model.isBusy {
                ProgressView()
            }
        }
    }

    private func selectionIcon(_ isSelected: Bool) -> some View {
        Image(systemName: isSelected ? "checkmark.circle.fill" : "circle")
            .font(.title3)
            .foregroundStyle(isSelected ? model.group.color : Color.secondary)
            .frame(width: 24, height: 24)
    }
}
