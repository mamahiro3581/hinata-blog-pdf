package com.mamahiro3581.sakamichiblogpdf.ui

import android.content.Context
import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Checkbox
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.mamahiro3581.sakamichiblogpdf.ads.AdBanner
import com.mamahiro3581.sakamichiblogpdf.ads.AdvertisingManager
import com.mamahiro3581.sakamichiblogpdf.data.BlogGroup
import com.mamahiro3581.sakamichiblogpdf.data.BlogMember
import com.mamahiro3581.sakamichiblogpdf.data.BlogPost
import kotlinx.coroutines.launch

@Composable
fun SakamichiBlogPdfApp(
    state: SakamichiAppState,
    advertisingManager: AdvertisingManager,
) {
    val primary = Color(state.group.colorArgb)
    val onPrimary = if (state.group == BlogGroup.Nogi) Color.White else Color(0xFF10202A)
    MaterialTheme(
        colorScheme = lightColorScheme(
            primary = primary,
            onPrimary = onPrimary,
            secondary = Color(0xFF59616D),
            background = Color(0xFFF6F8FA),
            surface = Color.White,
            onSurface = Color(0xFF20242A),
        ),
    ) {
        Surface(color = MaterialTheme.colorScheme.background) {
            SakamichiBlogPdfScreen(state, advertisingManager)
        }
    }
}

@Composable
private fun SakamichiBlogPdfScreen(
    state: SakamichiAppState,
    advertisingManager: AdvertisingManager,
) {
    val scope = rememberCoroutineScope()
    val context = LocalContext.current
    var memberDialogOpen by remember { mutableStateOf(false) }

    LaunchedEffect(Unit) {
        state.loadMembers()
    }

    Column(Modifier.fillMaxSize()) {
        LazyColumn(
            modifier = Modifier
                .weight(1f)
                .fillMaxWidth(),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            item {
                Header(
                    state = state,
                    onChangeGroup = { group -> scope.launch { state.changeGroup(group) } },
                    onOpenOfficial = { openUrl(context, state.group.officialUrl) },
                    onOpenPrivacyOptions = { advertisingManager.showPrivacyOptions() },
                    showPrivacyOptions = advertisingManager.privacyOptionsRequired,
                )
            }
            item {
                MemberPanel(
                    state = state,
                    onOpenMembers = { memberDialogOpen = true },
                    onFetchBlogs = { scope.launch { state.fetchBlogs() } },
                )
            }
            item {
                BlogToolbar(
                    state = state,
                    onSelectVisible = { state.selectAllVisibleBlogs() },
                    onClear = { state.clearSelectedBlogs() },
                )
            }
            item {
                Pagination(state)
            }
            if (state.blogs.isEmpty()) {
                item {
                    EmptyState(
                        if (state.isLoadingBlogs) {
                            "ブログを取得しています"
                        } else {
                            "メンバーを選んでブログを取得してください"
                        },
                    )
                }
            } else {
                items(state.currentPageBlogs, key = { it.id }) { blog ->
                    BlogRow(
                        blog = blog,
                        selected = state.selectedBlogIds.contains(blog.id),
                        enabled = !state.isBusy,
                        onToggle = { state.toggleBlog(blog) },
                    )
                }
            }
            item {
                Spacer(Modifier.height(8.dp))
            }
        }
        HorizontalDivider()
        ExportBar(
            state = state,
            onExport = { scope.launch { state.exportSelectedBlogs() } },
        )
        if (advertisingManager.canRequestAds) {
            AdBanner()
        }
    }

    if (memberDialogOpen) {
        MemberDialog(
            state = state,
            onDismiss = { memberDialogOpen = false },
        )
    }
}

@Composable
private fun Header(
    state: SakamichiAppState,
    onChangeGroup: (BlogGroup) -> Unit,
    onOpenOfficial: () -> Unit,
    onOpenPrivacyOptions: () -> Unit,
    showPrivacyOptions: Boolean,
) {
    var groupMenuOpen by remember { mutableStateOf(false) }
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .background(Color.White)
            .padding(horizontal = 16.dp, vertical = 18.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column {
                Text(
                    text = "OFFICIAL BLOG PDF",
                    color = MaterialTheme.colorScheme.primary,
                    fontSize = 11.sp,
                    fontWeight = FontWeight.Bold,
                )
                Text(
                    text = "Sakamichi Blog PDF",
                    fontSize = 24.sp,
                    fontWeight = FontWeight.Bold,
                )
            }
            if (state.isBusy) {
                CircularProgressIndicator(
                    modifier = Modifier.size(26.dp),
                    color = MaterialTheme.colorScheme.primary,
                    strokeWidth = 3.dp,
                )
            }
        }

        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Box {
                OutlinedButton(
                    onClick = { groupMenuOpen = true },
                    enabled = !state.isBusy,
                    shape = RoundedCornerShape(8.dp),
                ) {
                    Text(state.group.label)
                }
                DropdownMenu(
                    expanded = groupMenuOpen,
                    onDismissRequest = { groupMenuOpen = false },
                ) {
                    BlogGroup.values().forEach { group ->
                        DropdownMenuItem(
                            text = { Text(group.label) },
                            onClick = {
                                groupMenuOpen = false
                                onChangeGroup(group)
                            },
                        )
                    }
                }
            }
            OutlinedButton(
                onClick = onOpenOfficial,
                shape = RoundedCornerShape(8.dp),
            ) {
                Text("公式サイト")
            }
            if (showPrivacyOptions) {
                TextButton(onClick = onOpenPrivacyOptions) {
                    Text("広告設定")
                }
            }
        }

        Text(
            text = state.statusMessage,
            color = Color(0xFF58606C),
            fontSize = 13.sp,
        )
        state.errorMessage?.let {
            Text(
                text = it,
                color = Color(0xFFB3261E),
                fontSize = 13.sp,
            )
        }
    }
}

@Composable
private fun MemberPanel(
    state: SakamichiAppState,
    onOpenMembers: () -> Unit,
    onFetchBlogs: () -> Unit,
) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp),
        shape = RoundedCornerShape(8.dp),
        colors = CardDefaults.cardColors(containerColor = Color.White),
    ) {
        Column(
            modifier = Modifier.padding(14.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Text("メンバー", fontWeight = FontWeight.Bold, fontSize = 18.sp)
            OutlinedButton(
                modifier = Modifier.fillMaxWidth(),
                onClick = onOpenMembers,
                enabled = !state.isBusy && state.members.isNotEmpty(),
                shape = RoundedCornerShape(8.dp),
            ) {
                Text(
                    text = state.selectedMemberLabel,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
            Button(
                modifier = Modifier.fillMaxWidth(),
                onClick = onFetchBlogs,
                enabled = !state.isBusy && state.selectedMemberIds.isNotEmpty(),
                shape = RoundedCornerShape(8.dp),
            ) {
                Text("ブログ取得")
            }
        }
    }
}

@Composable
private fun BlogToolbar(
    state: SakamichiAppState,
    onSelectVisible: () -> Unit,
    onClear: () -> Unit,
) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp),
        shape = RoundedCornerShape(8.dp),
        colors = CardDefaults.cardColors(containerColor = Color.White),
    ) {
        Column(
            modifier = Modifier.padding(14.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Column {
                    Text("ブログ", fontWeight = FontWeight.Bold, fontSize = 18.sp)
                    Text(
                        "${state.blogs.size}件・${state.selectedBlogIds.size}件選択",
                        color = Color(0xFF66707C),
                        fontSize = 13.sp,
                    )
                }
                PageSizeSelector(state)
            }
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                OutlinedButton(
                    modifier = Modifier.weight(1f),
                    onClick = onSelectVisible,
                    enabled = !state.isBusy && state.blogs.isNotEmpty(),
                    shape = RoundedCornerShape(8.dp),
                ) {
                    Text("全選択")
                }
                OutlinedButton(
                    modifier = Modifier.weight(1f),
                    onClick = onClear,
                    enabled = !state.isBusy && state.selectedBlogIds.isNotEmpty(),
                    shape = RoundedCornerShape(8.dp),
                ) {
                    Text("解除")
                }
            }
        }
    }
}

@Composable
private fun ExportBar(
    state: SakamichiAppState,
    onExport: () -> Unit,
) {
    Surface(
        modifier = Modifier.fillMaxWidth(),
        color = Color.White,
        shadowElevation = 4.dp,
    ) {
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 16.dp, vertical = 10.dp),
        ) {
            Button(
                modifier = Modifier.fillMaxWidth(),
                onClick = onExport,
                enabled = !state.isBusy && state.selectedBlogIds.isNotEmpty(),
                shape = RoundedCornerShape(8.dp),
            ) {
                Text("選択PDF保存")
            }
        }
    }
}

@Composable
private fun PageSizeSelector(state: SakamichiAppState) {
    Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
        listOf(10, 30, 60).forEach { size ->
            val selected = state.blogPageSize == size
            if (selected) {
                Button(
                    onClick = { state.changeBlogPageSize(size) },
                    enabled = !state.isBusy,
                    shape = RoundedCornerShape(8.dp),
                    contentPadding = ButtonDefaults.ContentPadding,
                ) {
                    Text("${size}件")
                }
            } else {
                OutlinedButton(
                    onClick = { state.changeBlogPageSize(size) },
                    enabled = !state.isBusy,
                    shape = RoundedCornerShape(8.dp),
                ) {
                    Text("${size}件")
                }
            }
        }
    }
}

@Composable
private fun Pagination(state: SakamichiAppState) {
    if (state.blogs.size <= state.blogPageSize) {
        return
    }
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp)
            .horizontalScroll(rememberScrollState()),
        horizontalArrangement = Arrangement.spacedBy(6.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        OutlinedButton(
            onClick = { state.setBlogPage(state.currentBlogPage - 1) },
            enabled = !state.isBusy && state.currentBlogPage > 1,
            shape = RoundedCornerShape(8.dp),
        ) {
            Text("前へ")
        }
        for (page in 1..state.totalBlogPages) {
            if (page == state.currentBlogPage) {
                Button(
                    onClick = { state.setBlogPage(page) },
                    enabled = !state.isBusy,
                    shape = RoundedCornerShape(8.dp),
                ) {
                    Text(page.toString())
                }
            } else {
                OutlinedButton(
                    onClick = { state.setBlogPage(page) },
                    enabled = !state.isBusy,
                    shape = RoundedCornerShape(8.dp),
                ) {
                    Text(page.toString())
                }
            }
        }
        OutlinedButton(
            onClick = { state.setBlogPage(state.currentBlogPage + 1) },
            enabled = !state.isBusy && state.currentBlogPage < state.totalBlogPages,
            shape = RoundedCornerShape(8.dp),
        ) {
            Text("次へ")
        }
    }
}

@Composable
private fun BlogRow(
    blog: BlogPost,
    selected: Boolean,
    enabled: Boolean,
    onToggle: () -> Unit,
) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp)
            .clickable(enabled = enabled, onClick = onToggle),
        shape = RoundedCornerShape(8.dp),
        colors = CardDefaults.cardColors(containerColor = Color.White),
    ) {
        Row(
            modifier = Modifier.padding(12.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Checkbox(
                checked = selected,
                onCheckedChange = { onToggle() },
                enabled = enabled,
            )
            Spacer(Modifier.width(8.dp))
            Column(Modifier.weight(1f)) {
                Text(
                    text = blog.title.ifBlank { "無題" },
                    fontWeight = FontWeight.SemiBold,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                )
                Text(
                    text = listOf(blog.memberName, blog.date).filter { it.isNotBlank() }.joinToString(" / "),
                    color = Color(0xFF66707C),
                    fontSize = 13.sp,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
        }
    }
}

@Composable
private fun EmptyState(message: String) {
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp)
            .height(120.dp)
            .background(Color.White, RoundedCornerShape(8.dp)),
        contentAlignment = Alignment.Center,
    ) {
        Text(message, color = Color(0xFF66707C))
    }
}

@Composable
private fun MemberDialog(
    state: SakamichiAppState,
    onDismiss: () -> Unit,
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("メンバー選択") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                OutlinedTextField(
                    modifier = Modifier.fillMaxWidth(),
                    value = state.memberQuery,
                    onValueChange = { state.memberQuery = it },
                    label = { Text("検索") },
                    singleLine = true,
                    enabled = !state.isBusy,
                )
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedButton(
                        modifier = Modifier.weight(1f),
                        onClick = { state.selectFilteredMembers() },
                        enabled = !state.isBusy && state.filteredMembers.isNotEmpty(),
                        shape = RoundedCornerShape(8.dp),
                    ) {
                        Text("表示中を全選択")
                    }
                    OutlinedButton(
                        modifier = Modifier.weight(1f),
                        onClick = { state.clearMembers() },
                        enabled = !state.isBusy && state.selectedMemberIds.isNotEmpty(),
                        shape = RoundedCornerShape(8.dp),
                    ) {
                        Text("解除")
                    }
                }
                LazyColumn(
                    modifier = Modifier.heightIn(max = 360.dp),
                    verticalArrangement = Arrangement.spacedBy(2.dp),
                ) {
                    items(state.filteredMembers, key = { it.id }) { member ->
                        MemberRow(
                            member = member,
                            selected = state.selectedMemberIds.contains(member.id),
                            enabled = !state.isBusy,
                            onToggle = { state.toggleMember(member) },
                        )
                    }
                }
            }
        },
        confirmButton = {
            Button(onClick = onDismiss, shape = RoundedCornerShape(8.dp)) {
                Text("選択完了")
            }
        },
    )
}

@Composable
private fun MemberRow(
    member: BlogMember,
    selected: Boolean,
    enabled: Boolean,
    onToggle: () -> Unit,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(enabled = enabled, onClick = onToggle)
            .padding(vertical = 6.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Checkbox(
            checked = selected,
            onCheckedChange = { onToggle() },
            enabled = enabled,
        )
        Spacer(Modifier.width(8.dp))
        Column {
            Text(member.name.ifBlank { member.id }, fontWeight = FontWeight.SemiBold)
            if (member.updated.isNotBlank()) {
                Text(member.updated, color = Color(0xFF66707C), fontSize = 12.sp)
            }
        }
    }
}

private fun openUrl(context: Context, url: String) {
    runCatching {
        context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)))
    }
}
